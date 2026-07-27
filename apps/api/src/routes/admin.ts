import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';
import type { AuthedRequest } from '../middleware/auth';

const router = Router();

import { config } from '../config';

const supabaseAdmin = createClient(config.supabaseUrl, config.supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const BUCKET = 'receipts';
/** Paket gratis Supabase: 1 GB penyimpanan. */
const BATAS_STORAGE_MB = 1024;

interface BerkasStruk {
  path: string;
  size: number;
  createdAt: string | null;
  owner: string;
}

/**
 * Menelusuri isi bucket sampai ke dalam folder.
 *
 * PENTING: versi lama memanggil list('') tanpa masuk ke subfolder. Karena semua
 * struk disimpan di dalam folder per-pengguna ({user_id}/namafile), yang
 * terbaca hanyalah daftar FOLDER — dan folder tidak punya metadata ukuran.
 * Akibatnya total penyimpanan SELALU 0 MB, berapa pun isinya.
 */
async function telusuriBucket(prefix = '', kedalaman = 0): Promise<BerkasStruk[]> {
  if (kedalaman > 3) return [];

  const { data, error } = await supabaseAdmin.storage
    .from(BUCKET)
    .list(prefix, { limit: 1000, sortBy: { column: 'name', order: 'asc' } });

  if (error) throw error;
  if (!data) return [];

  const hasil: BerkasStruk[] = [];
  for (const item of data) {
    const path = prefix ? `${prefix}/${item.name}` : item.name;
    // Entri tanpa id = folder, bukan berkas.
    if (item.id === null) {
      hasil.push(...(await telusuriBucket(path, kedalaman + 1)));
    } else {
      hasil.push({
        path,
        size: Number((item.metadata as any)?.size ?? 0),
        createdAt: item.created_at ?? null,
        owner: prefix.split('/')[0] || 'tanpa-pemilik',
      });
    }
  }
  return hasil;
}

/** Ringkasan penyimpanan, dipakai monitor realtime di panel admin. */
router.get('/storage', async (_req, res) => {
  try {
    const berkas = await telusuriBucket();
    const totalBytes = berkas.reduce((n, f) => n + f.size, 0);
    const totalMB = totalBytes / (1024 * 1024);

    const perPengguna = new Map<string, { bytes: number; jumlah: number }>();
    for (const f of berkas) {
      const k = perPengguna.get(f.owner) ?? { bytes: 0, jumlah: 0 };
      k.bytes += f.size;
      k.jumlah += 1;
      perPengguna.set(f.owner, k);
    }

    res.json({
      totalMB,
      totalBytes,
      totalFiles: berkas.length,
      limitMB: BATAS_STORAGE_MB,
      persen: Math.min((totalMB / BATAS_STORAGE_MB) * 100, 100),
      rataRataKB: berkas.length ? totalBytes / berkas.length / 1024 : 0,
      perPengguna: [...perPengguna.entries()]
        .map(([userId, v]) => ({ userId, ...v }))
        .sort((a, b) => b.bytes - a.bytes)
        .slice(0, 20),
      diperbaruiPada: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Gagal menghitung penyimpanan:', error);
    res.status(500).json({ error: 'Gagal menghitung penyimpanan' });
  }
});

/** Statistik ringkas seluruh sistem. */
router.get('/stats', async (_req, res) => {
  try {
    const hitung = async (tabel: string) => {
      const { count, error } = await supabaseAdmin
        .from(tabel)
        .select('*', { count: 'exact', head: true });
      if (error) throw error;
      return count ?? 0;
    };

    const [pengguna, dompet, transaksi, hutang, target] = await Promise.all([
      hitung('profiles'), hitung('wallets'), hitung('transactions'),
      hitung('debts'), hitung('saving_goals'),
    ]);

    const { data: agregat } = await supabaseAdmin
      .from('transactions')
      .select('type, amount')
      .limit(10000);

    let totalMasuk = 0;
    let totalKeluar = 0;
    for (const t of agregat ?? []) {
      if (t.type === 'income') totalMasuk += Number(t.amount) || 0;
      else if (t.type === 'expense') totalKeluar += Number(t.amount) || 0;
    }

    res.json({ pengguna, dompet, transaksi, hutang, target, totalMasuk, totalKeluar });
  } catch (error: any) {
    console.error('Gagal mengambil statistik:', error);
    res.status(500).json({ error: 'Gagal mengambil statistik' });
  }
});

/** Daftar pengguna beserta jumlah data masing-masing. */
router.get('/users', async (_req, res) => {
  try {
    const { data: profil, error } = await supabaseAdmin
      .from('profiles')
      .select('id, email, username, display_name, role, created_at')
      .order('created_at', { ascending: false });
    if (error) throw error;

    const { data: dompet } = await supabaseAdmin.from('wallets').select('user_id, balance');
    const { data: transaksi } = await supabaseAdmin.from('transactions').select('user_id');

    const saldo = new Map<string, number>();
    for (const w of dompet ?? []) {
      saldo.set(w.user_id, (saldo.get(w.user_id) ?? 0) + (Number(w.balance) || 0));
    }
    const jumlahTx = new Map<string, number>();
    for (const t of transaksi ?? []) {
      jumlahTx.set(t.user_id, (jumlahTx.get(t.user_id) ?? 0) + 1);
    }

    res.json((profil ?? []).map((p) => ({
      ...p,
      totalSaldo: saldo.get(p.id) ?? 0,
      jumlahTransaksi: jumlahTx.get(p.id) ?? 0,
    })));
  } catch (error: any) {
    console.error('Gagal memuat pengguna:', error);
    res.status(500).json({ error: 'Gagal memuat daftar pengguna' });
  }
});

/**
 * Data LENGKAP satu pengguna, untuk tampilan akordion bertingkat di panel admin.
 *
 * Dibuat karena ringkasan sebelumnya hanya menyajikan angka gabungan seluruh
 * pengguna — berguna untuk melihat kesehatan sistem, tapi tidak menjawab
 * "sebenarnya si A ini datanya seperti apa". Semua bagian diambil sekaligus
 * dalam satu permintaan supaya membuka satu pengguna tidak memicu 6 panggilan.
 */
router.get('/users/:userId/detail', async (req, res) => {
  const { userId } = req.params;

  try {
    const [profil, dompet, transaksi, hutang, target, anggaran, berulang] = await Promise.all([
      supabaseAdmin.from('profiles')
        .select('id, email, username, display_name, role, created_at')
        .eq('id', userId).maybeSingle(),
      supabaseAdmin.from('wallets')
        .select('id, name, balance, initial_balance, created_at')
        .eq('user_id', userId).order('created_at'),
      supabaseAdmin.from('transactions')
        .select('id, wallet_id, to_wallet_id, type, amount, category, title, receipt_url, created_at')
        .eq('user_id', userId).order('created_at', { ascending: false }).limit(200),
      supabaseAdmin.from('debts')
        .select('id, title, amount, due_date, type, status, created_at')
        .eq('user_id', userId).order('created_at', { ascending: false }),
      supabaseAdmin.from('saving_goals')
        .select('id, title, target_amount, current_amount, target_date, created_at')
        .eq('user_id', userId).order('created_at', { ascending: false }),
      supabaseAdmin.from('budgets')
        .select('id, category, amount_limit, period_month')
        .eq('user_id', userId).order('period_month', { ascending: false }),
      supabaseAdmin.from('recurring_transactions')
        .select('id, title, type, amount, category, interval_unit, interval_count, next_run, is_active')
        .eq('user_id', userId).order('next_run'),
    ]);

    if (profil.error) throw profil.error;
    if (!profil.data) return res.status(404).json({ error: 'Pengguna tidak ditemukan' });

    const daftarTx = transaksi.data ?? [];
    const masuk = daftarTx.filter((t) => t.type === 'income').reduce((n, t) => n + Number(t.amount || 0), 0);
    const keluar = daftarTx.filter((t) => t.type === 'expense').reduce((n, t) => n + Number(t.amount || 0), 0);

    // Pengeluaran per kategori, diurut dari yang terbesar.
    const perKategori = new Map<string, number>();
    for (const t of daftarTx) {
      if (t.type !== 'expense') continue;
      const k = t.category || 'Tanpa Kategori';
      perKategori.set(k, (perKategori.get(k) ?? 0) + Number(t.amount || 0));
    }

    // Pemakaian penyimpanan + DAFTAR FOTO milik pengguna ini.
    //
    // Bucket 'receipts' bersifat privat dan aturan keamanannya hanya mengizinkan
    // seseorang membuka folder miliknya sendiri. Karena itu tautan gambar dibuat
    // DI SERVER memakai kunci service_role, lalu dikirim sebagai URL bertanda
    // tangan berumur satu jam. Tanpa ini, panel admin hanya bisa menampilkan
    // nama berkas tanpa pernah bisa melihat isinya.
    let penyimpanan = { bytes: 0, jumlah: 0 };
    let galeri: Array<{ path: string; url: string | null; size: number; createdAt: string | null }> = [];
    try {
      const berkas = await telusuriBucket(userId);
      penyimpanan = { bytes: berkas.reduce((n, f) => n + f.size, 0), jumlah: berkas.length };

      if (berkas.length) {
        const { data: tanda } = await supabaseAdmin.storage
          .from(BUCKET)
          .createSignedUrls(berkas.map((f) => f.path), 3600);
        const petaUrl = new Map((tanda ?? []).map((t) => [t.path ?? '', t.signedUrl]));
        galeri = berkas
          .map((f) => ({
            path: f.path,
            url: petaUrl.get(f.path) ?? null,
            size: f.size,
            createdAt: f.createdAt,
          }))
          .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
      }
    } catch (e) {
      console.error('Gagal menyiapkan galeri pengguna:', e);
    }

    // Foto profil disimpan di bucket yang sama, jadi juga perlu ditandatangani.
    let avatarUrl: string | null = null;
    try {
      const { data: pref } = await supabaseAdmin
        .from('user_preferences').select('avatar_url').eq('user_id', userId).maybeSingle();
      if (pref?.avatar_url) {
        const { data: t } = await supabaseAdmin.storage
          .from(BUCKET).createSignedUrl(pref.avatar_url, 3600);
        avatarUrl = t?.signedUrl ?? null;
      }
    } catch { /* tanpa foto profil bukan masalah */ }

    res.json({
      profil: profil.data,
      avatarUrl,
      galeri,
      dompet: dompet.data ?? [],
      transaksi: daftarTx,
      hutang: hutang.data ?? [],
      target: target.data ?? [],
      anggaran: anggaran.data ?? [],
      berulang: berulang.data ?? [],
      ringkasan: {
        totalSaldo: (dompet.data ?? []).reduce((n, w) => n + Number(w.balance || 0), 0),
        masuk,
        keluar,
        selisih: masuk - keluar,
        jumlahTransaksi: daftarTx.length,
        hutangBelumLunas: (hutang.data ?? []).filter((d) => d.status === 'unpaid').length,
        perKategori: [...perKategori.entries()]
          .map(([kategori, total]) => ({ kategori, total }))
          .sort((a, b) => b.total - a.total),
        penyimpanan,
      },
    });
  } catch (error: any) {
    console.error('Gagal memuat detail pengguna:', error);
    res.status(500).json({ error: 'Gagal memuat detail pengguna' });
  }
});

/** Membuat akun baru. Kata sandi berasal dari admin yang mengetiknya di panel. */
router.post('/users', async (req, res) => {
  const { email, password, username, display_name, role, security_pin } = req.body ?? {};

  if (!email || !password) return res.status(400).json({ error: 'Email dan kata sandi wajib diisi' });
  if (String(password).length < 6) return res.status(400).json({ error: 'Kata sandi minimal 6 karakter' });
  if (role && !['user', 'admin'].includes(role)) return res.status(400).json({ error: 'Peran tidak valid' });
  if (security_pin && !/^\d{6}$/.test(String(security_pin))) {
    return res.status(400).json({ error: 'PIN harus 6 digit angka' });
  }

  try {
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      // Trigger handle_new_user() yang membuat profil + dompet, meng-hash PIN,
      // lalu menghapus PIN mentah dari metadata.
      user_metadata: {
        username: username || String(email).split('@')[0],
        display_name: display_name || 'Pengguna Baru',
        role: role || 'user',
        security_pin: security_pin || '123456',
      },
    });
    if (error) throw error;

    res.status(201).json({ success: true, userId: data.user?.id });
  } catch (error: any) {
    console.error('Gagal membuat pengguna:', error);
    res.status(400).json({ error: error?.message || 'Gagal membuat pengguna' });
  }
});

/** Mengubah profil pengguna (nama tampilan, username, peran). */
router.patch('/users/:userId', async (req: AuthedRequest, res) => {
  const { userId } = req.params;
  const { display_name, username, role } = req.body ?? {};

  if (role && !['user', 'admin'].includes(role)) {
    return res.status(400).json({ error: 'Peran tidak valid' });
  }
  // Jangan sampai admin terakhir menurunkan pangkatnya sendiri dan mengunci
  // semua orang di luar panel admin selamanya.
  if (role === 'user' && userId === req.userId) {
    return res.status(400).json({ error: 'Tidak bisa menurunkan peran akun sendiri' });
  }

  const perubahan: Record<string, unknown> = {};
  if (typeof display_name === 'string') perubahan.display_name = display_name.trim();
  if (typeof username === 'string' && username.trim()) perubahan.username = username.trim();
  if (role) perubahan.role = role;

  if (Object.keys(perubahan).length === 0) {
    return res.status(400).json({ error: 'Tidak ada yang diubah' });
  }

  try {
    const { error } = await supabaseAdmin.from('profiles').update(perubahan).eq('id', userId);
    if (error) throw error;
    res.json({ success: true });
  } catch (error: any) {
    console.error('Gagal memperbarui pengguna:', error);
    res.status(400).json({ error: error?.message || 'Gagal memperbarui pengguna' });
  }
});

/** Mengatur ulang PIN keamanan pengguna (di-hash oleh database). */
router.post('/users/:userId/reset-pin', async (req, res) => {
  const { userId } = req.params;
  const { pin } = req.body ?? {};
  if (!/^\d{6}$/.test(String(pin ?? ''))) {
    return res.status(400).json({ error: 'PIN harus 6 digit angka' });
  }

  try {
    const { error } = await supabaseAdmin.rpc('admin_set_pin', {
      p_user_id: userId,
      p_new_pin: String(pin),
    });
    if (error) throw error;
    res.json({ success: true });
  } catch (error: any) {
    console.error('Gagal mengatur ulang PIN:', error);
    res.status(400).json({ error: error?.message || 'Gagal mengatur ulang PIN' });
  }
});

router.delete('/users/:userId', async (req: AuthedRequest, res) => {
  const { userId } = req.params;

  // Penjaga wajib: tanpa ini, admin bisa menghapus akunnya sendiri saat login
  // dan langsung kehilangan akses ke panelnya.
  if (userId === req.userId) {
    return res.status(400).json({ error: 'Tidak bisa menghapus akun sendiri' });
  }

  try {
    // Bersihkan berkas struk milik pengguna dulu; menghapus baris database
    // tidak ikut menghapus file di penyimpanan, dan sisanya jadi sampah permanen.
    try {
      const berkas = await telusuriBucket(userId);
      if (berkas.length) {
        await supabaseAdmin.storage.from(BUCKET).remove(berkas.map((f) => f.path));
      }
    } catch (e) {
      console.error('Gagal membersihkan berkas pengguna (tetap dilanjutkan):', e);
    }

    const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (error) throw error;

    res.json({ success: true, message: 'Pengguna dan seluruh datanya berhasil dihapus.' });
  } catch (error: any) {
    console.error('Gagal menghapus pengguna:', error);
    res.status(400).json({ error: error?.message || 'Gagal menghapus pengguna' });
  }
});

export default router;
