import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Save,
  Trash2,
  Loader2,
  AlertTriangle,
  ImageOff,
  ExternalLink,
  ReceiptText,
  ImagePlus,
} from 'lucide-react';
import toast from 'react-hot-toast';
import Portal from './Portal';
import { supabase } from '../lib/supabase';
import { safeMutateOne, pesanError } from '../lib/db';
import { urlStruk, unggahStruk } from '../lib/api';
import { compressImage } from '../utils/imageCompressor';
import { useFinanceStore, type Transaction, type Wallet } from '../store/useFinanceStore';

interface Props {
  /** `null` berarti modal tertutup. Satu-satunya penentu tampil atau tidaknya modal. */
  transaksi: Transaction | null;
  /**
   * Boleh `null`: di store, `wallets` bernilai null selama belum pernah dimuat.
   * Tipenya sengaja dilonggarkan supaya nilai store bisa dioper apa adanya —
   * penjaga Array.isArray di bawah yang menanganinya.
   */
  wallets: Wallet[] | null | undefined;
  onTutup: () => void;
  onSelesai: () => void;
}

const KATEGORI = [
  'Makanan',
  'Transportasi',
  'Hiburan',
  'Tagihan',
  'Belanja',
  'Kesehatan',
  'Gaji',
  'Lainnya',
] as const;

/** Penanda "kategori diketik sendiri". Bukan kategori nyata, jangan pernah disimpan apa adanya. */
const KATEGORI_KUSTOM = '__kustom__';

/**
 * Kolom yang diminta kembali sesudah update/hapus.
 *
 * Bukan sekadar hiasan: `.select()` inilah yang membuat baris hasil ikut
 * terkirim, sehingga safeMutateOne bisa membuktikan operasinya benar-benar
 * mengenai satu baris. Tanpa itu, Supabase membalas `data: null, error: null`
 * untuk perintah yang TIDAK mengenai baris apa pun.
 */
const KOLOM_TRANSAKSI =
  'id, wallet_id, to_wallet_id, type, amount, category, title, receipt_url, created_at';

const TIPE: { nilai: Transaction['type']; label: string }[] = [
  { nilai: 'income', label: 'Pemasukan' },
  { nilai: 'expense', label: 'Pengeluaran' },
  { nilai: 'transfer', label: 'Transfer' },
];

const formatIDR = (nilai: number) =>
  new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(Number.isFinite(nilai) ? nilai : 0);

/**
 * Mengubah ISO dari database menjadi nilai yang dimengerti <input type="datetime-local">.
 *
 * Formatnya wajib "YYYY-MM-DDTHH:mm" TANPA zona waktu, dan input itu selalu
 * membacanya sebagai waktu lokal. Kalau string ISO ber-akhiran Z dipasang
 * langsung, jam yang tampil melenceng sejauh selisih zona (7 jam untuk WIB).
 */
