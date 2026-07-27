import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent, ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  X, Camera, Trash2, Loader2, Check, AtSign, Mail, ShieldCheck,
  CalendarDays, Wallet, Receipt, Lock, Info,
} from 'lucide-react';
import Portal from './Portal';
import { supabase } from '../lib/supabase';
import { safeMutate, safeMutateOne, pesanError, PROFILE_COLUMNS } from '../lib/db';
import { unggahStruk, urlStruk } from '../lib/api';
import { compressImageDetail, TARGET_KB } from '../utils/imageCompressor';
import { useAuth } from '../lib/AuthProvider';
import { useFinanceStore } from '../store/useFinanceStore';
import type { Profile } from '../store/useFinanceStore';

interface Props {
  terbuka: boolean;
  onTutup: () => void;
}

/** Ringkasan jumlah baris milik pengguna. `null` = belum selesai dihitung. */
interface RingkasanAkun {
  dompet: number;
  transaksi: number;
}

async function idPengguna(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user?.id ?? null;
}

/**
 * Menghitung jumlah baris tanpa menarik isinya.
 *
 * `head: true` membuat server hanya mengembalikan angka — untuk akun dengan
 * ribuan transaksi, menarik seluruh barisnya cuma demi `.length` itu boros
 * kuota dan lambat di jaringan ponsel. Hasilnya ditunggu lebih dulu supaya
 * `count` bisa dibaca, lalu galatnya tetap dilewatkan ke safeMutate agar
 * penolakan aturan keamanan diterjemahkan dan dilempar seperti operasi lain.
 */
async function hitungBaris(tabel: string, uid: string, gagal: string): Promise<number> {
  const hasil = await supabase
    .from(tabel)
    .select('id', { count: 'exact', head: true })
    .eq('user_id', uid);

  await safeMutate<null>(Promise.resolve({ data: null, error: hasil.error }), gagal);
  return hasil.count ?? 0;
}

