import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Download,
  Inbox,
  Loader2,
  Minus,
  PieChart,
  Printer,
  Receipt,
  Scale,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '../lib/supabase';
import { useFinanceStore } from '../store/useFinanceStore';
import type { Transaction } from '../store/useFinanceStore';
import { safeMutate, pesanError } from '../lib/db';
import { api, pesanApi } from '../lib/api';

const NAMA_BULAN = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

const LABEL_TIPE: Record<Transaction['type'], string> = {
  income: 'Pemasukan',
  expense: 'Pengeluaran',
  transfer: 'Transfer',
};

type ArahDelta = 'naik' | 'turun' | 'tetap' | 'baru';

interface Delta {
  arah: ArahDelta;
  teks: string;
}

interface BarisKategori extends Delta {
  nama: string;
  jumlah: number;
  sebelumnya: number;
  /** Bagian kategori ini terhadap total pengeluaran bulan berjalan (0..1). */
  porsi: number;
}

/**
 * Naik = merah, turun = hijau: ini daftar PENGELUARAN, jadi belanja yang
 * membengkak adalah kabar buruk, bukan sebaliknya.
 */
const GAYA_DELTA: Record<ArahDelta, { Ikon: typeof ArrowUpRight; kelas: string }> = {
  naik: { Ikon: ArrowUpRight, kelas: 'text-danger-400' },
  turun: { Ikon: ArrowDownRight, kelas: 'text-ok-400' },
  tetap: { Ikon: Minus, kelas: 'text-white/70' },
  baru: { Ikon: Sparkles, kelas: 'text-warn-400' },
};

/**
 * Aturan khusus cetak.
 *
 * Halaman dibungkus <motion.div> yang punya `transform`, dan `body` memakai
 * `overflow: hidden`. Keduanya membuat hasil cetak melenceng dan terpotong di
 * halaman pertama, jadi saat mencetak keduanya dimatikan lalu hanya
 * #area-laporan yang dimunculkan kembali.
 */
const GAYA_CETAK = `
@media print {
  @page { margin: 12mm; }

  html, body {
    overflow: visible !important;
    height: auto !important;
    background: #fff !important;
  }

  /* .bar-isi dikecualikan: panjang batangnya memang digambar dengan scaleX,
     kalau transform-nya dibuang semua batang jadi penuh dan menyesatkan. */
  body *:not(.bar-isi) { transform: none !important; animation: none !important; }
  body * { overflow: visible !important; }
  body *:not(#area-laporan) { position: static !important; }

  body > * { visibility: hidden; }
  #area-laporan, #area-laporan * { visibility: visible !important; }

  #area-laporan {
    position: absolute !important;
    left: 0 !important;
    top: 0 !important;
    width: 100% !important;
  }

  /* Tema gelap boros tinta dan tidak terbaca di kertas putih. */
  #area-laporan, #area-laporan * {
    color: #000 !important;
    background: transparent !important;
    box-shadow: none !important;
    text-shadow: none !important;
    -webkit-backdrop-filter: none !important;
    backdrop-filter: none !important;
    border-color: #9ca3af !important;
  }

  #area-laporan .bar-latar {
    background: #e5e7eb !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  #area-laporan .bar-isi {
    background: #4b5563 !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
}
`;

function rupiah(nilai: number): string {
  const angka = Number.isFinite(nilai) ? nilai : 0;
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(angka);
}

function duaDigit(n: number): string {
  return String(n).padStart(2, '0');
}

/** Transfer tidak pernah ikut dijumlahkan: uangnya cuma pindah antar dompet sendiri. */
function jumlahkan(daftar: Transaction[], tipe: Transaction['type']): number {
  return daftar.reduce(
    (total, t) => (t.type === tipe ? total + (Number(t.amount) || 0) : total),
    0,
  );
}

