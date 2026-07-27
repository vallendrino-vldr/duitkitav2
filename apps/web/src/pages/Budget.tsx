import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  PieChart, Plus, Pencil, Trash2, X, Save, RefreshCw, AlertTriangle, CalendarDays,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { safeMutate, safeMutateOne, pesanError } from '../lib/db';
import Portal from '../components/Portal';

interface Anggaran {
  id: string;
  category: string;
  amount_limit: number;
  /** Selalu tanggal 1, format 'YYYY-MM-01'. */
  period_month: string;
}

/** Baris transaksi seperlunya saja — kolom lain tidak dipakai di halaman ini. */
interface BarisPengeluaran {
  category: string | null;
  amount: number | string | null;
}

type Modal =
  | { jenis: 'form'; awal: Anggaran | null; kategoriAwal: string }
  | { jenis: 'hapus'; anggaran: Anggaran }
  | null;

/** Penanda opsi "kategori lain" di dalam <select>; tidak pernah tersimpan ke database. */
const KATEGORI_LAIN = '__lain__';

const KATEGORI_BAWAAN = ['Makanan', 'Transportasi', 'Hiburan', 'Tagihan', 'Belanja', 'Kesehatan'];

const rupiah = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
});

const formatIDR = (nilai: number) => rupiah.format(Number.isFinite(nilai) ? nilai : 0);

/** Kunci pembanding kategori: "Makanan" dan "makanan " harus dihitung sama. */
const kunciKategori = (nama: string | null | undefined) => (nama ?? '').trim().toLowerCase();

const periodeDari = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;

/**
 * Batas awal dan akhir bulan dalam waktu lokal.
 * Penting: `new Date('2026-07-01')` diartikan browser sebagai UTC, sehingga di
 * WIB hasilnya mundur ke 30 Juni pukul 07.00 dan transaksi tanggal 1 ikut hilang
 * dari perhitungan. Karena itu tahun/bulan dipecah manual.
 */
function rentangBulan(periode: string): { mulai: Date; selesai: Date } {
  const [th, bl] = periode.split('-').map(Number);
  const acuan = Number.isFinite(th) && Number.isFinite(bl) ? new Date(th, bl - 1, 1) : new Date();
  return {
    mulai: new Date(acuan.getFullYear(), acuan.getMonth(), 1),
    selesai: new Date(acuan.getFullYear(), acuan.getMonth() + 1, 1),
  };
}

/** Kategori khusus buatan pengguna disimpan di perangkat oleh halaman Pengaturan. */
function kategoriTersimpan(): string[] {
  try {
    const mentah = localStorage.getItem('duitkita_categories');
    if (!mentah) return [];
    const isi: unknown = JSON.parse(mentah);
    return Array.isArray(isi) ? isi.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    // Isi localStorage bisa rusak/diedit manual — jangan sampai halaman ikut mati.
    return [];
  }
}

