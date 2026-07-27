import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Repeat, Plus, X, Save, Play, Pause, Pencil, Trash2, Zap,
  CalendarClock, History, AlertTriangle, Wallet as IkonDompet,
  ArrowDownLeft, ArrowUpRight,
} from 'lucide-react';
import {
  addDays, addWeeks, addMonths, parseISO, isValid, startOfDay,
  format, differenceInCalendarDays,
} from 'date-fns';
import toast from 'react-hot-toast';
import Portal from '../components/Portal';
import { supabase } from '../lib/supabase';
import { useFinanceStore } from '../store/useFinanceStore';
import { safeMutate, pesanError } from '../lib/db';

type Satuan = 'day' | 'week' | 'month';
type TipeJadwal = 'income' | 'expense';

interface Jadwal {
  id: string;
  user_id: string;
  wallet_id: string;
  type: TipeJadwal;
  amount: number;
  category: string | null;
  title: string;
  interval_unit: Satuan;
  interval_count: number;
  next_run: string | null;
  last_run: string | null;
  is_active: boolean;
  created_at: string;
}

interface FormJadwal {
  title: string;
  wallet_id: string;
  type: TipeJadwal;
  amount: string;
  category: string;
  interval_count: string;
  interval_unit: Satuan;
  next_run: string;
  is_active: boolean;
}

const NAMA_SATUAN: Record<Satuan, string> = {
  day: 'hari',
  week: 'minggu',
  month: 'bulan',
};

const SARAN_KATEGORI = [
  'Gaji', 'Tagihan', 'Langganan', 'Sewa', 'Cicilan', 'Transportasi', 'Makanan',
];

/** Kolom `date` di Postgres dibaca/ditulis sebagai 'YYYY-MM-DD' murni tanpa jam. */
const KUNCI_TANGGAL = 'yyyy-MM-dd';

const rupiah = (nilai: number) =>
  new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(Number.isFinite(nilai) ? nilai : 0);

/**
 * parseISO, bukan `new Date(teks)`: untuk teks tanggal polos seperti '2026-07-27'
 * konstruktor bawaan menganggapnya UTC tengah malam, sehingga di zona waktu barat
 * tanggalnya mundur satu hari dan jadwal terlihat jatuh tempo sehari lebih cepat.
 */
function bacaTanggal(teks: string | null): Date | null {
  if (!teks) return null;
  const tanggal = parseISO(teks);
  return isValid(tanggal) ? tanggal : null;
}

const tampilTanggal = (tanggal: Date) =>
  tanggal.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });

/**
 * Menghitung tanggal jalan berikutnya di sisi klien.
 *
 * Melompat berulang sampai melewati hari ini, bukan sekali saja: jadwal yang
 * terlambat tiga bulan akan tetap berstatus jatuh tempo setelah satu lompatan,
 * sehingga tombol "Jalankan Sekarang" bisa ditekan berkali-kali dan membuat
 * transaksi ganda. Batas 500 putaran menjaga dari data rusak yang tidak masuk akal.
 */
function tanggalBerikutnya(dari: Date, satuan: Satuan, kelipatan: number): string {
  // Kelipatan 0 atau negatif membuat perulangan tidak pernah maju — kunci ke minimal 1.
  const langkah = Math.max(1, Math.trunc(kelipatan) || 1);
  const hariIni = startOfDay(new Date());
  let hasil = dari;
  let putaran = 0;

  do {
    hasil =
      satuan === 'day' ? addDays(hasil, langkah)
        : satuan === 'week' ? addWeeks(hasil, langkah)
          : addMonths(hasil, langkah);
    putaran += 1;
  } while (hasil <= hariIni && putaran < 500);

  return format(hasil, KUNCI_TANGGAL);
}

const formKosong = (walletId: string): FormJadwal => ({
  title: '',
  wallet_id: walletId,
  type: 'expense',
  amount: '',
  category: '',
  interval_count: '1',
  interval_unit: 'month',
  next_run: format(new Date(), KUNCI_TANGGAL),
  is_active: true,
});

