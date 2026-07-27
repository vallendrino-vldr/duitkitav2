import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Receipt, Search, X, Download, ImageOff, RotateCcw, CalendarDays } from 'lucide-react';
import toast from 'react-hot-toast';
import Portal from '../components/Portal';
import { supabase } from '../lib/supabase';
import { safeMutate, pesanError } from '../lib/db';
import { urlStruk } from '../lib/api';
import type { Transaction } from '../store/useFinanceStore';

const formatIDR = (nilai: number) =>
  new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(Number.isFinite(nilai) ? nilai : 0);

function formatTanggal(iso: string | null | undefined, denganJam = false): string {
  if (!iso) return 'Tanggal tidak diketahui';
  const tanggal = new Date(iso);
  if (Number.isNaN(tanggal.getTime())) return 'Tanggal tidak diketahui';
  return tanggal.toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    ...(denganJam ? { hour: '2-digit', minute: '2-digit' } : {}),
  });
}

/** Mengubah isian <input type="date"> jadi batas waktu, atau null bila kosong/ngawur. */
function batasWaktu(nilai: string, akhirHari: boolean): Date | null {
  if (!nilai) return null;
  // Akhir rentang dibuat inklusif sampai detik terakhir; kalau tidak, struk yang
  // dibuat siang hari di tanggal "sampai" ikut terbuang karena dibandingkan
  // dengan pukul 00:00 tanggal itu.
  const waktu = new Date(`${nilai}T${akhirHari ? '23:59:59.999' : '00:00:00.000'}`);
  return Number.isNaN(waktu.getTime()) ? null : waktu;
}

const LABEL_TIPE: Record<string, string> = {
  income: 'Pemasukan',
  expense: 'Pengeluaran',
  transfer: 'Transfer',
};

const WARNA_TIPE: Record<string, string> = {
  income: 'text-ok-400',
  expense: 'text-danger-400',
  transfer: 'text-brand-300',
};

/** Nama berkas unduhan yang aman dipakai di Windows maupun Android. */
function namaBerkas(trx: Transaction): string {
  const ekstensi = (trx.receipt_url ?? '').split('.').pop()?.toLowerCase() ?? '';
  const ekstensiAman = /^[a-z0-9]{2,5}$/.test(ekstensi) ? ekstensi : 'jpg';
  const judul =
    (trx.title || 'struk')
      .replace(/[^\p{L}\p{N}\s-]/gu, '')
      .trim()
      .replace(/\s+/g, '-')
      .slice(0, 40) || 'struk';
  const tanggal = (trx.created_at ?? '').slice(0, 10) || 'tanpa-tanggal';
  return `struk-${judul}-${tanggal}.${ekstensiAman}`;
}

type PemintaUrl = (path: string) => Promise<string | null>;

/**
 * Satu kartu struk. Signed URL-nya baru diminta ketika kartu mendekati layar —
 * galeri dengan 200 struk kalau diminta sekaligus akan menembakkan 200
 * permintaan storage begitu halaman dibuka dan bikin aplikasi tersendat.
 */