/** Ukuran berkas dalam satuan yang wajar dibaca orang, bukan deretan angka byte. */
function formatUkuran(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

/** Tanggal dari database bisa kosong atau rusak; layar tidak boleh ikut rusak karenanya. */
function formatTanggal(iso: string | null | undefined): string {
  if (!iso) return 'Tidak diketahui';
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return 'Tidak diketahui';
  return t.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
}

export default function ProfileSheet({ terbuka, onTutup }: Props) {
  const { profile: profilAuth, session } = useAuth();
  const profilStore = useFinanceStore((s) => s.profile);
  const setProfileDiStore = useFinanceStore((s) => s.setProfile);

  // Store lebih dulu: nama yang baru disimpan langsung masuk ke sana, sedangkan
  // salinan milik AuthProvider baru ikut segar setelah sesi dimuat ulang.
  const profil = profilStore ?? profilAuth;

  const [nama, setNama] = useState('');
  const [menyimpanNama, setMenyimpanNama] = useState(false);

  const [avatarPath, setAvatarPath] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [sedangUnggah, setSedangUnggah] = useState(false);
  const [sedangHapusFoto, setSedangHapusFoto] = useState(false);
  const [infoKompresi, setInfoKompresi] = useState<string | null>(null);
  const [kompresiMelesetKB, setKompresiMelesetKB] = useState(false);

  const [ringkasan, setRingkasan] = useState<RingkasanAkun | null>(null);
  const [memuat, setMemuat] = useState(true);

  // Layar lebar memakai animasi mengembang di tengah, layar sempit memakai
  // lembar yang naik dari bawah — keduanya hanya menggerakkan transform/opacity.
  const [layarLebar, setLayarLebar] = useState(false);

  const inputFoto = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const media = window.matchMedia('(min-width: 640px)');
    const terapkan = () => setLayarLebar(media.matches);
    terapkan();
    media.addEventListener('change', terapkan);
    return () => media.removeEventListener('change', terapkan);
  }, []);

  // Isi kolom nama disamakan lagi setiap lembar dibuka, supaya ketikan yang
  // sempat dibatalkan tidak tertinggal saat lembar dibuka berikutnya.
  useEffect(() => {
    if (!terbuka) return;
    setNama(profil?.display_name ?? '');
  }, [terbuka, profil?.display_name]);

  // Data yang tidak ada di store (foto + jumlah baris) diambil saat lembar dibuka,
  // bukan saat komponen dipasang — kalau tidak, setiap halaman yang memasang
  // lembar ini akan menembak database walaupun penggunanya tidak pernah membukanya.
  useEffect(() => {
    if (!terbuka) return;
    let batal = false;

    setMemuat(true);
    setInfoKompresi(null);
    setKompresiMelesetKB(false);

    (async () => {
      try {
        const uid = await idPengguna();
        if (!uid) throw new Error('Sesi kamu sudah berakhir. Silakan masuk ulang.');

        const rows = await safeMutate<{ avatar_url: string | null }[]>(
          supabase.from('user_preferences').select('avatar_url').eq('user_id', uid).limit(1),
          'Gagal memuat foto profil',
        );
        if (batal) return;
        const path = rows?.[0]?.avatar_url;
        setAvatarPath(typeof path === 'string' && path ? path : null);

        const [dompet, transaksi] = await Promise.all([
          hitungBaris('wallets', uid, 'Gagal menghitung dompet'),
          hitungBaris('transactions', uid, 'Gagal menghitung transaksi'),
        ]);
        if (batal) return;
        setRingkasan({ dompet, transaksi });
      } catch (e) {
        if (!batal) toast.error(pesanError(e, 'Gagal memuat data profil'));
      } finally {
        if (!batal) setMemuat(false);
      }
    })();

    return () => {
      batal = true;
    };
  }, [terbuka]);

  // Bucket 'receipts' privat, jadi foto hanya bisa ditampilkan lewat tautan
  // bertanda tangan yang masa berlakunya terbatas — bukan URL tetap.
  useEffect(() => {
    let batal = false;
    if (!avatarPath) {
      setAvatarUrl(null);
      return;
    }
    (async () => {
      const url = await urlStruk(avatarPath);
      if (!batal) setAvatarUrl(url);
    })();
    return () => {
      batal = true;
    };
  }, [avatarPath]);

  const sibuk = sedangUnggah || sedangHapusFoto || menyimpanNama;

  // Tombol Esc ditutup hanya kalau tidak ada proses berjalan: menutup lembar di
  // tengah unggahan membuat pengguna mengira fotonya batal, padahal tetap terkirim.
  useEffect(() => {
    if (!terbuka) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !sibuk) onTutup();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [terbuka, sibuk, onTutup]);

  /**
   * Menyegarkan profil di store supaya header ikut berubah tanpa muat ulang halaman.
   * Store hanya menyimpan kolom tabel `profiles` (tidak ada foto di dalamnya), jadi
   * untuk perubahan foto yang dibutuhkan cuma salinan objek baru sebagai pemicu render.
   */
  const segarkanHeader = useCallback(
    (baru?: Profile) => {
      if (baru) {
        setProfileDiStore(baru);
        return;
      }
      if (profil) setProfileDiStore({ ...profil });
    },
    [profil, setProfileDiStore],
  );

  const simpanNama = async (e: FormEvent) => {
    e.preventDefault();
    const bersih = nama.trim();
    if (!bersih) {
      toast.error('Nama tampilan tidak boleh kosong');
      return;
    }
    if (bersih.length > 50) {
      toast.error('Nama tampilan maksimal 50 karakter');
      return;
    }
    if (bersih === (profil?.display_name ?? '')) {
      toast.error('Nama tampilan belum berubah');
      return;
    }

    setMenyimpanNama(true);
    const id = toast.loading('Menyimpan nama…');
    try {
      const uid = await idPengguna();
      if (!uid) throw new Error('Sesi kamu sudah berakhir. Silakan masuk ulang.');

      // Hanya display_name yang dikirim: izin kolom lain sudah dicabut di database,
      // jadi menyertakannya membuat seluruh permintaan ditolak.
      // `.select()` dipakai supaya baris hasil yang benar-benar tersimpan yang
      // masuk ke store, bukan tebakan dari sisi klien.
      const baris = await safeMutateOne<Profile>(
        supabase
          .from('profiles')
          .update({ display_name: bersih })
          .eq('id', uid)
          .select(PROFILE_COLUMNS),
        'Gagal menyimpan nama tampilan',
      );

      segarkanHeader(baris);
      toast.success('Nama tampilan diperbarui', { id });
    } catch (err) {
      toast.error(pesanError(err, 'Gagal menyimpan nama tampilan'), { id });
    } finally {
      setMenyimpanNama(false);
    }
  };

  const gantiFoto = async (e: ChangeEvent<HTMLInputElement>) => {
    const berkas = e.target.files?.[0];
    // Nilai input dikosongkan lebih dulu supaya memilih foto yang SAMA dua kali
    // tetap memicu onChange (peramban menganggap nilainya tidak berubah).
    e.target.value = '';
    if (!berkas) return;
    if (sedangUnggah || sedangHapusFoto) return;

    if (!berkas.type.startsWith('image/')) {
      toast.error('Berkas yang dipilih bukan gambar');
      return;
    }

    setSedangUnggah(true);
    setInfoKompresi(null);
    setKompresiMelesetKB(false);
    const id = toast.loading('Memadatkan foto…');
    try {
      const hasil = await compressImageDetail(berkas);
      const ringkas = `${formatUkuran(hasil.bytesAsli)} -> ${formatUkuran(hasil.bytesAkhir)}`;

      toast.loading(`Mengunggah foto (${ringkas})…`, { id });
      const path = await unggahStruk(hasil.file);
      if (!path) throw new Error('Foto gagal diunggah ke penyimpanan. Coba lagi.');

      const uid = await idPengguna();
      if (!uid) throw new Error('Sesi kamu sudah berakhir. Silakan masuk ulang.');

      // Hanya user_id dan avatar_url yang dikirim. Mengirim seluruh kolom akan
      // menimpa tema, ukuran huruf, dan pengingat dengan nilai bawaan yang
      // kebetulan ada di layar ini.
      await safeMutate(
        supabase.from('user_preferences').upsert(
          { user_id: uid, avatar_url: path, updated_at: new Date().toISOString() },
          { onConflict: 'user_id' },
        ),
        'Gagal menyimpan foto profil',
      );

      setAvatarPath(path);
      setInfoKompresi(ringkas);
      setKompresiMelesetKB(hasil.masihBesar);
      segarkanHeader();
      toast.success(`Foto profil diperbarui (${ringkas})`, { id });
    } catch (err) {
      toast.error(pesanError(err, 'Gagal mengganti foto profil'), { id });
    } finally {
      setSedangUnggah(false);
    }
  };

  const hapusFoto = async () => {
    if (!avatarPath || sedangUnggah || sedangHapusFoto) return;

    const lama = avatarPath;
    setSedangHapusFoto(true);
    const id = toast.loading('Menghapus foto…');
    try {
      const uid = await idPengguna();
      if (!uid) throw new Error('Sesi kamu sudah berakhir. Silakan masuk ulang.');

      await safeMutate(
        supabase.from('user_preferences').upsert(
          { user_id: uid, avatar_url: null, updated_at: new Date().toISOString() },
          { onConflict: 'user_id' },
        ),
        'Gagal menghapus foto profil',
      );

      // Berkasnya baru dibuang SETELAH tautannya lepas dari profil. Kalau urutannya
      // dibalik dan pembaruan gagal, profil akan menunjuk ke berkas yang tidak ada.
      // Kegagalan di sini sengaja tidak digagalkan ke pengguna: bagi mereka fotonya
      // sudah hilang, sisa berkas yatim cukup jadi urusan catatan konsol.
      const { error } = await supabase.storage.from('receipts').remove([lama]);
      if (error) console.error('[STORAGE] berkas foto lama gagal dihapus', error);

      setAvatarPath(null);
      setInfoKompresi(null);
      setKompresiMelesetKB(false);
      segarkanHeader();
      toast.success('Foto profil dihapus', { id });
    } catch (err) {
      toast.error(pesanError(err, 'Gagal menghapus foto profil'), { id });
    } finally {
      setSedangHapusFoto(false);
    }
  };

  const namaTampil = profil?.display_name || profil?.username || 'Pengguna';
  const email = profil?.email || session?.user?.email || 'Tidak diketahui';
  const inisial = useMemo(() => {
    const sumber = (profil?.display_name || profil?.username || email || '').trim();
    return sumber ? sumber.charAt(0).toUpperCase() : '?';
  }, [profil?.display_name, profil?.username, email]);

  const namaBerubah = nama.trim() !== (profil?.display_name ?? '') && nama.trim().length > 0;

  const panel = layarLebar
    ? { initial: { opacity: 0, scale: 0.94 }, animate: { opacity: 1, scale: 1 }, exit: { opacity: 0, scale: 0.94 } }
    : { initial: { opacity: 0, y: 40 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: 40 } };

  return (
    <Portal>
      <AnimatePresence>
        {terbuka && (
          <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center sm:p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !sibuk && onTutup()}
              className="absolute inset-0 bg-ink-950/70 backdrop-blur-md"
            />

            <motion.div
              initial={panel.initial}
              animate={panel.animate}
              exit={panel.exit}
              transition={{ type: 'spring', damping: 22, stiffness: 110 }}
              role="dialog"
              aria-modal="true"
              aria-labelledby="judul-profil"
              className="glass-strong relative z-[61] w-full sm:max-w-lg rounded-t-4xl sm:rounded-4xl
                         max-h-[90dvh] sm:max-h-[85dvh] overflow-y-auto thin-scrollbar
                         px-5 pt-5 sm:p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))]"
            >
              {/* Pegangan khas lembar: penanda visual bahwa panel ini datang dari bawah. */}
              <div className="sm:hidden w-12 h-1.5 rounded-full bg-white/25 mx-auto mb-4" />

              <button
                type="button"
                onClick={() => !sibuk && onTutup()}
                aria-label="Tutup profil"
                className="icon-btn absolute top-3 right-3 sm:top-4 sm:right-4"
              >
                <X size={20} />
              </button>

              <h2 id="judul-profil" className="text-xl font-bold text-white pr-12">
                Profil Saya
              </h2>
              <p className="text-white/70 text-sm mt-1">
                Atur foto dan nama yang tampil di seluruh aplikasi.
              </p>

              {/* ---------- Foto profil ---------- */}
              <section className="flex flex-col items-center mt-6">
                <div className="relative">
                  <div
                    className="w-28 h-28 rounded-full overflow-hidden border border-white/20 shadow-glass
                               bg-gradient-to-br from-brand-500 to-accent-600 flex items-center justify-center"
                  >
                    {avatarUrl ? (
                      <img
                        src={avatarUrl}
                        alt={`Foto profil ${namaTampil}`}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="text-4xl font-extrabold text-white select-none">{inisial}</span>
                    )}
                  </div>

                  {(sedangUnggah || sedangHapusFoto) && (
                    <div className="absolute inset-0 rounded-full bg-ink-950/70 flex items-center justify-center">
                      <Loader2 size={26} className="animate-spin text-brand-300" />
                    </div>
                  )}
                </div>

                <p className="text-white font-bold text-lg mt-3 text-center break-words max-w-full">
                  {namaTampil}
                </p>

                <input
                  ref={inputFoto}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={gantiFoto}
                />

                <div className="flex flex-wrap gap-3 justify-center mt-4 w-full">
                  <button
                    type="button"
                    onClick={() => inputFoto.current?.click()}
                    disabled={sedangUnggah || sedangHapusFoto}
                    className="btn-primary flex-1 min-w-[9rem]"
                  >
                    {sedangUnggah ? <Loader2 size={18} className="animate-spin" /> : <Camera size={18} />}
                    {sedangUnggah ? 'Mengunggah…' : 'Ganti Foto'}
                  </button>

                  {avatarPath && (
                    <button
                      type="button"
                      onClick={hapusFoto}
                      disabled={sedangUnggah || sedangHapusFoto}
                      className="btn-danger flex-1 min-w-[9rem]"
                    >
                      {sedangHapusFoto ? <Loader2 size={18} className="animate-spin" /> : <Trash2 size={18} />}
                      Hapus Foto
                    </button>
                  )}
                </div>

                <p className="text-white/70 text-micro text-center mt-3">
                  Foto otomatis diperkecil sampai maksimal {TARGET_KB} KB sebelum diunggah,
                  lalu disimpan di penyimpanan pribadi kamu.
                </p>

                {infoKompresi && (
                  <div className="glass rounded-2xl px-4 py-3 mt-3 w-full text-center">
                    <p className="text-white text-sm font-semibold" data-selectable>
                      {infoKompresi}
                    </p>
                    <p className={`text-micro mt-1 ${kompresiMelesetKB ? 'text-warn-400' : 'text-white/70'}`}>
                      {kompresiMelesetKB
                        ? `Sudah dikecilkan semaksimal mungkin, tapi masih di atas ${TARGET_KB} KB.`
                        : 'Ukuran sebelum dan sesudah dipadatkan.'}
                    </p>
                  </div>
                )}
              </section>

              {/* ---------- Nama tampilan ---------- */}
              <form onSubmit={simpanNama} className="mt-6">
                <label className="label" htmlFor="nama-tampilan">
                  Nama Tampilan
                </label>
                <div className="flex gap-3">
                  <input
                    id="nama-tampilan"
                    type="text"
                    value={nama}
                    maxLength={50}
                    autoComplete="name"
                    placeholder="Contoh: Vadly"
                    onChange={(ev) => setNama(ev.target.value)}
                    disabled={menyimpanNama}
                    className="field flex-1"
                  />
                  <button
                    type="submit"
                    disabled={!namaBerubah || menyimpanNama}
                    className="btn-primary shrink-0"
                  >
                    {menyimpanNama ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
                    Simpan
                  </button>
                </div>
                <p className="text-white/70 text-micro mt-2 ml-1">
                  Nama ini yang muncul di sapaan beranda dan menu samping.
                </p>
              </form>

              {/* ---------- Data akun (hanya baca) ---------- */}
              <section className="mt-6 space-y-2">
                <h3 className="label mb-2">Data Akun</h3>

                <BarisData ikon={<AtSign size={18} />} label="Username" nilai={profil?.username || 'Belum diatur'} />
                <BarisData ikon={<Mail size={18} />} label="Email" nilai={email} />
                <BarisData
                  ikon={<ShieldCheck size={18} />}
                  label="Peran"
                  nilai={profil?.role === 'admin' ? 'Admin' : 'Pengguna'}
                />
                <BarisData
                  ikon={<CalendarDays size={18} />}
                  label="Bergabung"
                  nilai={formatTanggal(profil?.created_at)}
                />

                <div className="glass rounded-2xl p-3 flex items-start gap-3">
                  <Lock size={18} className="text-white/70 shrink-0 mt-0.5" />
                  <p className="text-white/80 text-sm">
                    Username dan email dikunci dari sisi aplikasi karena keduanya dipakai untuk masuk
                    dan memulihkan akun. Kalau ada yang salah, hubungi admin — hanya nama tampilan
                    yang boleh kamu ubah sendiri.
                  </p>
                </div>
              </section>

              {/* ---------- Ringkasan akun ---------- */}
              <section className="mt-6">
                <h3 className="label mb-2">Ringkasan Akun</h3>
                {memuat ? (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="skeleton h-20 rounded-2xl" />
                    <div className="skeleton h-20 rounded-2xl" />
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <KotakAngka
                      ikon={<Wallet size={18} />}
                      label="Dompet"
                      angka={ringkasan?.dompet ?? 0}
                    />
                    <KotakAngka
                      ikon={<Receipt size={18} />}
                      label="Transaksi"
                      angka={ringkasan?.transaksi ?? 0}
                    />
                  </div>
                )}
                <p className="text-white/70 text-micro mt-2 ml-1 flex items-start gap-1.5">
                  <Info size={14} className="shrink-0 mt-0.5" />
                  Angka dihitung langsung dari database, jadi selalu sama dengan data aslinya.
                </p>
              </section>

              <button type="button" onClick={onTutup} disabled={sibuk} className="btn-ghost w-full mt-6">
                Tutup
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </Portal>
  );
}