function keInputWaktu(iso?: string | null): string {
  const mentah = iso ? new Date(iso) : new Date();
  const t = Number.isNaN(mentah.getTime()) ? new Date() : mentah;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}T${p(t.getHours())}:${p(t.getMinutes())}`;
}

type Galat = Partial<
  Record<'judul' | 'nominal' | 'kategori' | 'dompet' | 'dompetTujuan' | 'waktu', string>
>;

interface FormTransaksi {
  judul: string;
  nominal: string;
  tipe: Transaction['type'];
  kategoriPilihan: string;
  kategoriKustom: string;
  dompet: string;
  dompetTujuan: string;
  waktu: string;
}

const FORM_KOSONG: FormTransaksi = {
  judul: '',
  nominal: '',
  tipe: 'expense',
  kategoriPilihan: 'Lainnya',
  kategoriKustom: '',
  dompet: '',
  dompetTujuan: '',
  waktu: keInputWaktu(),
};

export default function TransactionEditor({ transaksi, wallets, onTutup, onSelesai }: Props) {
  // Ambil ulang dari server sesudah menyimpan: saldo dompet dihitung TRIGGER di
  // database, jadi angka di layar tidak ikut berubah kalau tidak diambil lagi.
  const fetchWallets = useFinanceStore((s) => s.fetchWallets);
  const fetchTransactions = useFinanceStore((s) => s.fetchTransactions);

  const [form, setForm] = useState<FormTransaksi>(FORM_KOSONG);
  const [galat, setGalat] = useState<Galat>({});
  const [sibuk, setSibuk] = useState(false);
  const [sibukHapus, setSibukHapus] = useState(false);
  // Langkah kedua tombol hapus. window.confirm diblokir sebagian browser dalam
  // mode PWA dan tampil di luar gaya aplikasi, jadi konfirmasinya dibuat sendiri.
  const [konfirmasiHapus, setKonfirmasiHapus] = useState(false);
  const [urlGambar, setUrlGambar] = useState<string | null>(null);
  const [gambarDimuat, setGambarDimuat] = useState(false);

  const [pendingEditReceipt, setPendingEditReceipt] = useState<File | null>(null);
  const [isDeletingReceipt, setIsDeletingReceipt] = useState(false);

  const terbuka = transaksi !== null;
  const idTransaksi = transaksi?.id ?? null;
  const pathStruk = transaksi?.receipt_url ?? null;

  // Prop `wallets` datang dari luar dan pada data lama bisa saja belum terisi,
  // jadi jangan pernah memanggil .map() langsung di atasnya.
  const daftarDompet = useMemo(() => (Array.isArray(wallets) ? wallets : []), [wallets]);

  // Isi ulang formulir tiap kali transaksi LAIN dibuka.
  useEffect(() => {
    if (!transaksi) return;

    const kategoriAsli = (transaksi.category ?? '').trim();
    const adaDiDaftar = (KATEGORI as readonly string[]).includes(kategoriAsli);

    setForm({
      judul: transaksi.title ?? '',
      nominal: String(Number(transaksi.amount ?? 0)),
      tipe: transaksi.type,
      // Kategori bebas dari versi lama tetap dipertahankan apa adanya; kalau
      // dipaksa jadi "Lainnya", data pengguna hilang diam-diam saat menyimpan.
      kategoriPilihan: kategoriAsli === '' ? 'Lainnya' : adaDiDaftar ? kategoriAsli : KATEGORI_KUSTOM,
      kategoriKustom: adaDiDaftar || kategoriAsli === '' ? '' : kategoriAsli,
      dompet: transaksi.wallet_id ?? '',
      dompetTujuan: transaksi.to_wallet_id ?? '',
      waktu: keInputWaktu(transaksi.created_at),
    });
    setGalat({});
    setKonfirmasiHapus(false);
    setPendingEditReceipt(null);
    setIsDeletingReceipt(false);
    // Sengaja hanya bergantung pada id: induk bisa mengirim objek baru hasil
    // refetch di tengah pengetikan, dan bila objeknya ikut jadi dependensi,
    // isian yang sedang diketik tertimpa data lama.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idTransaksi]);

  // Bucket 'receipts' privat, jadi foto hanya bisa tampil lewat URL bertanda
  // tangan yang dibuat sesaat sebelum dipakai.
  useEffect(() => {
    let batal = false;
    setUrlGambar(null);
    setGambarDimuat(false);
    if (!pathStruk) return;

    (async () => {
      const url = await urlStruk(pathStruk);
      if (!batal) setUrlGambar(url);
    })();

    return () => {
      batal = true;
    };
  }, [pathStruk]);

  // Esc menutup modal — refleks yang diharapkan pengguna papan ketik. Ditolak
  // selagi menyimpan/menghapus supaya proses yang berjalan tidak ditinggal.
  useEffect(() => {
    if (!terbuka) return;
    const tekan = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !sibuk && !sibukHapus) onTutup();
    };
    window.addEventListener('keydown', tekan);
    return () => window.removeEventListener('keydown', tekan);
  }, [terbuka, sibuk, sibukHapus, onTutup]);

  const nominalAngka = Number(form.nominal);
  const nominalValid = Number.isFinite(nominalAngka) && nominalAngka > 0;

  const kategoriAkhir =
    form.kategoriPilihan === KATEGORI_KUSTOM ? form.kategoriKustom.trim() : form.kategoriPilihan;

  const namaDompet = (id?: string | null) =>
    daftarDompet.find((w) => w.id === id)?.name ?? 'Dompet terhapus';

  const ubah = (bagian: Partial<FormTransaksi>) => {
    setForm((prev) => ({ ...prev, ...bagian }));
    // Begitu isian disentuh, pesan galat lama tidak lagi relevan.
    setGalat({});
  };

  /** Mengembalikan pesan galat per kolom. Semua nilainya TEKS, aman dirender. */
  const periksa = (): Galat => {
    const hasil: Galat = {};

    if (!form.judul.trim()) hasil.judul = 'Judul tidak boleh kosong.';
    if (!nominalValid) hasil.nominal = 'Nominal harus berupa angka lebih besar dari nol.';
    if (form.kategoriPilihan === KATEGORI_KUSTOM && !form.kategoriKustom.trim()) {
      hasil.kategori = 'Tulis dulu nama kategorinya.';
    }
    if (!form.dompet) hasil.dompet = 'Pilih dompet dulu.';

    if (form.tipe === 'transfer') {
      if (!form.dompetTujuan) {
        hasil.dompetTujuan = 'Transfer wajib punya dompet tujuan.';
      } else if (form.dompetTujuan === form.dompet) {
        hasil.dompetTujuan = 'Dompet tujuan tidak boleh sama dengan dompet asal.';
      }
    }

    const waktu = new Date(form.waktu);
    if (!form.waktu || Number.isNaN(waktu.getTime())) {
      hasil.waktu = 'Tanggal dan waktu belum benar.';
    }

    return hasil;
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSibuk(true);
    const toastId = toast.loading('Mengompresi struk...');
    try {
      const compressedFile = await compressImage(file);
      setPendingEditReceipt(compressedFile);
      setIsDeletingReceipt(false);
      toast.success('Struk baru ditambahkan!', { id: toastId });
    } catch (error) {
      console.error(error);
      toast.error('Gagal mengompresi struk', { id: toastId });
    } finally {
      setSibuk(false);
    }
  };

  const simpan = async (e: FormEvent) => {
    e.preventDefault();
    if (!transaksi || sibuk || sibukHapus) return;

    const masalah = periksa();
    setGalat(masalah);
    if (Object.keys(masalah).length > 0) {
      toast.error('Periksa lagi isian yang ditandai merah');
      return;
    }

    setSibuk(true);
    const idToast = toast.loading('Menyimpan perubahan...');
    try {
      let receiptPath: string | null | undefined = undefined;

      if (isDeletingReceipt) {
        receiptPath = null;
      } else if (pendingEditReceipt) {
        receiptPath = await unggahStruk(pendingEditReceipt);
      }

      // safeMutateOne, bukan safeMutate: update yang diblokir aturan keamanan
      // (atau menunjuk id yang sudah tidak ada) TIDAK menghasilkan error — ia
      // hanya mengenai nol baris. Tanpa `.select()` yang membuktikan ada baris
      // kembali, toast hijau di bawah akan muncul untuk perubahan yang
      // sebenarnya tidak pernah tersimpan.
      await safeMutateOne<Transaction>(
        supabase
          .from('transactions')
          .update({
            title: form.judul.trim(),
            amount: nominalAngka,
            type: form.tipe,
            category: kategoriAkhir || 'Lainnya',
            wallet_id: form.dompet,
            // Wajib dikosongkan saat tipenya bukan transfer. Kalau id lama
            // ditinggal, trigger tetap menambah saldo dompet tujuan dan uang
            // seolah-olah bertambah dari udara.
            to_wallet_id: form.tipe === 'transfer' ? form.dompetTujuan : null,
            created_at: new Date(form.waktu).toISOString(),
            ...(receiptPath !== undefined ? { receipt_url: receiptPath } : {}),
          })
          .eq('id', transaksi.id)
          .select(KOLOM_TRANSAKSI),
        'Gagal menyimpan perubahan',
      );

      // Saldo dihitung ulang di database, jadi wajib ambil ulang keduanya.
      await Promise.allSettled([fetchWallets(), fetchTransactions()]);

      // Toast hijau hanya setelah update benar-benar lolos safeMutate.
      toast.success('Transaksi berhasil diperbarui', { id: idToast });
      onSelesai();
    } catch (error) {
      toast.error(pesanError(error, 'Gagal menyimpan perubahan'), { id: idToast });
    } finally {
      setSibuk(false);
    }
  };

  const hapus = async () => {
    if (!transaksi || sibuk || sibukHapus) return;

    setSibukHapus(true);
    const idToast = toast.loading('Menghapus transaksi...');
    try {
      // Sama seperti simpan: hapus yang ditolak aturan keamanan membalas tanpa
      // error dan tanpa baris. `.select()` + safeMutateOne memastikan pesan
      // "sudah dihapus" hanya muncul kalau memang ada baris yang terhapus.
      await safeMutateOne<Transaction>(
        supabase.from('transactions').delete().eq('id', transaksi.id).select(KOLOM_TRANSAKSI),
        'Gagal menghapus transaksi',
      );

      await Promise.allSettled([fetchWallets(), fetchTransactions()]);

      toast.success('Transaksi dihapus, saldo dompet sudah disesuaikan', { id: idToast });
      onSelesai();
    } catch (error) {
      toast.error(pesanError(error, 'Gagal menghapus transaksi'), { id: idToast });
      setKonfirmasiHapus(false);
    } finally {
      setSibukHapus(false);
    }
  };

  const tutupAman = () => {
    if (sibuk || sibukHapus) return;
    onTutup();
  };

  return (
    // Modal WAJIB lewat Portal: halaman dibungkus motion.div ber-transform,
    // sehingga `fixed` di dalamnya mengacu ke kotak halaman, bukan ke layar.
    <Portal>
      <AnimatePresence>
        {transaksi && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div
              key="latar-editor"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={tutupAman}
              className="absolute inset-0 bg-ink-950/70 backdrop-blur-md"
            />

            <motion.form
              key="panel-editor"
              initial={{ opacity: 0, scale: 0.94, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: 16 }}
              transition={{ type: 'spring', damping: 20, stiffness: 90 }}
              onSubmit={simpan}
              role="dialog"
              aria-modal="true"
              aria-label="Ubah transaksi"
              className="glass-strong rounded-4xl p-6 w-full max-w-md relative z-[61]
                         max-h-[88dvh] overflow-y-auto thin-scrollbar space-y-4"
            >
              <button
                type="button"
                onClick={tutupAman}
                aria-label="Tutup"
                className="icon-btn absolute top-3 right-3"
              >
                <X size={20} />
              </button>

              <div className="pr-12">
                <h3 className="text-white font-bold text-lg">Ubah Transaksi</h3>
                <p className="text-white/70 text-sm mt-0.5">
                  Saldo dompet dihitung ulang otomatis setelah perubahan disimpan.
                </p>
              </div>

              {/* ---------- judul ---------- */}
              <div>
                <label className="label" htmlFor="editor-judul">Judul</label>
                <input
                  id="editor-judul"
                  type="text"
                  maxLength={100}
                  placeholder="Contoh: Makan siang warteg"
                  value={form.judul}
                  onChange={(e) => ubah({ judul: e.target.value })}
                  className="field"
                />
                {galat.judul && (
                  <p className="text-danger-400 text-micro mt-1.5 ml-1">{galat.judul}</p>
                )}
              </div>

              {/* ---------- nominal ---------- */}
              <div>
                <label className="label" htmlFor="editor-nominal">Nominal</label>
                <input
                  id="editor-nominal"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={1000}
                  placeholder="Contoh: 25000"
                  value={form.nominal}
                  onChange={(e) => ubah({ nominal: e.target.value })}
                  className="field text-lg font-semibold"
                />
                {galat.nominal ? (
                  <p className="text-danger-400 text-micro mt-1.5 ml-1">{galat.nominal}</p>
                ) : (
                  nominalValid && (
                    <p className="text-white/70 text-micro mt-1.5 ml-1" data-selectable>
                      {formatIDR(nominalAngka)}
                    </p>
                  )
                )}
              </div>

              {/* ---------- tipe ---------- */}
              <div>
                <span className="label">Tipe</span>
                <div className="grid grid-cols-3 gap-2">
                  {TIPE.map((t) => {
                    const aktif = form.tipe === t.nilai;
                    return (
                      <button
                        key={t.nilai}
                        type="button"
                        aria-pressed={aktif}
                        onClick={() =>
                          ubah({
                            tipe: t.nilai,
                            // Pindah dari transfer ke tipe lain: buang tujuan supaya
                            // tidak ada sisa pilihan yang membingungkan saat kembali.
                            dompetTujuan: t.nilai === 'transfer' ? form.dompetTujuan : '',
                          })
                        }
                        className={`btn text-sm px-2 border ${
                          aktif
                            ? 'bg-brand-500/25 text-brand-200 border-brand-400/50'
                            : 'bg-white/5 text-white/70 border-white/15 hover:bg-white/10'
                        }`}
                      >
                        {t.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* ---------- kategori ---------- */}
              <div>
                <label className="label" htmlFor="editor-kategori">Kategori</label>
                <select
                  id="editor-kategori"
                  value={form.kategoriPilihan}
                  onChange={(e) => ubah({ kategoriPilihan: e.target.value })}
                  className="field appearance-none"
                >
                  {KATEGORI.map((k) => (
                    <option key={k} value={k} className="bg-ink-900">
                      {k}
                    </option>
                  ))}
                  <option value={KATEGORI_KUSTOM} className="bg-ink-900">
                    Tulis sendiri...
                  </option>
                </select>

                {form.kategoriPilihan === KATEGORI_KUSTOM && (
                  <input
                    type="text"
                    maxLength={40}
                    placeholder="Nama kategori sendiri"
                    aria-label="Nama kategori sendiri"
                    value={form.kategoriKustom}
                    onChange={(e) => ubah({ kategoriKustom: e.target.value })}
                    className="field mt-2"
                  />
                )}

                {galat.kategori && (
                  <p className="text-danger-400 text-micro mt-1.5 ml-1">{galat.kategori}</p>
                )}
              </div>

              {/* ---------- dompet ---------- */}
              <div>
                <label className="label" htmlFor="editor-dompet">
                  {form.tipe === 'transfer' ? 'Dompet Asal' : 'Dompet'}
                </label>
                <select
                  id="editor-dompet"
                  value={form.dompet}
                  onChange={(e) => ubah({ dompet: e.target.value })}
                  className="field appearance-none"
                >
                  <option value="" className="bg-ink-900">Pilih dompet</option>
                  {daftarDompet.map((w) => (
                    <option key={w.id} value={w.id} className="bg-ink-900">
                      {w.name} — {formatIDR(Number(w.balance ?? 0))}
                    </option>
                  ))}
                </select>
                {galat.dompet && (
                  <p className="text-danger-400 text-micro mt-1.5 ml-1">{galat.dompet}</p>
                )}
              </div>

              {/* ---------- dompet tujuan (khusus transfer) ---------- */}
              {form.tipe === 'transfer' && (
                <div>
                  <label className="label" htmlFor="editor-dompet-tujuan">Dompet Tujuan</label>
                  <select
                    id="editor-dompet-tujuan"
                    value={form.dompetTujuan}
                    onChange={(e) => ubah({ dompetTujuan: e.target.value })}
                    className="field appearance-none"
                  >
                    <option value="" className="bg-ink-900">Pilih dompet tujuan</option>
                    {daftarDompet.map((w) => (
                      <option
                        key={w.id}
                        value={w.id}
                        disabled={w.id === form.dompet}
                        className="bg-ink-900"
                      >
                        {w.name} — {formatIDR(Number(w.balance ?? 0))}
                      </option>
                    ))}
                  </select>
                  {galat.dompetTujuan ? (
                    <p className="text-danger-400 text-micro mt-1.5 ml-1">{galat.dompetTujuan}</p>
                  ) : (
                    form.dompetTujuan && (
                      <p className="text-white/70 text-micro mt-1.5 ml-1">
                        {namaDompet(form.dompet)} ke {namaDompet(form.dompetTujuan)}
                      </p>
                    )
                  )}
                </div>
              )}

              {/* ---------- tanggal & waktu ---------- */}
              <div>
                <label className="label" htmlFor="editor-waktu">Tanggal &amp; Waktu</label>
                <input
                  id="editor-waktu"
                  type="datetime-local"
                  value={form.waktu}
                  onChange={(e) => ubah({ waktu: e.target.value })}
                  className="field appearance-none"
                />
                {galat.waktu && (
                  <p className="text-danger-400 text-micro mt-1.5 ml-1">{galat.waktu}</p>
                )}
              </div>

              {/* ---------- struk ---------- */}
              <div>
                <label className="label">Foto Struk</label>
                {pendingEditReceipt ? (
                  <div className="rounded-2xl bg-white/5 border border-white/10 p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <ReceiptText size={16} className="text-teal-300" />
                      <span className="text-white/70 text-micro font-semibold uppercase tracking-wider">
                        Struk Baru (Belum Disimpan)
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <img
                          src={URL.createObjectURL(pendingEditReceipt)}
                          alt="Struk baru"
                          className="h-20 w-20 rounded-2xl object-cover border border-white/15 flex-shrink-0"
                        />
                        <div className="min-w-0">
                          <p className="text-white text-xs truncate font-medium">{pendingEditReceipt.name}</p>
                          <p className="text-white/50 text-[10px]">{(pendingEditReceipt.size / 1024).toFixed(1)} KB</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setPendingEditReceipt(null)}
                        className="p-2 text-danger-400 hover:bg-white/5 rounded-full active:scale-95 transition-all"
                        title="Batalkan struk baru"
                      >
                        <X size={18} />
                      </button>
                    </div>
                  </div>
                ) : (pathStruk && !isDeletingReceipt) ? (
                  <div className="rounded-2xl bg-white/5 border border-white/10 p-3">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2">
                        <ReceiptText size={16} className="text-accent-300" />
                        <span className="text-white/70 text-micro font-semibold uppercase tracking-wider">
                          Struk Saat Ini
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setIsDeletingReceipt(true)}
                        className="text-danger-400 hover:text-danger-300 text-micro font-semibold flex items-center gap-1 bg-danger-500/10 hover:bg-danger-500/20 px-2.5 py-1 rounded-full transition-all"
                      >
                        <Trash2 size={12} /> Hapus Struk
                      </button>
                    </div>

                    {urlGambar ? (
                      <div className="flex items-center gap-3">
                        <img
                          src={urlGambar}
                          alt="Struk transaksi"
                          loading="lazy"
                          onLoad={() => setGambarDimuat(true)}
                          onError={() => setUrlGambar(null)}
                          className="h-20 w-20 rounded-2xl object-cover border border-white/15 flex-shrink-0"
                        />
                        <div className="min-w-0">
                          {!gambarDimuat && (
                            <p className="text-white/70 text-micro mb-1">Memuat gambar...</p>
                          )}
                          <div className="flex flex-col gap-1.5">
                            <a
                              href={urlGambar}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="btn-ghost px-3 text-[11px] h-8 inline-flex items-center gap-1.5"
                            >
                              <ExternalLink size={12} />
                              Ukuran Penuh
                            </a>
                            <label className="btn bg-white/10 text-white border border-white/15 hover:bg-white/15 px-3 text-[11px] h-8 inline-flex items-center gap-1.5 cursor-pointer justify-center rounded-xl transition-all">
                              <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
                              <ImagePlus size={12} /> Ganti Struk
                            </label>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-white/70 text-sm">
                        <ImageOff size={18} className="flex-shrink-0" />
                        <span>Struk belum bisa ditampilkan. Coba tutup dan buka lagi.</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <label className="flex items-center justify-center gap-2 border border-dashed border-white/20 hover:border-teal-400/50 hover:bg-teal-400/5 rounded-2xl p-4 cursor-pointer transition-all">
                    <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
                    <ImagePlus size={18} className="text-white/60" />
                    <span className="text-white/70 text-xs font-light">Pilih Foto Struk</span>
                  </label>
                )}
              </div>

              {/* ---------- tombol utama ---------- */}
              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={tutupAman}
                  disabled={sibuk || sibukHapus}
                  className="btn-ghost flex-1"
                >
                  Batal
                </button>
                <button type="submit" disabled={sibuk || sibukHapus} className="btn-primary flex-1">
                  {sibuk ? (
                    <>
                      <Loader2 size={18} className="animate-spin" />
                      Menyimpan...
                    </>
                  ) : (
                    <>
                      <Save size={18} />
                      Simpan
                    </>
                  )}
                </button>
              </div>

              {/* ---------- hapus: dipisah, dua langkah, tidak bisa tersenggol ---------- */}
              <div className="pt-3 mt-1 border-t border-white/10">
                {!konfirmasiHapus ? (
                  <button
                    type="button"
                    onClick={() => setKonfirmasiHapus(true)}
                    disabled={sibuk || sibukHapus}
                    className="btn-danger w-full"
                  >
                    <Trash2 size={18} />
                    Hapus Transaksi
                  </button>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-start gap-2 rounded-2xl border border-danger-500/40 bg-danger-500/10 p-3">
                      <AlertTriangle size={18} className="text-danger-400 flex-shrink-0 mt-0.5" />
                      <p className="text-danger-400 text-sm">
                        Transaksi ini akan dihapus permanen dan tidak bisa dikembalikan. Saldo
                        dompet {namaDompet(transaksi.wallet_id)} akan otomatis menyesuaikan.
                      </p>
                    </div>
                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={() => setKonfirmasiHapus(false)}
                        disabled={sibukHapus}
                        className="btn-ghost flex-1"
                      >
                        Batal
                      </button>
                      <button
                        type="button"
                        onClick={hapus}
                        disabled={sibukHapus}
                        className="btn bg-danger-500 text-white px-5 flex-1"
                      >
                        {sibukHapus ? (
                          <>
                            <Loader2 size={18} className="animate-spin" />
                            Menghapus...
                          </>
                        ) : (
                          <>
                            <Trash2 size={18} />
                            Yakin hapus?
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </motion.form>
          </div>
        )}
      </AnimatePresence>
    </Portal>
  );
}