function KartuStruk({
  trx,
  mintaUrl,
  onBuka,
}: {
  trx: Transaction;
  mintaUrl: PemintaUrl;
  onBuka: (trx: Transaction) => void;
}) {
  const kartuRef = useRef<HTMLButtonElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [gagal, setGagal] = useState(false);

  useEffect(() => {
    const elemen = kartuRef.current;
    const path = trx.receipt_url;
    if (!elemen || !path) return;

    let dibatalkan = false;
    const ambil = () => {
      mintaUrl(path).then((hasil) => {
        if (dibatalkan) return;
        if (hasil) setUrl(hasil);
        else setGagal(true);
      });
    };

    // Webview lawas bisa tidak punya IntersectionObserver; tanpa cadangan ini
    // kartunya akan abu-abu selamanya di perangkat tersebut.
    if (typeof IntersectionObserver === 'undefined') {
      ambil();
      return () => {
        dibatalkan = true;
      };
    }

    const pengamat = new IntersectionObserver(
      (entri) => {
        if (!entri.some((e) => e.isIntersecting)) return;
        pengamat.disconnect();
        ambil();
      },
      // Diambil 200px sebelum masuk layar supaya gambar sudah siap saat digulir.
      { rootMargin: '200px' },
    );
    pengamat.observe(elemen);

    return () => {
      dibatalkan = true;
      pengamat.disconnect();
    };
  }, [trx.receipt_url, mintaUrl]);

  const nominal = Number(trx.amount);

  return (
    <motion.button
      ref={kartuRef}
      type="button"
      onClick={() => onBuka(trx)}
      whileTap={{ scale: 0.97 }}
      aria-label={`Buka struk ${trx.title || 'tanpa judul'}`}
      className="glass group w-full overflow-hidden rounded-3xl text-left transition-colors duration-200 hover:bg-white/[0.11]"
    >
      <div className="relative aspect-[3/4] w-full overflow-hidden bg-black/30">
        {url && !gagal && (
          <img
            src={url}
            alt={`Struk ${trx.title || 'transaksi'}`}
            loading="lazy"
            decoding="async"
            onError={() => setGagal(true)}
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 ease-expo group-hover:scale-105"
          />
        )}

        {gagal && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-3 text-center">
            <ImageOff size={28} className="text-white/70" />
            <span className="text-micro text-white/70">Gambar tidak bisa dimuat</span>
          </div>
        )}

        {!url && !gagal && <div className="skeleton absolute inset-0 rounded-none" />}

        <span
          className={`absolute left-2 top-2 rounded-full bg-ink-950/70 px-2 py-1 text-micro font-semibold backdrop-blur-md ${
            WARNA_TIPE[trx.type] ?? 'text-white/70'
          }`}
        >
          {LABEL_TIPE[trx.type] ?? 'Transaksi'}
        </span>
      </div>

      <div className="space-y-1 p-3">
        <p className="truncate text-sm font-semibold text-white">{trx.title || 'Tanpa judul'}</p>
        <p className="truncate text-micro text-white/70">{trx.category || 'Tanpa kategori'}</p>
        <p className="text-sm font-bold text-white">{formatIDR(nominal)}</p>
        <p className="text-micro text-white/70">{formatTanggal(trx.created_at)}</p>
      </div>
    </motion.button>
  );
}