function kelompokPengeluaran(daftar: Transaction[]): Map<string, number> {
  const peta = new Map<string, number>();
  for (const t of daftar) {
    if (t.type !== 'expense') continue;
    // Kolom category boleh null di database, dan bisa berisi spasi doang.
    const nama = (t.category ?? '').trim() || 'Tanpa Kategori';
    peta.set(nama, (peta.get(nama) ?? 0) + (Number(t.amount) || 0));
  }
  return peta;
}

function bandingkan(sekarang: number, sebelumnya: number): Delta {
  // Pembagian dengan nol menghasilkan Infinity, jadi kasus "bulan lalu nol"
  // ditangani sebagai kategori baru, bukan sebagai kenaikan tak terhingga.
  if (sebelumnya <= 0) {
    return sekarang > 0
      ? { arah: 'baru', teks: 'Baru bulan ini' }
      : { arah: 'tetap', teks: 'Belum ada data' };
  }
  const persen = ((sekarang - sebelumnya) / sebelumnya) * 100;
  if (Math.abs(persen) < 1) return { arah: 'tetap', teks: 'Sama seperti bulan lalu' };
  return persen > 0
    ? { arah: 'naik', teks: `Naik ${Math.round(persen)}%` }
    : { arah: 'turun', teks: `Turun ${Math.round(Math.abs(persen))}%` };
}