export default function Recurring() {
  const { wallets, fetchWallets, fetchTransactions } = useFinanceStore();

  const [jadwals, setJadwals] = useState<Jadwal[]>([]);
  const [sedangMemuat, setSedangMemuat] = useState(true);
  const [formTerbuka, setFormTerbuka] = useState(false);
  const [idDiubah, setIdDiubah] = useState<string | null>(null);
  const [menyimpan, setMenyimpan] = useState(false);
  // Menyimpan id baris yang sedang diproses supaya tombolnya bisa dikunci —
  // ketukan beruntun pada "Jalankan Sekarang" membuat transaksi dobel.
  const [idSibuk, setIdSibuk] = useState<string | null>(null);
  const [form, setForm] = useState<FormJadwal>(() => formKosong(''));

  useEffect(() => {
    muatJadwal();
    // wallets bernilai null berarti belum pernah dimuat sama sekali (mis. halaman
    // ini dibuka langsung lewat URL), bukan berarti pengguna tidak punya dompet.
    if (wallets === null) fetchWallets();
  }, []);

  const namaDompet = useMemo(() => {
    const peta = new Map<string, string>();
    (wallets ?? []).forEach((w) => peta.set(w.id, w.name));
    return peta;
  }, [wallets]);

  const daftarDompet = wallets ?? [];

  const jumlahJatuhTempo = useMemo(
    () =>
      jadwals.filter((j) => {
        if (!j.is_active) return false;
        const tanggal = bacaTanggal(j.next_run);
        if (!tanggal) return false;
        return differenceInCalendarDays(tanggal, startOfDay(new Date())) <= 0;
      }).length,
    [jadwals],
  );

  async function muatJadwal() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setJadwals([]);
        return;
      }
      const data = await safeMutate<Jadwal[]>(
        supabase
          .from('recurring_transactions')
          .select('*')
          .eq('user_id', user.id)
          .order('is_active', { ascending: false })
          .order('next_run', { ascending: true }),
        'Gagal memuat jadwal',
      );
      setJadwals(data ?? []);
    } catch (error) {
      toast.error(pesanError(error, 'Gagal memuat jadwal'));
      setJadwals([]);
    } finally {
      setSedangMemuat(false);
    }
  }

  const bukaTambah = () => {
    if (daftarDompet.length === 0) {
      toast.error('Buat dompet dulu di halaman Pengaturan');
      return;
    }
    setIdDiubah(null);
    setForm(formKosong(daftarDompet[0].id));
    setFormTerbuka(true);
  };

  const bukaUbah = (baris: Jadwal) => {
    setIdDiubah(baris.id);
    setForm({
      title: baris.title ?? '',
      wallet_id: baris.wallet_id ?? '',
      type: baris.type === 'income' ? 'income' : 'expense',
      amount: String(baris.amount ?? ''),
      category: baris.category ?? '',
      interval_count: String(baris.interval_count ?? 1),
      interval_unit: baris.interval_unit ?? 'month',
      next_run: baris.next_run ?? format(new Date(), KUNCI_TANGGAL),
      is_active: baris.is_active !== false,
    });
    setFormTerbuka(true);
  };

  const simpanJadwal = async (e: FormEvent) => {
    e.preventDefault();

    const judul = form.title.trim();
    const nominal = Number(form.amount);
    const kelipatan = Number(form.interval_count);
    const mulai = bacaTanggal(form.next_run);

    if (!judul) {
      toast.error('Judul jadwal belum diisi');
      return;
    }
    if (!form.wallet_id) {
      toast.error('Pilih dompet dulu');
      return;
    }
    if (!Number.isFinite(nominal) || nominal <= 0) {
      toast.error('Nominal harus lebih besar dari nol');
      return;
    }
    if (!Number.isFinite(kelipatan) || kelipatan < 1) {
      toast.error('Pengulangan minimal 1');
      return;
    }
    if (!mulai) {
      toast.error('Tanggal jalan berikutnya tidak valid');
      return;
    }

    setMenyimpan(true);
    const toastId = toast.loading(idDiubah ? 'Menyimpan perubahan...' : 'Menyimpan jadwal...');
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Sesi berakhir. Silakan masuk ulang.');

      const isi = {
        wallet_id: form.wallet_id,
        type: form.type,
        amount: nominal,
        category: form.category.trim() || null,
        title: judul,
        interval_unit: form.interval_unit,
        interval_count: Math.trunc(kelipatan),
        next_run: format(mulai, KUNCI_TANGGAL),
        is_active: form.is_active,
      };

      if (idDiubah) {
        await safeMutate(
          supabase.from('recurring_transactions').update(isi).eq('id', idDiubah),
          'Gagal menyimpan perubahan',
        );
      } else {
        await safeMutate(
          supabase.from('recurring_transactions').insert({ ...isi, user_id: user.id }),
          'Gagal menyimpan jadwal',
        );
      }

      // Toast sukses baru muncul setelah safeMutate lolos — kalau tersimpan gagal,
      // baris di atas sudah melempar dan alurnya langsung ke catch.
      toast.success(idDiubah ? 'Jadwal diperbarui' : 'Jadwal dibuat', { id: toastId });
      setFormTerbuka(false);
      setIdDiubah(null);
      await muatJadwal();
    } catch (error) {
      toast.error(pesanError(error, 'Gagal menyimpan jadwal'), { id: toastId });
    } finally {
      setMenyimpan(false);
    }
  };

  const ubahAktif = async (baris: Jadwal) => {
    if (idSibuk) return;
    setIdSibuk(baris.id);
    const aktifBaru = !baris.is_active;
    const toastId = toast.loading(aktifBaru ? 'Mengaktifkan...' : 'Menonaktifkan...');
    try {
      await safeMutate(
        supabase.from('recurring_transactions').update({ is_active: aktifBaru }).eq('id', baris.id),
        'Gagal mengubah status jadwal',
      );
      toast.success(aktifBaru ? 'Jadwal diaktifkan' : 'Jadwal dinonaktifkan', { id: toastId });
      await muatJadwal();
    } catch (error) {
      toast.error(pesanError(error, 'Gagal mengubah status jadwal'), { id: toastId });
    } finally {
      setIdSibuk(null);
    }
  };

  const hapusJadwal = async (baris: Jadwal) => {
    if (idSibuk) return;
    const yakin = window.confirm(
      `Hapus jadwal "${baris.title}"? Transaksi yang sudah terlanjur dibuat tidak ikut terhapus.`,
    );
    if (!yakin) return;

    setIdSibuk(baris.id);
    const toastId = toast.loading('Menghapus jadwal...');
    try {
      await safeMutate(
        supabase.from('recurring_transactions').delete().eq('id', baris.id),
        'Gagal menghapus jadwal',
      );
      toast.success('Jadwal dihapus', { id: toastId });
      await muatJadwal();
    } catch (error) {
      toast.error(pesanError(error, 'Gagal menghapus jadwal'), { id: toastId });
    } finally {
      setIdSibuk(null);
    }
  };

  const jalankanSekarang = async (baris: Jadwal) => {
    if (idSibuk) return;

    const jatuh = bacaTanggal(baris.next_run);
    if (!jatuh) {
      toast.error('Tanggal jadwal tidak valid. Perbaiki dulu lewat tombol ubah.');
      return;
    }

    setIdSibuk(baris.id);
    const toastId = toast.loading('Menjalankan jadwal...');
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Sesi berakhir. Silakan masuk ulang.');

      const transaksi = {
        id: crypto.randomUUID(),
        user_id: user.id,
        wallet_id: baris.wallet_id,
        type: baris.type,
        amount: Number(baris.amount),
        category: baris.category || null,
        title: baris.title,
        created_at: new Date().toISOString(),
      };

      // Transaksi dibuat lebih dulu. Kalau langkah ini gagal, safeMutate melempar
      // dan next_run TIDAK ikut dimajukan — jadwalnya tetap terlihat jatuh tempo
      // dan bisa dicoba lagi, bukannya hilang diam-diam tanpa transaksi apa pun.
      await safeMutate(
        supabase.from('transactions').insert(transaksi),
        'Gagal membuat transaksi',
      );

      await safeMutate(
        supabase
          .from('recurring_transactions')
          .update({
            next_run: tanggalBerikutnya(jatuh, baris.interval_unit, baris.interval_count),
            last_run: format(new Date(), KUNCI_TANGGAL),
          })
          .eq('id', baris.id),
        'Transaksi sudah tercatat, tapi jadwal gagal dimajukan',
      );

      // Saldo dompet dihitung ulang oleh trigger database, jadi keduanya diambil ulang.
      await Promise.allSettled([fetchWallets(), fetchTransactions()]);
      toast.success('Transaksi dibuat dan jadwal dimajukan', { id: toastId });
    } catch (error) {
      toast.error(pesanError(error, 'Gagal menjalankan jadwal'), { id: toastId });
    } finally {
      setIdSibuk(null);
      // Selalu muat ulang: kalau update jadwal gagal di tengah jalan, tampilan
      // harus mengikuti isi database, bukan tebakan optimistis di layar.
      await muatJadwal();
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="page pb-dock relative z-10"
    >
      <div className="flex flex-col items-center mb-8">
        <motion.div
          animate={{ y: [0, -10, 0], scale: [1, 1.05, 1] }}
          transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
          className="text-brand-400 mb-2 drop-shadow-[0_0_15px_rgba(45,212,191,0.5)]"
        >
          <Repeat size={64} />
        </motion.div>
        <h2 className="text-2xl font-bold text-white text-center tracking-tight">Transaksi Berulang</h2>
        <p className="text-white/70 text-sm mt-1 text-center">
          Jadwal otomatis untuk gaji, tagihan, dan langganan.
        </p>
        {jumlahJatuhTempo > 0 && (
          <div className="mt-3 inline-flex items-center gap-2 bg-warn-400/15 border border-warn-400/40 text-warn-400 rounded-full px-4 py-1.5 text-micro font-semibold">
            <AlertTriangle size={14} />
            {jumlahJatuhTempo} jadwal menunggu dijalankan
          </div>
        )}
      </div>

      <button type="button" onClick={bukaTambah} className="btn-primary w-full mb-6">
        <Plus size={20} />
        Buat Jadwal Baru
      </button>

      {wallets !== null && daftarDompet.length === 0 && (
        <div className="glass rounded-4xl p-5 mb-6 text-center">
          <p className="text-white/70 text-sm">
            Belum ada dompet. Buat dompet dulu di halaman Pengaturan sebelum membuat jadwal.
          </p>
        </div>
      )}

      <div className="space-y-4">
        {sedangMemuat && (
          <>
            <div className="skeleton h-40 rounded-4xl" />
            <div className="skeleton h-40 rounded-4xl" />
            <div className="skeleton h-40 rounded-4xl" />
          </>
        )}

        {!sedangMemuat && jadwals.length === 0 && (
          <div className="glass rounded-4xl p-8 text-center">
            <Repeat size={32} className="mx-auto text-white/70 mb-3" />
            <p className="text-white/70 text-sm">
              Belum ada transaksi berulang. Buat jadwal pertama lewat tombol di atas.
            </p>
          </div>
        )}

        {!sedangMemuat && jadwals.map((baris) => {
          const masuk = baris.type === 'income';
          const tanggalJalan = bacaTanggal(baris.next_run);
          const tanggalTerakhir = bacaTanggal(baris.last_run);
          const selisihHari = tanggalJalan
            ? differenceInCalendarDays(tanggalJalan, startOfDay(new Date()))
            : null;
          const jatuhTempo = baris.is_active && selisihHari !== null && selisihHari <= 0;
          const terlambat = selisihHari !== null && selisihHari < 0;
          const sibuk = idSibuk === baris.id;

          return (
            <div
              key={baris.id}
              className={`glass rounded-4xl p-5 transition-colors duration-200 ${
                jatuhTempo ? 'border-warn-400/50' : ''
              } ${baris.is_active ? '' : 'opacity-75'}`}
            >
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex items-start gap-3 min-w-0">
                  <span
                    className={`shrink-0 w-10 h-10 rounded-2xl inline-flex items-center justify-center ${
                      masuk ? 'bg-ok-400/15 text-ok-400' : 'bg-danger-500/15 text-danger-400'
                    }`}
                  >
                    {masuk ? <ArrowDownLeft size={20} /> : <ArrowUpRight size={20} />}
                  </span>
                  <div className="min-w-0">
                    <h3 className="text-white font-semibold truncate">{baris.title}</h3>
                    <p className="text-white/70 text-micro mt-0.5">
                      {masuk ? 'Pemasukan' : 'Pengeluaran'}
                      {baris.category ? ` · ${baris.category}` : ''}
                    </p>
                  </div>
                </div>
                <p
                  className={`shrink-0 font-bold text-right ${masuk ? 'text-ok-400' : 'text-danger-400'}`}
                  data-selectable
                >
                  {masuk ? '+' : '-'}{rupiah(Number(baris.amount))}
                </p>
              </div>

              <div className="space-y-1.5 mb-4">
                <p className="flex items-center gap-2 text-white/70 text-micro">
                  <IkonDompet size={14} className="shrink-0" />
                  {namaDompet.get(baris.wallet_id) ?? 'Dompet sudah dihapus'}
                </p>
                <p className="flex items-center gap-2 text-white/70 text-micro">
                  <Repeat size={14} className="shrink-0" />
                  Setiap {Math.max(1, Number(baris.interval_count) || 1)}{' '}
                  {NAMA_SATUAN[baris.interval_unit] ?? 'bulan'}
                </p>
                <p className="flex items-center gap-2 text-white/70 text-micro">
                  <CalendarClock size={14} className="shrink-0" />
                  Berikutnya: {tanggalJalan ? tampilTanggal(tanggalJalan) : 'belum diatur'}
                </p>
                {tanggalTerakhir && (
                  <p className="flex items-center gap-2 text-white/70 text-micro">
                    <History size={14} className="shrink-0" />
                    Terakhir dijalankan: {tampilTanggal(tanggalTerakhir)}
                  </p>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2 mb-4">
                {!baris.is_active && (
                  <span className="inline-flex items-center rounded-full bg-white/10 border border-white/15 px-3 py-1 text-micro font-semibold text-white/70">
                    Nonaktif
                  </span>
                )}
                {baris.is_active && selisihHari !== null && (
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-micro font-semibold border ${
                      terlambat
                        ? 'bg-danger-500/15 border-danger-500/40 text-danger-400'
                        : selisihHari === 0
                          ? 'bg-warn-400/15 border-warn-400/40 text-warn-400'
                          : 'bg-white/10 border-white/15 text-white/70'
                    }`}
                  >
                    {selisihHari <= 0 && <AlertTriangle size={13} />}
                    {terlambat
                      ? `Terlambat ${Math.abs(selisihHari)} hari`
                      : selisihHari === 0
                        ? 'Jatuh tempo hari ini'
                        : `${selisihHari} hari lagi`}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                {jatuhTempo && (
                  <button
                    type="button"
                    onClick={() => jalankanSekarang(baris)}
                    disabled={sibuk}
                    className="btn-primary flex-1"
                  >
                    <Zap size={18} />
                    {sibuk ? 'Memproses...' : 'Jalankan Sekarang'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => ubahAktif(baris)}
                  disabled={sibuk}
                  aria-label={baris.is_active ? 'Nonaktifkan jadwal' : 'Aktifkan jadwal'}
                  className="icon-btn shrink-0 disabled:opacity-50"
                >
                  {baris.is_active ? <Pause size={18} /> : <Play size={18} />}
                </button>
                <button
                  type="button"
                  onClick={() => bukaUbah(baris)}
                  disabled={sibuk}
                  aria-label="Ubah jadwal"
                  className="icon-btn shrink-0 disabled:opacity-50"
                >
                  <Pencil size={18} />
                </button>
                <button
                  type="button"
                  onClick={() => hapusJadwal(baris)}
                  disabled={sibuk}
                  aria-label="Hapus jadwal"
                  className="icon-btn shrink-0 text-danger-400 hover:text-danger-400 hover:bg-danger-500/15 disabled:opacity-50"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Lembar formulir di-portal ke <body>: halaman ini dibungkus motion.div
          ber-transform, jadi `fixed` di dalamnya akan mengacu ke kotak halaman. */}
      <Portal>
        <AnimatePresence>
          {formTerbuka && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => !menyimpan && setFormTerbuka(false)}
                className="fixed inset-0 z-[60] bg-ink-950/70 backdrop-blur-sm"
              />
              <motion.div
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'spring', damping: 22, stiffness: 110 }}
                className="fixed inset-x-0 bottom-0 z-[61] mx-auto w-full max-w-md glass-strong border-t border-white/15 rounded-t-4xl p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] max-h-[88dvh] overflow-y-auto thin-scrollbar"
              >
                <div className="flex items-center justify-between mb-5">
                  <h3 className="text-white font-bold text-lg">
                    {idDiubah ? 'Ubah Jadwal' : 'Jadwal Baru'}
                  </h3>
                  <button
                    type="button"
                    onClick={() => setFormTerbuka(false)}
                    aria-label="Tutup formulir"
                    className="icon-btn"
                  >
                    <X size={20} />
                  </button>
                </div>

                <form onSubmit={simpanJadwal} className="space-y-4">
                  <div>
                    <label className="label" htmlFor="judul-berulang">Judul</label>
                    <input
                      id="judul-berulang"
                      type="text"
                      className="field"
                      placeholder="Contoh: Tagihan internet"
                      value={form.title}
                      onChange={(e) => setForm({ ...form, title: e.target.value })}
                    />
                  </div>

                  <div>
                    <label className="label" htmlFor="dompet-berulang">Dompet</label>
                    <select
                      id="dompet-berulang"
                      className="field appearance-none"
                      value={form.wallet_id}
                      onChange={(e) => setForm({ ...form, wallet_id: e.target.value })}
                    >
                      <option value="" disabled className="bg-ink-900">Pilih dompet</option>
                      {daftarDompet.map((w) => (
                        <option key={w.id} value={w.id} className="bg-ink-900">{w.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <span className="label">Tipe</span>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setForm({ ...form, type: 'expense' })}
                        className={`btn border ${
                          form.type === 'expense'
                            ? 'bg-danger-500/20 border-danger-500/50 text-danger-400'
                            : 'bg-white/5 border-white/15 text-white/70'
                        }`}
                      >
                        <ArrowUpRight size={18} />
                        Pengeluaran
                      </button>
                      <button
                        type="button"
                        onClick={() => setForm({ ...form, type: 'income' })}
                        className={`btn border ${
                          form.type === 'income'
                            ? 'bg-ok-400/20 border-ok-400/50 text-ok-400'
                            : 'bg-white/5 border-white/15 text-white/70'
                        }`}
                      >
                        <ArrowDownLeft size={18} />
                        Pemasukan
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="label" htmlFor="nominal-berulang">Nominal</label>
                    <input
                      id="nominal-berulang"
                      type="number"
                      inputMode="numeric"
                      min={0}
                      className="field"
                      placeholder="Contoh: 350000"
                      value={form.amount}
                      onChange={(e) => setForm({ ...form, amount: e.target.value })}
                    />
                  </div>

                  <div>
                    <label className="label" htmlFor="kategori-berulang">Kategori (opsional)</label>
                    <input
                      id="kategori-berulang"
                      type="text"
                      list="saran-kategori-berulang"
                      className="field"
                      placeholder="Contoh: Tagihan"
                      value={form.category}
                      onChange={(e) => setForm({ ...form, category: e.target.value })}
                    />
                    <datalist id="saran-kategori-berulang">
                      {SARAN_KATEGORI.map((k) => <option key={k} value={k} />)}
                    </datalist>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="label" htmlFor="kelipatan-berulang">Setiap</label>
                      <input
                        id="kelipatan-berulang"
                        type="number"
                        inputMode="numeric"
                        min={1}
                        className="field"
                        value={form.interval_count}
                        onChange={(e) => setForm({ ...form, interval_count: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="label" htmlFor="satuan-berulang">Satuan</label>
                      <select
                        id="satuan-berulang"
                        className="field appearance-none"
                        value={form.interval_unit}
                        onChange={(e) =>
                          setForm({ ...form, interval_unit: e.target.value as Satuan })
                        }
                      >
                        <option value="day" className="bg-ink-900">Hari</option>
                        <option value="week" className="bg-ink-900">Minggu</option>
                        <option value="month" className="bg-ink-900">Bulan</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="label" htmlFor="tanggal-berulang">Tanggal Jalan Berikutnya</label>
                    <input
                      id="tanggal-berulang"
                      type="date"
                      className="field appearance-none"
                      value={form.next_run}
                      onChange={(e) => setForm({ ...form, next_run: e.target.value })}
                    />
                  </div>

                  <button
                    type="button"
                    role="switch"
                    aria-checked={form.is_active}
                    onClick={() => setForm({ ...form, is_active: !form.is_active })}
                    className="w-full min-h-[44px] flex items-center justify-between bg-white/5 border border-white/15 rounded-2xl px-4 py-3"
                  >
                    <span className="text-white/70 text-sm font-medium">
                      {form.is_active ? 'Jadwal aktif' : 'Jadwal nonaktif'}
                    </span>
                    <span
                      className={`w-12 h-7 rounded-full p-1 transition-colors duration-200 ${
                        form.is_active ? 'bg-brand-500' : 'bg-white/20'
                      }`}
                    >
                      {/* translate-x, bukan margin/left: hanya transform yang diproses GPU. */}
                      <span
                        className={`block w-5 h-5 rounded-full bg-white transition-transform duration-200 ease-expo ${
                          form.is_active ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </span>
                  </button>

                  <div className="flex gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setFormTerbuka(false)}
                      className="btn-ghost flex-1"
                    >
                      Batal
                    </button>
                    <button type="submit" disabled={menyimpan} className="btn-primary flex-1">
                      <Save size={18} />
                      {menyimpan ? 'Menyimpan...' : 'Simpan'}
                    </button>
                  </div>
                </form>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </Portal>
    </motion.div>
  );
}