export default function Receipts() {
  const [daftar, setDaftar] = useState<Transaction[]>([]);
  const [sedangMemuat, setSedangMemuat] = useState(true);
  const [cari, setCari] = useState('');
  const [dariTgl, setDariTgl] = useState('');
  const [sampaiTgl, setSampaiTgl] = useState('');
  const [terpilih, setTerpilih] = useState<Transaction | null>(null);
  const [urlPratinjau, setUrlPratinjau] = useState<string | null>(null);
  const [gagalPratinjau, setGagalPratinjau] = useState(false);
  const [sedangUnduh, setSedangUnduh] = useState(false);

  // Signed URL berlaku sejam, jadi aman disimpan selama halaman terbuka.
  // `berjalan` menahan permintaan yang belum selesai supaya kartu yang keluar-masuk
  // layar berkali-kali tidak memicu permintaan ganda untuk berkas yang sama.
  const cacheUrl = useRef<Map<string, string>>(new Map());
  const berjalan = useRef<Map<string, Promise<string | null>>>(new Map());

  const mintaUrl = useCallback<PemintaUrl>(async (path) => {
    const tersimpan = cacheUrl.current.get(path);
    if (tersimpan) return tersimpan;

    const antre = berjalan.current.get(path);
    if (antre) return antre;

    const permintaan = urlStruk(path)
      .then((hasil) => {
        if (hasil) cacheUrl.current.set(path, hasil);
        return hasil;
      })
      .finally(() => {
        berjalan.current.delete(path);
      });

    berjalan.current.set(path, permintaan);
    return permintaan;
  }, []);

  const muat = useCallback(async () => {
    setSedangMemuat(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setDaftar([]);
        return;
      }

      const data = await safeMutate<Transaction[]>(
        supabase
          .from('transactions')
          .select('id, wallet_id, to_wallet_id, type, amount, category, title, receipt_url, created_at')
          .eq('user_id', user.id)
          .not('receipt_url', 'is', null)
          .order('created_at', { ascending: false })
          .limit(200),
        'Gagal memuat galeri struk',
      );

      // Kolom bisa berisi string kosong (sisa unggahan yang gagal), dan `.not(is null)`
      // tidak menyaring itu — jadi disaring lagi di sini agar tidak ada kartu hantu.
      setDaftar((data ?? []).filter((t) => Boolean(t?.receipt_url)));
    } catch (error) {
      toast.error(pesanError(error, 'Gagal memuat galeri struk'));
      setDaftar([]);
    } finally {
      setSedangMemuat(false);
    }
  }, []);

  useEffect(() => {
    void muat();
  }, [muat]);

  // Pratinjau memakai cache yang sama dengan kartu, jadi membuka struk yang
  // gambarnya sudah tampil tidak meminta URL baru sama sekali.
  useEffect(() => {
    const path = terpilih?.receipt_url;
    setUrlPratinjau(null);
    setGagalPratinjau(false);
    if (!path) return;

    let dibatalkan = false;
    mintaUrl(path).then((hasil) => {
      if (dibatalkan) return;
      if (hasil) setUrlPratinjau(hasil);
      else setGagalPratinjau(true);
    });

    return () => {
      dibatalkan = true;
    };
  }, [terpilih, mintaUrl]);

  useEffect(() => {
    if (!terpilih) return;
    const tekan = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setTerpilih(null);
    };
    window.addEventListener('keydown', tekan);
    return () => window.removeEventListener('keydown', tekan);
  }, [terpilih]);

  const hasil = useMemo(() => {
    const kunci = cari.trim().toLowerCase();
    const dari = batasWaktu(dariTgl, false);
    const sampai = batasWaktu(sampaiTgl, true);

    return daftar.filter((trx) => {
      if (kunci && !(trx.title ?? '').toLowerCase().includes(kunci)) return false;
      if (!dari && !sampai) return true;

      const waktu = trx.created_at ? new Date(trx.created_at) : null;
      // Baris tanpa tanggal valid tidak bisa dinilai masuk rentang atau tidak,
      // jadi disembunyikan saat filter tanggal aktif daripada muncul acak.
      if (!waktu || Number.isNaN(waktu.getTime())) return false;
      if (dari && waktu < dari) return false;
      if (sampai && waktu > sampai) return false;
      return true;
    });
  }, [daftar, cari, dariTgl, sampaiTgl]);

  const adaFilter = Boolean(cari || dariTgl || sampaiTgl);

  const bersihkanFilter = () => {
    setCari('');
    setDariTgl('');
    setSampaiTgl('');
  };

  const unduhStruk = async () => {
    const path = terpilih?.receipt_url;
    if (!terpilih || !path || sedangUnduh) return;

    setSedangUnduh(true);
    const toastId = toast.loading('Menyiapkan unduhan...');
    try {
      const url = await mintaUrl(path);
      if (!url) throw new Error('Tautan struk tidak bisa dibuat. Coba lagi sebentar.');

      // Berkas diambil jadi blob dulu. Atribut `download` pada tautan lintas
      // domain diabaikan browser, sehingga cara lama hanya membuka tab baru
      // dan tidak pernah benar-benar mengunduh apa pun.
      const respons = await fetch(url);
      if (!respons.ok) throw new Error(`Server menolak permintaan (kode ${respons.status}).`);

      const blob = await respons.blob();
      const tautanObjek = URL.createObjectURL(blob);
      const tautan = document.createElement('a');
      tautan.href = tautanObjek;
      tautan.download = namaBerkas(terpilih);
      document.body.appendChild(tautan);
      tautan.click();
      tautan.remove();
      // Jeda sebelum dilepas: sebagian browser membatalkan unduhan bila alamat
      // objeknya dicabut pada frame yang sama dengan kliknya.
      setTimeout(() => URL.revokeObjectURL(tautanObjek), 10000);

      toast.success('Struk berhasil diunduh', { id: toastId });
    } catch (error) {
      toast.error(pesanError(error, 'Gagal mengunduh struk'), { id: toastId });
    } finally {
      setSedangUnduh(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="page pb-dock relative z-10"
    >
      <div className="mb-8 flex flex-col items-center">
        <motion.div
          animate={{ y: [0, -10, 0], scale: [1, 1.05, 1] }}
          transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
          className="mb-2 text-brand-300 drop-shadow-[0_0_15px_rgba(45,212,191,0.5)]"
        >
          <Receipt size={64} />
        </motion.div>
        <h2 className="text-center text-2xl font-bold text-white">Galeri Struk</h2>
        <p className="mt-1 text-center text-sm text-white/70">
          Semua bukti transaksi yang pernah kamu simpan
        </p>
      </div>

      <div className="glass mb-6 rounded-3xl p-4">
        <div className="relative mb-4">
          <Search
            size={18}
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-white/70"
          />
          <input
            type="text"
            value={cari}
            onChange={(e) => setCari(e.target.value)}
            placeholder="Cari judul struk..."
            aria-label="Cari judul struk"
            className="field pl-11 pr-11"
          />
          {cari && (
            <button
              type="button"
              onClick={() => setCari('')}
              aria-label="Hapus kata kunci"
              className="icon-btn absolute right-1 top-1/2 -translate-y-1/2"
            >
              <X size={18} />
            </button>
          )}
        </div>

        <div className="mb-3 flex items-center gap-2 text-white/70">
          <CalendarDays size={16} />
          <span className="text-micro font-semibold uppercase tracking-wider">Rentang Tanggal</span>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="struk-dari" className="label">
              Dari
            </label>
            <input
              id="struk-dari"
              type="date"
              value={dariTgl}
              max={sampaiTgl || undefined}
              onChange={(e) => setDariTgl(e.target.value)}
              className="field"
            />
          </div>
          <div>
            <label htmlFor="struk-sampai" className="label">
              Sampai
            </label>
            <input
              id="struk-sampai"
              type="date"
              value={sampaiTgl}
              min={dariTgl || undefined}
              onChange={(e) => setSampaiTgl(e.target.value)}
              className="field"
            />
          </div>
        </div>

        {adaFilter && (
          <button type="button" onClick={bersihkanFilter} className="btn-ghost mt-4 w-full">
            <RotateCcw size={18} />
            Atur Ulang Filter
          </button>
        )}
      </div>

      {!sedangMemuat && daftar.length > 0 && (
        <p className="mb-4 px-1 text-sm text-white/70">
          Menampilkan {hasil.length} dari {daftar.length} struk
        </p>
      )}

      {sedangMemuat && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="glass overflow-hidden rounded-3xl">
              <div className="skeleton aspect-[3/4] w-full rounded-none" />
              <div className="space-y-2 p-3">
                <div className="skeleton h-3 w-4/5" />
                <div className="skeleton h-3 w-2/5" />
              </div>
            </div>
          ))}
        </div>
      )}

      {!sedangMemuat && daftar.length === 0 && (
        <div className="glass rounded-4xl px-6 py-12 text-center">
          <Receipt size={44} className="mx-auto mb-4 text-white/70" />
          <h3 className="text-lg font-bold text-white">Belum ada struk tersimpan</h3>
          <p className="mx-auto mt-2 max-w-sm text-sm text-white/70">
            Setiap kali kamu memotret struk lewat menu Tambah, fotonya otomatis muncul di sini
            sebagai bukti transaksi.
          </p>
        </div>
      )}

      {!sedangMemuat && daftar.length > 0 && hasil.length === 0 && (
        <div className="glass rounded-4xl px-6 py-12 text-center">
          <Search size={44} className="mx-auto mb-4 text-white/70" />
          <h3 className="text-lg font-bold text-white">Tidak ada struk yang cocok</h3>
          <p className="mx-auto mt-2 max-w-sm text-sm text-white/70">
            Coba ganti kata kunci atau lebarkan rentang tanggalnya.
          </p>
          <button type="button" onClick={bersihkanFilter} className="btn-ghost mt-5">
            <RotateCcw size={18} />
            Atur Ulang Filter
          </button>
        </div>
      )}

      {!sedangMemuat && hasil.length > 0 && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {hasil.map((trx) => (
            <KartuStruk key={trx.id} trx={trx} mintaUrl={mintaUrl} onBuka={setTerpilih} />
          ))}
        </div>
      )}

      {/* Pratinjau layar penuh — di-portal ke <body> supaya `fixed` benar-benar
          mengacu ke layar, bukan ke kotak halaman yang sedang dianimasikan. */}
      <Portal>
        <AnimatePresence>
          {terpilih && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setTerpilih(null)}
                className="fixed inset-0 z-[60] bg-ink-950/90 backdrop-blur-md"
              />

              <motion.div
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                role="dialog"
                aria-modal="true"
                aria-label={`Pratinjau struk ${terpilih.title || 'transaksi'}`}
                className="fixed inset-0 z-[61] flex flex-col pt-safe-top pb-[env(safe-area-inset-bottom,0px)]"
              >
                <div className="flex items-start justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-base font-bold text-white">
                      {terpilih.title || 'Tanpa judul'}
                    </p>
                    <p className="truncate text-micro text-white/70">
                      {formatTanggal(terpilih.created_at, true)} ·{' '}
                      {terpilih.category || 'Tanpa kategori'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setTerpilih(null)}
                    aria-label="Tutup pratinjau struk"
                    className="icon-btn shrink-0 bg-white/10"
                  >
                    <X size={22} />
                  </button>
                </div>

                <div className="flex min-h-0 flex-1 items-center justify-center px-4">
                  {urlPratinjau && !gagalPratinjau && (
                    <img
                      src={urlPratinjau}
                      alt={`Struk ${terpilih.title || 'transaksi'}`}
                      onError={() => setGagalPratinjau(true)}
                      className="max-h-full max-w-full rounded-2xl object-contain shadow-glass"
                    />
                  )}

                  {gagalPratinjau && (
                    <div className="glass flex flex-col items-center gap-3 rounded-3xl px-8 py-10 text-center">
                      <ImageOff size={40} className="text-white/70" />
                      <p className="text-sm text-white/70">
                        Gambar struk tidak bisa ditampilkan. Berkasnya mungkin sudah dihapus.
                      </p>
                    </div>
                  )}

                  {!urlPratinjau && !gagalPratinjau && (
                    <div className="skeleton h-2/3 w-full max-w-sm rounded-2xl" />
                  )}
                </div>

                <div className="flex items-center justify-between gap-3 px-4 py-4">
                  <p className="text-lg font-bold text-white">
                    {formatIDR(Number(terpilih.amount))}
                  </p>
                  <button
                    type="button"
                    onClick={unduhStruk}
                    disabled={sedangUnduh}
                    className="btn-primary"
                  >
                    <Download size={18} />
                    {sedangUnduh ? 'Menyiapkan...' : 'Unduh Struk'}
                  </button>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </Portal>
    </motion.div>
  );
}