export default function Budget() {
  const [periode, setPeriode] = useState(() => periodeDari(new Date()));
  const [anggaran, setAnggaran] = useState<Anggaran[]>([]);
  const [pemakaian, setPemakaian] = useState<Record<string, { label: string; total: number }>>({});
  const [memuat, setMemuat] = useState(true);
  const [galat, setGalat] = useState<string | null>(null);
  const [modal, setModal] = useState<Modal>(null);
  const [sibuk, setSibuk] = useState(false);

  // Bulan ini dan 11 bulan ke belakang. Bulan depan sengaja tidak ditawarkan
  // supaya pengguna tidak menganggarkan periode yang belum berjalan.
  const daftarBulan = useMemo(() => {
    const kini = new Date();
    return Array.from({ length: 12 }, (_, i) => {
      const d = new Date(kini.getFullYear(), kini.getMonth() - i, 1);
      return {
        nilai: periodeDari(d),
        label: d.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' }),
      };
    });
  }, []);

  const muat = useCallback(async () => {
    setMemuat(true);
    setGalat(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Sesi kamu sudah berakhir. Silakan masuk ulang.');

      const { mulai, selesai } = rentangBulan(periode);

      const [barisAnggaran, barisTransaksi] = await Promise.all([
        safeMutate<Anggaran[]>(
          supabase
            .from('budgets')
            .select('id, category, amount_limit, period_month')
            .eq('user_id', user.id)
            .eq('period_month', periode)
            .order('category', { ascending: true }),
          'Gagal memuat anggaran',
        ),
        safeMutate<BarisPengeluaran[]>(
          supabase
            .from('transactions')
            .select('category, amount')
            .eq('user_id', user.id)
            .eq('type', 'expense')
            .gte('created_at', mulai.toISOString())
            .lt('created_at', selesai.toISOString()),
          'Gagal memuat pengeluaran',
        ),
      ]);

      const rekap: Record<string, { label: string; total: number }> = {};
      for (const baris of barisTransaksi ?? []) {
        const label = (baris.category ?? '').trim();
        if (!label) continue; // Transaksi tanpa kategori tidak bisa dicocokkan ke anggaran mana pun.
        const kunci = kunciKategori(label);
        const jumlah = Number(baris.amount);
        if (!Number.isFinite(jumlah)) continue;
        const lama = rekap[kunci];
        rekap[kunci] = { label: lama?.label ?? label, total: (lama?.total ?? 0) + jumlah };
      }

      setAnggaran(barisAnggaran ?? []);
      setPemakaian(rekap);
    } catch (e) {
      const pesan = pesanError(e, 'Gagal memuat anggaran');
      setGalat(pesan);
      toast.error(pesan);
      // Kosongkan daftar supaya angka bulan sebelumnya tidak tertinggal di layar
      // dan terbaca seolah-olah itu data bulan yang sedang dipilih.
      setAnggaran([]);
      setPemakaian({});
    } finally {
      setMemuat(false);
    }
  }, [periode]);

  useEffect(() => {
    void muat();
  }, [muat]);

  const terpakaiUntuk = useCallback(
    (kategori: string) => pemakaian[kunciKategori(kategori)]?.total ?? 0,
    [pemakaian],
  );

  const ringkasan = useMemo(() => {
    let batas = 0;
    let terpakai = 0;
    for (const a of anggaran) {
      batas += Number(a.amount_limit) || 0;
      terpakai += pemakaian[kunciKategori(a.category)]?.total ?? 0;
    }
    return { batas, terpakai, sisa: batas - terpakai };
  }, [anggaran, pemakaian]);

  // Kategori yang sudah menghabiskan uang bulan ini tapi belum punya batas.
  const belumDianggarkan = useMemo(() => {
    const sudah = new Set(anggaran.map((a) => kunciKategori(a.category)));
    return Object.entries(pemakaian)
      .filter(([kunci]) => !sudah.has(kunci))
      .map(([, isi]) => isi)
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
  }, [anggaran, pemakaian]);

  const pilihanKategori = useMemo(() => {
    const sudah = new Set(anggaran.map((a) => kunciKategori(a.category)));
    const kumpulan = new Map<string, string>();
    for (const nama of [...KATEGORI_BAWAAN, ...kategoriTersimpan(), ...Object.values(pemakaian).map((p) => p.label)]) {
      const kunci = kunciKategori(nama);
      // Kategori yang sudah punya anggaran bulan ini disembunyikan dari daftar
      // tambah — mengubahnya lewat tombol pensil, bukan dengan menimpa diam-diam.
      if (!kunci || sudah.has(kunci) || kumpulan.has(kunci)) continue;
      kumpulan.set(kunci, nama.trim());
    }
    return Array.from(kumpulan.values()).sort((a, b) => a.localeCompare(b, 'id-ID'));
  }, [anggaran, pemakaian]);

  const simpanAnggaran = async (kategori: string, batas: number) => {
    setSibuk(true);
    const idToast = toast.loading('Menyimpan anggaran…');
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Sesi kamu sudah berakhir. Silakan masuk ulang.');

      // onConflict memakai kunci unik (user_id, category, period_month) supaya
      // menyimpan ulang kategori yang sama tidak melahirkan baris kembar.
      // safeMutateOne dipakai karena upsert yang diblokir RLS mengembalikan
      // array kosong TANPA error — tanpa ini, toast hijau bisa muncul untuk data
      // yang sebenarnya tidak pernah tersimpan.
      await safeMutateOne<Anggaran>(
        supabase
          .from('budgets')
          .upsert(
            {
              user_id: user.id,
              category: kategori,
              amount_limit: batas,
              period_month: periode,
            },
            { onConflict: 'user_id,category,period_month' },
          )
          .select('id, category, amount_limit, period_month'),
        'Gagal menyimpan anggaran',
      );

      toast.success('Anggaran tersimpan', { id: idToast });
      setModal(null);
      await muat();
    } catch (e) {
      toast.error(pesanError(e, 'Gagal menyimpan anggaran'), { id: idToast });
    } finally {
      setSibuk(false);
    }
  };

  const hapusAnggaran = async (item: Anggaran) => {
    setSibuk(true);
    const idToast = toast.loading('Menghapus anggaran…');
    try {
      await safeMutateOne<Anggaran>(
        supabase.from('budgets').delete().eq('id', item.id).select('id, category, amount_limit, period_month'),
        'Gagal menghapus anggaran',
      );
      toast.success('Anggaran dihapus', { id: idToast });
      setModal(null);
      await muat();
    } catch (e) {
      toast.error(pesanError(e, 'Gagal menghapus anggaran'), { id: idToast });
    } finally {
      setSibuk(false);
    }
  };

  const labelBulan =
    daftarBulan.find((b) => b.nilai === periode)?.label ?? 'bulan ini';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="page pb-dock relative z-10"
    >
      <div className="flex flex-col items-center mb-8">
        <div className="text-brand-400 mb-2 drop-shadow-[0_0_15px_rgba(45,212,191,0.45)]">
          <PieChart size={56} />
        </div>
        <h1 className="text-2xl font-bold text-white text-center tracking-tight">Anggaran Bulanan</h1>
        <p className="text-white/70 text-sm mt-1 text-center">
          Tetapkan batas belanja per kategori, lalu pantau sisanya.
        </p>
      </div>

      <div className="flex items-end gap-3 mb-6">
        <div className="flex-1">
          <label className="label" htmlFor="pilih-bulan">
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays size={13} /> Periode
            </span>
          </label>
          <select
            id="pilih-bulan"
            className="field appearance-none"
            value={periode}
            onChange={(e) => setPeriode(e.target.value)}
          >
            {daftarBulan.map((b) => (
              <option key={b.nilai} value={b.nilai} className="bg-ink-800">
                {b.label}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={() => void muat()}
          className="icon-btn shrink-0"
          aria-label="Muat ulang anggaran"
        >
          <RefreshCw size={18} className={memuat ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="glass rounded-4xl p-5 mb-6">
        <p className="text-micro font-semibold uppercase tracking-wider text-white/70">
          Ringkasan {labelBulan}
        </p>
        <div className="grid grid-cols-3 gap-3 mt-3">
          <div>
            <p className="text-micro text-white/70">Total Anggaran</p>
            <p className="font-bold tabular-nums mt-0.5" data-selectable>
              {formatIDR(ringkasan.batas)}
            </p>
          </div>
          <div>
            <p className="text-micro text-white/70">Total Terpakai</p>
            <p className="font-bold tabular-nums mt-0.5" data-selectable>
              {formatIDR(ringkasan.terpakai)}
            </p>
          </div>
          <div>
            <p className="text-micro text-white/70">{ringkasan.sisa < 0 ? 'Lewat Batas' : 'Sisa'}</p>
            <p
              className={`font-bold tabular-nums mt-0.5 ${
                ringkasan.sisa < 0 ? 'text-danger-400' : 'text-ok-400'
              }`}
              data-selectable
            >
              {formatIDR(Math.abs(ringkasan.sisa))}
            </p>
          </div>
        </div>
        <div className="mt-4">
          <BarKemajuan rasio={ringkasan.batas > 0 ? ringkasan.terpakai / ringkasan.batas : 0} />
        </div>
        <p className="text-micro text-white/70 mt-2">
          Angka terpakai hanya menghitung pengeluaran pada kategori yang kamu anggarkan.
        </p>
      </div>

      <button
        type="button"
        onClick={() => setModal({ jenis: 'form', awal: null, kategoriAwal: '' })}
        className="btn-primary w-full mb-6"
      >
        <Plus size={18} /> Tambah Anggaran
      </button>

      {galat && (
        <div className="glass rounded-2xl p-4 flex items-center gap-3 border-danger-500/40 mb-6">
          <AlertTriangle size={20} className="text-danger-400 shrink-0" />
          <p className="text-sm text-danger-400">{galat}</p>
        </div>
      )}

      {memuat && anggaran.length === 0 ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton h-32 rounded-4xl" />
          ))}
        </div>
      ) : anggaran.length === 0 ? (
        <div className="glass rounded-4xl p-10 text-center">
          <p className="text-white/80 font-semibold">Belum ada anggaran untuk {labelBulan}.</p>
          <p className="text-white/70 text-sm mt-1">
            Mulai dari kategori yang paling sering menguras dompet, misalnya Makanan.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {anggaran.map((item) => {
            const batas = Number(item.amount_limit) || 0;
            const terpakai = terpakaiUntuk(item.category);
            const sisa = batas - terpakai;
            const rasio = batas > 0 ? terpakai / batas : 0;
            const status = statusDari(rasio);

            return (
              <div key={item.id} className="glass rounded-4xl p-5">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <h2 className="font-bold text-white truncate">{item.category}</h2>
                    <p className="text-micro text-white/70 mt-0.5">
                      Batas <span className="tabular-nums">{formatIDR(batas)}</span>
                    </p>
                  </div>
                  <span
                    className={`text-micro font-bold px-2 py-1 rounded-full shrink-0 ${status.kelasLencana}`}
                  >
                    {status.label}
                  </span>
                  <div className="flex items-center shrink-0">
                    <button
                      type="button"
                      onClick={() => setModal({ jenis: 'form', awal: item, kategoriAwal: item.category })}
                      className="icon-btn"
                      aria-label={`Ubah anggaran ${item.category}`}
                    >
                      <Pencil size={18} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setModal({ jenis: 'hapus', anggaran: item })}
                      className="icon-btn hover:text-danger-400"
                      aria-label={`Hapus anggaran ${item.category}`}
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>

                <div className="mt-4">
                  <BarKemajuan rasio={rasio} />
                </div>

                <div className="flex items-center justify-between gap-3 mt-3">
                  <p className="text-sm text-white/80">
                    Terpakai{' '}
                    <span className="font-semibold tabular-nums text-white" data-selectable>
                      {formatIDR(terpakai)}
                    </span>{' '}
                    <span className="text-white/70">({Math.round(rasio * 100)}%)</span>
                  </p>
                  <p className={`text-sm font-semibold tabular-nums ${sisa < 0 ? 'text-danger-400' : 'text-ok-400'}`}>
                    {sisa < 0 ? `Lewat ${formatIDR(Math.abs(sisa))}` : `Sisa ${formatIDR(sisa)}`}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {belumDianggarkan.length > 0 && (
        <section className="mt-8">
          <h2 className="text-micro font-semibold uppercase tracking-wider text-white/70 mb-3 ml-1">
            Kategori Belum Dianggarkan
          </h2>
          <div className="space-y-2">
            {belumDianggarkan.map((k) => (
              <button
                key={k.label}
                type="button"
                onClick={() => setModal({ jenis: 'form', awal: null, kategoriAwal: k.label })}
                className="btn w-full glass rounded-2xl px-4 justify-between text-left hover:bg-white/[0.12]"
              >
                <span className="min-w-0 truncate">
                  <span className="font-semibold">{k.label}</span>
                  <span className="text-white/70 text-sm"> · {formatIDR(k.total)} terpakai</span>
                </span>
                <span className="inline-flex items-center gap-1.5 text-brand-300 text-sm font-semibold shrink-0">
                  <Plus size={16} /> Atur
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      <Portal>
        <AnimatePresence>
          {modal && (
            <PembungkusModal onTutup={() => !sibuk && setModal(null)}>
              {modal.jenis === 'form' ? (
                <FormAnggaran
                  awal={modal.awal}
                  kategoriAwal={modal.kategoriAwal}
                  pilihan={pilihanKategori}
                  labelBulan={labelBulan}
                  sibuk={sibuk}
                  onSimpan={simpanAnggaran}
                />
              ) : (
                <KonfirmasiHapus
                  anggaran={modal.anggaran}
                  sibuk={sibuk}
                  onBatal={() => setModal(null)}
                  onHapus={() => void hapusAnggaran(modal.anggaran)}
                />
              )}
            </PembungkusModal>
          )}
        </AnimatePresence>
      </Portal>
    </motion.div>
  );
}

/* ---------- bagian tampilan pendukung ---------- */

function statusDari(rasio: number): { label: string; kelasBar: string; kelasLencana: string } {
  if (rasio > 1) {
    return {
      label: 'LEWAT',
      kelasBar: 'bg-danger-500',
      kelasLencana: 'bg-danger-500/20 text-danger-400',
    };
  }
  if (rasio >= 0.75) {
    return {
      label: 'WASPADA',
      kelasBar: 'bg-warn-400',
      kelasLencana: 'bg-warn-400/20 text-warn-400',
    };
  }
  return {
    label: 'AMAN',
    kelasBar: 'bg-gradient-to-r from-brand-500 to-brand-300',
    kelasLencana: 'bg-brand-400/20 text-brand-300',
  };
}

/**
 * Bar kemajuan yang diisi dengan `scaleX`, bukan dengan mengubah `width`.
 * Menganimasikan lebar memaksa browser menghitung ulang tata letak tiap frame
 * sehingga tersendat di ponsel; transform dikerjakan GPU.
 */
function BarKemajuan({ rasio }: { rasio: number }) {
  const aman = Number.isFinite(rasio) && rasio > 0 ? rasio : 0;
  const isi = Math.min(aman, 1);
  const { kelasBar } = statusDari(aman);

  return (
    <div
      className="h-2.5 w-full rounded-full bg-white/15 overflow-hidden"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(aman * 100)}
      aria-label="Kemajuan pemakaian anggaran"
    >
      <motion.div
        initial={{ scaleX: 0 }}
        animate={{ scaleX: isi }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        style={{ transformOrigin: 'left' }}
        className={`h-full w-full rounded-full ${kelasBar}`}
      />
    </div>
  );
}

function PembungkusModal({ children, onTutup }: { children: ReactNode; onTutup: () => void }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onTutup}
        className="absolute inset-0 bg-ink-950/70 backdrop-blur-md"
      />
      <motion.div
        initial={{ scale: 0.94, opacity: 0, y: 16 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.94, opacity: 0, y: 16 }}
        transition={{ type: 'spring', damping: 20, stiffness: 90 }}
        role="dialog"
        aria-modal="true"
        className="glass-strong rounded-4xl p-6 w-full max-w-md relative z-[61] max-h-[85dvh] overflow-y-auto thin-scrollbar"
      >
        <button onClick={onTutup} aria-label="Tutup" className="icon-btn absolute top-4 right-4">
          <X size={20} />
        </button>
        {children}
      </motion.div>
    </div>
  );
}

function FormAnggaran({
  awal, kategoriAwal, pilihan, labelBulan, sibuk, onSimpan,
}: {
  awal: Anggaran | null;
  kategoriAwal: string;
  pilihan: string[];
  labelBulan: string;
  sibuk: boolean;
  onSimpan: (kategori: string, batas: number) => void;
}) {
  const mengubah = awal !== null;
  const [kategori, setKategori] = useState(awal?.category ?? kategoriAwal ?? '');
  const [kategoriLain, setKategoriLain] = useState('');
  const [batas, setBatas] = useState(awal ? String(Number(awal.amount_limit) || '') : '');

  const opsi = useMemo(() => {
    const kumpulan = new Map<string, string>();
    for (const nama of [...pilihan, kategoriAwal]) {
      const kunci = kunciKategori(nama);
      if (!kunci || kumpulan.has(kunci)) continue;
      kumpulan.set(kunci, nama.trim());
    }
    return Array.from(kumpulan.values());
  }, [pilihan, kategoriAwal]);

  const kirim = (e: FormEvent) => {
    e.preventDefault();
    const nama = (kategori === KATEGORI_LAIN ? kategoriLain : kategori).trim();
    if (!nama) {
      toast.error('Pilih atau tulis kategorinya dulu');
      return;
    }
    const nilai = Number(batas);
    if (!Number.isFinite(nilai) || nilai <= 0) {
      toast.error('Batas anggaran harus lebih dari nol');
      return;
    }
    onSimpan(nama, Math.round(nilai));
  };

  return (
    <form onSubmit={kirim} className="space-y-4">
      <h2 className="text-xl font-bold pr-10">{mengubah ? 'Ubah Anggaran' : 'Tambah Anggaran'}</h2>
      <p className="text-sm text-white/70 -mt-2">Berlaku untuk periode {labelBulan}.</p>

      <div>
        <label className="label" htmlFor="a-kategori">Kategori</label>
        {mengubah ? (
          <>
            {/* Kategori dikunci saat mengubah: kategori ikut membentuk kunci unik
                barisnya, jadi menggantinya akan membuat anggaran baru dan
                meninggalkan yang lama menggantung di daftar. */}
            <input id="a-kategori" type="text" className="field opacity-70" value={kategori} disabled />
            <p className="text-micro text-white/70 mt-1.5 ml-1">
              Kategori tidak bisa diganti. Hapus anggaran ini bila mau memakai kategori lain.
            </p>
          </>
        ) : (
          <>
            <select
              id="a-kategori"
              className="field appearance-none"
              value={kategori}
              onChange={(e) => setKategori(e.target.value)}
            >
              <option value="" disabled className="bg-ink-800">Pilih kategori</option>
              {opsi.map((nama) => (
                <option key={nama} value={nama} className="bg-ink-800">{nama}</option>
              ))}
              <option value={KATEGORI_LAIN} className="bg-ink-800">Tulis kategori lain…</option>
            </select>
            {kategori === KATEGORI_LAIN && (
              <input
                type="text"
                className="field mt-3"
                placeholder="Contoh: Kopi Harian"
                value={kategoriLain}
                onChange={(e) => setKategoriLain(e.target.value)}
                aria-label="Nama kategori baru"
                autoFocus
              />
            )}
          </>
        )}
      </div>

      <div>
        <label className="label" htmlFor="a-batas">Batas Pengeluaran (Rupiah)</label>
        <input
          id="a-batas"
          type="number"
          inputMode="numeric"
          min={1}
          step={1000}
          className="field tabular-nums"
          placeholder="Contoh: 1500000"
          value={batas}
          onChange={(e) => setBatas(e.target.value)}
        />
        {Number(batas) > 0 && (
          <p className="text-micro text-white/70 mt-1.5 ml-1 tabular-nums">
            {formatIDR(Number(batas))}
          </p>
        )}
      </div>

      <button type="submit" disabled={sibuk} className="btn-primary w-full mt-2">
        <Save size={18} /> {mengubah ? 'Simpan Perubahan' : 'Simpan Anggaran'}
      </button>
    </form>
  );
}

function KonfirmasiHapus({
  anggaran, sibuk, onBatal, onHapus,
}: {
  anggaran: Anggaran;
  sibuk: boolean;
  onBatal: () => void;
  onHapus: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="w-12 h-12 rounded-2xl bg-danger-500/20 text-danger-400 flex items-center justify-center">
        <AlertTriangle size={24} />
      </div>
      <h2 className="text-xl font-bold pr-10">Hapus Anggaran</h2>
      <p className="text-sm text-white/80">
        Batas untuk kategori <strong className="text-white">{anggaran.category}</strong> akan dihapus.
        Transaksi yang sudah tercatat tidak ikut terhapus.
      </p>
      <div className="flex gap-3 pt-2">
        <button type="button" onClick={onBatal} className="btn-ghost flex-1">Batal</button>
        <button type="button" onClick={onHapus} disabled={sibuk} className="btn-danger flex-1">
          <Trash2 size={18} /> Hapus
        </button>
      </div>
    </div>
  );
}