/* ---------- bagian kecil yang dipakai ulang di dalam lembar ---------- */

function BarisData({ ikon, label, nilai }: { ikon: ReactNode; label: string; nilai: string }) {
  return (
    <div className="glass rounded-2xl px-4 py-3 flex items-center gap-3 min-h-[44px]">
      <span className="text-brand-300 shrink-0">{ikon}</span>
      <span className="text-white/70 text-sm shrink-0">{label}</span>
      {/* `data-selectable` supaya email dan username tetap bisa disalin: teks UI
          lainnya sengaja tidak bisa diseleksi agar terasa seperti aplikasi. */}
      <span className="text-white text-sm font-semibold ml-auto text-right break-all" data-selectable>
        {nilai}
      </span>
    </div>
  );
}

function KotakAngka({ ikon, label, angka }: { ikon: ReactNode; label: string; angka: number }) {
  return (
    <div className="glass rounded-2xl p-4 flex flex-col items-center justify-center gap-1">
      <span className="text-brand-300">{ikon}</span>
      <span className="text-white text-2xl font-extrabold leading-none">
        {new Intl.NumberFormat('id-ID').format(angka)}
      </span>
      <span className="text-white/70 text-micro font-semibold uppercase tracking-wider">{label}</span>
    </div>
  );
}