/** Membungkus nilai CSV hanya bila mengandung koma, kutip, atau baris baru. */
function selCsv(nilai: string): string {
  const bersih = (nilai ?? '').replace(/\r?\n/g, ' ');
  return /[",]/.test(bersih) ? `"${bersih.replace(/"/g, '""')}"` : bersih;
}

export default function Reports() {
  const { wallets, fetchWallets } = useFinanceStore();

  const sekarang = new Date();
  const [periode, setPeriode] = useState({
    tahun: sekarang.getFullYear(),
    bulan: sekarang.getMonth(),
  });
  const [transaksi, setTransaksi] = useState<Transaction[]>([]);
  const [memuat, setMemuat] = useState(true);
  const [insight, setInsight] = useState<string | null>(null);
  const [memuatInsight, setMemuatInsight] = useState(false);

  useEffect(() => {
    // Nama dompet dipakai di kolom CSV; kalau cache kosong, ambil sekali saja.
    if (wallets === null) fetchWallets();
  }, [wallets, fetchWallets]);

  useEffect(() => {
    let dibatalkan = false;

    const muat = async () => {
      setMemuat(true);
      setInsight(null);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Sesi kamu sudah berakhir. Silakan masuk ulang.');

        // Sekali ambil untuk DUA bulan (bulan lalu + bulan ini) supaya
        // perbandingan tidak butuh permintaan jaringan kedua.
        const mulai = new Date(periode.tahun, periode.bulan - 1, 1);
        const batas = new Date(periode.tahun, periode.bulan + 1, 1);

        const data = await safeMutate<Transaction[]>(
          supabase
            .from('transactions')
            .select('id, wallet_id, to_wallet_id, type, amount, category, title, created_at')
            .eq('user_id', user.id)
            .gte('created_at', mulai.toISOString())
            .lt('created_at', batas.toISOString())
            .order('created_at', { ascending: true }),
          'Gagal memuat data laporan',
        );

        if (!dibatalkan) setTransaksi(data ?? []);
      } catch (error) {
        // Penanda dibatalkan mencegah balasan bulan lama menimpa bulan yang
        // baru saja dipilih pengguna saat koneksi lambat.
        if (!dibatalkan) {
          setTransaksi([]);
          toast.error(pesanError(error, 'Gagal memuat data laporan'));
        }
      } finally {
        if (!dibatalkan) setMemuat(false);
      }
    };

    muat();
    return () => { dibatalkan = true; };
  }, [periode.tahun, periode.bulan]);

  const namaDompet = useMemo(() => {
    const peta = new Map<string, string>();
    for (const w of wallets ?? []) peta.set(w.id, w.name);
    return peta;
  }, [wallets]);

  const daftarTahun = useMemo(() => {
    const tahunIni = new Date().getFullYear();
    const awal = Math.min(tahunIni - 4, periode.tahun);
    const akhir = Math.max(tahunIni, periode.tahun);
    const hasil: number[] = [];
    for (let t = akhir; t >= awal; t--) hasil.push(t);
    return hasil;
  }, [periode.tahun]);

  const laporan = useMemo(() => {
    const awalBulanIni = new Date(periode.tahun, periode.bulan, 1).getTime();
    const bulanIni: Transaction[] = [];
    const bulanLalu: Transaction[] = [];

    for (const t of transaksi) {
      const waktu = new Date(t.created_at).getTime();
      if (!Number.isFinite(waktu)) continue; // created_at rusak/null -> abaikan
      if (waktu >= awalBulanIni) bulanIni.push(t);
      else bulanLalu.push(t);
    }

    const pemasukan = jumlahkan(bulanIni, 'income');
    const pengeluaran = jumlahkan(bulanIni, 'expense');
    const pemasukanLalu = jumlahkan(bulanLalu, 'income');
    const pengeluaranLalu = jumlahkan(bulanLalu, 'expense');

    const petaIni = kelompokPengeluaran(bulanIni);
    const petaLalu = kelompokPengeluaran(bulanLalu);

    const kategori: BarisKategori[] = Array.from(petaIni.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([nama, jumlah]) => {
        const sebelumnya = petaLalu.get(nama) ?? 0;
        return {
          nama,
          jumlah,
          sebelumnya,
          porsi: pengeluaran > 0 ? jumlah / pengeluaran : 0,
          ...bandingkan(jumlah, sebelumnya),
        };
      });

    return {
      bulanIni,
      pemasukan,
      pengeluaran,
      pemasukanLalu,
      pengeluaranLalu,
      selisih: pemasukan - pengeluaran,
      jumlahTransaksi: bulanIni.length,
      kategori,
      kategoriTeratas: kategori[0]?.nama ?? 'Belum ada',
      deltaPengeluaran: bandingkan(pengeluaran, pengeluaranLalu),
      deltaPemasukan: bandingkan(pemasukan, pemasukanLalu),
    };
  }, [transaksi, periode.tahun, periode.bulan]);

  const bulanLaluLabel = useMemo(() => {
    const d = new Date(periode.tahun, periode.bulan - 1, 1);
    return `${NAMA_BULAN[d.getMonth()]} ${d.getFullYear()}`;
  }, [periode.tahun, periode.bulan]);

  const hari = new Date();
  const bisaMaju =
    periode.tahun < hari.getFullYear() ||
    (periode.tahun === hari.getFullYear() && periode.bulan < hari.getMonth());

  const geserBulan = (langkah: number) => {
    setPeriode((p) => {
      // Lewat objek Date supaya Desember -> Januari ikut menaikkan tahunnya.
      const d = new Date(p.tahun, p.bulan + langkah, 1);
      return { tahun: d.getFullYear(), bulan: d.getMonth() };
    });
  };

  const labelDompet = (t: Transaction) => {
    const nama = (id?: string | null) =>
      id ? namaDompet.get(id) ?? 'Dompet terhapus' : '-';
    return t.type === 'transfer'
      ? `${nama(t.wallet_id)} -> ${nama(t.to_wallet_id)}`
      : nama(t.wallet_id);
  };

  const mintaInsight = async () => {
    if (laporan.jumlahTransaksi === 0) {
      toast.error('Belum ada transaksi di bulan ini');
      return;
    }
    setMemuatInsight(true);
    try {
      const { data } = await api.post<{ roast?: string }>('/api/scan/roast', {
        income: laporan.pemasukan,
        expense: laporan.pengeluaran,
        topCategory: laporan.kategoriTeratas,
      });
      const teks = (data?.roast ?? '').trim();
      if (!teks) throw new Error('Balasan AI kosong. Coba lagi sebentar lagi.');
      setInsight(teks);
    } catch (error) {
      setInsight(null);
      toast.error(pesanApi(error, 'Gagal mengambil insight AI'));
    } finally {
      setMemuatInsight(false);
    }
  };

  const unduhCsv = () => {
    if (laporan.jumlahTransaksi === 0) {
      toast.error('Tidak ada transaksi untuk diunduh');
      return;
    }
    try {
      const judul = ['Tanggal', 'Tipe', 'Kategori', 'Judul', 'Nominal', 'Dompet'].join(',');
      const isi = laporan.bulanIni.map((t) => {
        const d = new Date(t.created_at);
        const tanggal = `${duaDigit(d.getDate())}/${duaDigit(d.getMonth() + 1)}/${d.getFullYear()} ${duaDigit(d.getHours())}:${duaDigit(d.getMinutes())}`;
        return [
          selCsv(tanggal),
          selCsv(LABEL_TIPE[t.type] ?? t.type),
          selCsv((t.category ?? '').trim() || 'Tanpa Kategori'),
          selCsv(t.title ?? ''),
          // Nominal ditulis polos tanpa titik ribuan supaya bisa langsung
          // dijumlahkan di Excel; format Rupiah cuma untuk dilihat manusia.
          String(Math.round(Number(t.amount) || 0)),
          selCsv(labelDompet(t)),
        ].join(',');
      });

      // BOM di depan: tanpa ini Excel membaca berkas sebagai ANSI dan huruf
      // beraksen/emoji di judul transaksi berubah jadi karakter aneh.
      const berkas = new Blob(['﻿' + [judul, ...isi].join('\r\n')], {
        type: 'text/csv;charset=utf-8;',
      });

      const tautan = document.createElement('a');
      const url = URL.createObjectURL(berkas);
      tautan.href = url;
      tautan.download = `laporan-duitkita-${periode.tahun}-${duaDigit(periode.bulan + 1)}.csv`;
      document.body.appendChild(tautan);
      tautan.click();
      tautan.remove();
      // Pencabutan ditunda: sebagian browser membatalkan unduhan bila URL
      // sementara dihapus tepat setelah klik.
      setTimeout(() => URL.revokeObjectURL(url), 2000);

      toast.success('Berkas CSV berhasil dibuat');
    } catch (error) {
      toast.error(pesanError(error, 'Gagal membuat berkas CSV'));
    }
  };

  const cetakLaporan = () => {
    try {
      window.print();
    } catch {
      toast.error('Perangkat ini tidak bisa membuka dialog cetak');
    }
  };

  const kartuStat = [
    {
      label: 'Pemasukan',
      nilai: rupiah(laporan.pemasukan),
      catatan: laporan.deltaPemasukan.teks,
      Ikon: TrendingUp,
      warna: 'text-ok-400',
      latar: 'bg-ok-400/15',
    },
    {
      label: 'Pengeluaran',
      nilai: rupiah(laporan.pengeluaran),
      catatan: laporan.deltaPengeluaran.teks,
      Ikon: TrendingDown,
      warna: 'text-danger-400',
      latar: 'bg-danger-500/15',
    },
    {
      label: 'Selisih',
      nilai: rupiah(laporan.selisih),
      catatan: laporan.selisih >= 0 ? 'Masih surplus' : 'Lebih besar pasak',
      Ikon: Scale,
      warna: laporan.selisih >= 0 ? 'text-brand-300' : 'text-danger-400',
      latar: laporan.selisih >= 0 ? 'bg-brand-500/15' : 'bg-danger-500/15',
    },
    {
      label: 'Jumlah Transaksi',
      nilai: `${laporan.jumlahTransaksi}`,
      catatan: 'Termasuk transfer antar dompet',
      Ikon: Receipt,
      warna: 'text-accent-300',
      latar: 'bg-accent-500/15',
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
      className="page pb-24 relative z-10"
    >
      <style>{GAYA_CETAK}</style>

      <div className="flex flex-col items-center mb-8 print:hidden">
        <motion.div
          animate={{ y: [0, -10, 0], scale: [1, 1.05, 1] }}
          transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
          className="text-brand-300 mb-2 drop-shadow-[0_0_15px_rgba(45,212,191,0.5)]"
        >
          <BarChart3 size={64} />
        </motion.div>
        <h2 className="text-2xl font-bold text-white text-center tracking-tight">Laporan &amp; Statistik</h2>
        <p className="text-white/70 text-sm mt-1 text-center">Lihat ke mana saja uangmu pergi bulan ini</p>
      </div>

      {/* === PEMILIH BULAN === */}
      <div className="glass rounded-3xl p-3 mb-6 print:hidden">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => geserBulan(-1)}
            className="icon-btn shrink-0"
            aria-label="Bulan sebelumnya"
          >
            <ChevronLeft size={20} />
          </button>

          <div className="flex-1 grid grid-cols-2 gap-2">
            <select
              className="field"
              value={periode.bulan}
              onChange={(e) => setPeriode({ ...periode, bulan: Number(e.target.value) })}
              aria-label="Pilih bulan"
            >
              {NAMA_BULAN.map((nama, i) => (
                <option key={nama} value={i} className="bg-ink-900">{nama}</option>
              ))}
            </select>
            <select
              className="field"
              value={periode.tahun}
              onChange={(e) => setPeriode({ ...periode, tahun: Number(e.target.value) })}
              aria-label="Pilih tahun"
            >
              {daftarTahun.map((t) => (
                <option key={t} value={t} className="bg-ink-900">{t}</option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={() => geserBulan(1)}
            disabled={!bisaMaju}
            className="icon-btn shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label="Bulan berikutnya"
          >
            <ChevronRight size={20} />
          </button>
        </div>
      </div>

      {/* === AREA YANG IKUT TERCETAK === */}
      <div id="area-laporan" className="space-y-6">
        <div className="hidden print:block mb-4">
          <h1 className="text-xl font-bold">Laporan Keuangan DuitKita</h1>
          <p className="text-sm">Periode: {NAMA_BULAN[periode.bulan]} {periode.tahun}</p>
        </div>

        {memuat ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="skeleton h-24 rounded-3xl" />
              ))}
            </div>
            <div className="skeleton h-56 rounded-3xl" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              {kartuStat.map((k) => (
                <div key={k.label} className="glass rounded-3xl p-4">
                  <div className={`w-10 h-10 rounded-2xl flex items-center justify-center mb-3 ${k.latar} ${k.warna}`}>
                    <k.Ikon size={20} />
                  </div>
                  <p className="text-micro font-semibold uppercase tracking-wider text-white/70">{k.label}</p>
                  <p className={`font-bold text-lg mt-0.5 break-words ${k.warna}`} data-selectable>{k.nilai}</p>
                  <p className="text-micro text-white/70 mt-1">{k.catatan}</p>
                </div>
              ))}
            </div>

            {/* === RINCIAN PER KATEGORI === */}
            <div className="glass rounded-3xl p-5">
              <div className="flex items-center gap-3 mb-1">
                <div className="w-10 h-10 rounded-2xl bg-brand-500/15 text-brand-300 flex items-center justify-center shrink-0">
                  <PieChart size={20} />
                </div>
                <div>
                  <h3 className="text-white font-bold">Pengeluaran per Kategori</h3>
                  <p className="text-white/70 text-micro">Dibandingkan dengan {bulanLaluLabel}</p>
                </div>
              </div>

              <div className="mt-4 rounded-2xl bg-white/5 border border-white/10 p-3">
                <p className="text-white/70 text-micro">Total pengeluaran bulan lalu</p>
                <p className="text-white font-semibold" data-selectable>{rupiah(laporan.pengeluaranLalu)}</p>
              </div>

              <div className="mt-2">
                {laporan.kategori.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 py-8 text-center">
                    <Inbox size={32} className="text-white/70" />
                    <p className="text-white/70 text-sm">Belum ada pengeluaran di bulan ini.</p>
                  </div>
                ) : (
                  laporan.kategori.map((k) => {
                    const gaya = GAYA_DELTA[k.arah];
                    return (
                      <div key={k.nama} className="py-3 border-b border-white/10 last:border-0">
                        <div className="flex items-baseline justify-between gap-3">
                          <p className="text-white font-semibold text-sm truncate">{k.nama}</p>
                          <p className="text-white font-bold text-sm shrink-0" data-selectable>{rupiah(k.jumlah)}</p>
                        </div>

                        <div className="bar-latar mt-2 h-2 rounded-full bg-white/10 overflow-hidden">
                          <div
                            className="bar-isi h-full rounded-full bg-gradient-to-r from-brand-400 to-accent-500 origin-left transition-transform duration-500 ease-expo"
                            /* scaleX, bukan width: transform diproses GPU dan tidak
                               memaksa browser menata ulang halaman tiap frame.
                               Lantai 0.02 supaya kategori recehan tetap kelihatan. */
                            style={{ transform: `scaleX(${Math.max(k.porsi, 0.02)})` }}
                          />
                        </div>

                        <div className="mt-1.5 flex items-center justify-between gap-2 text-micro">
                          <span className="text-white/70">
                            {Math.round(k.porsi * 100)}% dari total &middot; sebelumnya {rupiah(k.sebelumnya)}
                          </span>
                          <span className={`inline-flex items-center gap-1 font-semibold shrink-0 ${gaya.kelas}`}>
                            <gaya.Ikon size={12} />
                            {k.teks}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* === INSIGHT AI === */}
            <div className="glass rounded-3xl p-5">
              <div className="flex items-center justify-between gap-3 mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-accent-500/15 text-accent-300 flex items-center justify-center shrink-0">
                    <Sparkles size={20} />
                  </div>
                  <div>
                    <h3 className="text-white font-bold">Insight AI</h3>
                    <p className="text-white/70 text-micro">Komentar jujur soal angka bulan ini</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={mintaInsight}
                  disabled={memuatInsight || laporan.jumlahTransaksi === 0}
                  className="btn-primary px-4 shrink-0 print:hidden"
                >
                  {memuatInsight ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                  <span className="text-sm">{memuatInsight ? 'Menganalisis' : 'Analisis'}</span>
                </button>
              </div>

              <AnimatePresence mode="wait">
                {insight ? (
                  <motion.p
                    key="isi"
                    initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                    className="bg-black/25 border border-white/10 rounded-2xl p-4 text-white/90 text-sm leading-relaxed"
                  >
                    {insight}
                  </motion.p>
                ) : (
                  <motion.p
                    key="kosong"
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="text-white/70 text-sm text-center py-3 print:hidden"
                  >
                    {laporan.jumlahTransaksi === 0
                      ? 'Catat transaksi dulu, baru AI bisa kasih komentar.'
                      : 'Tekan tombol Analisis untuk minta pendapat AI.'}
                  </motion.p>
                )}
              </AnimatePresence>
            </div>
          </>
        )}
      </div>

      {/* === EKSPOR === */}
      <div className="glass rounded-3xl p-5 mt-6 print:hidden">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-2xl bg-white/10 text-white flex items-center justify-center shrink-0">
            <Download size={20} />
          </div>
          <div>
            <h3 className="text-white font-bold">Simpan Laporan</h3>
            <p className="text-white/70 text-micro">Unduh datanya atau cetak jadi PDF</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            type="button"
            onClick={unduhCsv}
            disabled={memuat || laporan.jumlahTransaksi === 0}
            className="btn-ghost w-full"
          >
            <Download size={18} />
            Unduh CSV
          </button>
          <button
            type="button"
            onClick={cetakLaporan}
            disabled={memuat}
            className="btn-ghost w-full"
          >
            <Printer size={18} />
            Cetak / Simpan PDF
          </button>
        </div>

        <p className="text-white/70 text-micro mt-3">
          Berkas CSV berisi {laporan.jumlahTransaksi} transaksi bulan {NAMA_BULAN[periode.bulan]} {periode.tahun}.
        </p>
      </div>
    </motion.div>
  );
}
