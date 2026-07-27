import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowDownRight,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  Wallet as WalletIcon,
  Filter
} from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '../lib/supabase';
import { useFinanceStore } from '../store/useFinanceStore';
import type { Transaction } from '../store/useFinanceStore';
import { safeMutate, pesanError } from '../lib/db';
import { rentangSiklus } from '../utils/dateUtils';

const NAMA_BULAN = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

function rupiah(nilai: number): string {
  const angka = Number.isFinite(nilai) ? nilai : 0;
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(angka);
}

function formatTanggalJam(iso: string) {
  const d = new Date(iso);
  const tgl = String(d.getDate()).padStart(2, '0');
  const bln = String(d.getMonth() + 1).padStart(2, '0');
  const thn = d.getFullYear();
  const jam = String(d.getHours()).padStart(2, '0');
  const mnt = String(d.getMinutes()).padStart(2, '0');
  return `${tgl}/${bln}/${thn} ${jam}:${mnt}`;
}

type TipeLaporan = 'bulanan' | 'mingguan' | 'kustom';

function formatTanggalMingguan(senin: Date): string {
  const minggu = new Date(senin.getTime() + 6 * 86400000);
  const dSenin = senin.getDate();
  const dMinggu = minggu.getDate();
  const mSenin = NAMA_BULAN[senin.getMonth()].slice(0, 3);
  const mMinggu = NAMA_BULAN[minggu.getMonth()].slice(0, 3);
  const ySenin = senin.getFullYear();
  const yMinggu = minggu.getFullYear();

  if (ySenin !== yMinggu) {
    return `${dSenin} ${mSenin} ${ySenin} - ${dMinggu} ${mMinggu} ${yMinggu}`;
  }
  if (mSenin !== mMinggu) {
    return `${dSenin} ${mSenin} - ${dMinggu} ${mMinggu} ${ySenin}`;
  }
  return `${dSenin} - ${dMinggu} ${mSenin} ${ySenin}`;
}

/** Membungkus nilai CSV hanya bila mengandung koma, kutip, atau baris baru. */
function selCsv(nilai: string): string {
  const bersih = (nilai ?? '').replace(/\r?\n/g, ' ');
  return /[",]/.test(bersih) ? `"${bersih.replace(/"/g, '""')}"` : bersih;
}

interface CashbookRow {
  id: string;
  created_at: string;
  title: string;
  category: string | null;
  type: 'income' | 'expense' | 'transfer';
  wallet_id: string;
  to_wallet_id?: string | null;
  debit: number; // Uang masuk
  kredit: number; // Uang keluar
  saldo: number;
}

export default function Cashbook() {
  const { wallets, fetchWallets, activeTabId } = useFinanceStore();

  const sekarang = new Date();
  const [periode, setPeriode] = useState({
    tahun: sekarang.getFullYear(),
    bulan: sekarang.getMonth(),
  });
  const [tipeLaporan, setTipeLaporan] = useState<TipeLaporan>('bulanan');
  const [rentangMingguan, setRentangMingguan] = useState<Date>(() => {
    const d = new Date();
    const day = d.getDay() === 0 ? 7 : d.getDay();
    d.setDate(d.getDate() - day + 1);
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [rentangKustom, setRentangKustom] = useState({
    mulai: sekarang.toISOString().split('T')[0],
    selesai: sekarang.toISOString().split('T')[0],
  });
  
  const [transaksi, setTransaksi] = useState<Transaction[]>([]);
  const [saldoAwal, setSaldoAwal] = useState<number>(0);
  const [memuat, setMemuat] = useState(true);
  const [selectedWallet, setSelectedWallet] = useState<string>('all');

  useEffect(() => {
    if (wallets === null) fetchWallets();
  }, [wallets, fetchWallets]);

  useEffect(() => {
    if (!activeTabId) return;

    let dibatalkan = false;

    const muat = async () => {
      setMemuat(true);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Sesi kamu sudah berakhir. Silakan masuk ulang.');

        const prefRow = await safeMutate<{ tanggal_mulai_bulan: number }[]>(
          supabase.from('user_preferences').select('tanggal_mulai_bulan').eq('user_id', user.id).limit(1),
          'Gagal memuat preferensi bulan'
        );
        const tgl = prefRow?.[0]?.tanggal_mulai_bulan ?? 1;

        let mulaiCari: Date;
        let batasCari: Date;

        if (tipeLaporan === 'bulanan') {
          mulaiCari = rentangSiklus(periode.tahun, periode.bulan, tgl).mulai;
          batasCari = rentangSiklus(periode.tahun, periode.bulan, tgl).selesai;
        } else if (tipeLaporan === 'mingguan') {
          mulaiCari = new Date(rentangMingguan);
          batasCari = new Date(rentangMingguan);
          batasCari.setDate(batasCari.getDate() + 7);
        } else {
          const m = new Date(rentangKustom.mulai);
          m.setHours(0, 0, 0, 0);
          const s = new Date(rentangKustom.selesai);
          s.setHours(23, 59, 59, 999);
          batasCari = new Date(s.getTime() + 1);
          const durasi = batasCari.getTime() - m.getTime();
          mulaiCari = new Date(m.getTime() - durasi);
        }

        // Fetch Total Initial Balance of all wallets in this tab (or selected wallet)
        let walletQuery = supabase
          .from('wallets')
          .select('id, initial_balance')
          .eq('user_id', user.id)
          .eq('tab_id', activeTabId);
          
        if (selectedWallet !== 'all') {
          walletQuery = walletQuery.eq('id', selectedWallet);
        }

        const dompetData = await safeMutate<{id: string, initial_balance: number}[]>(walletQuery, 'Gagal memuat dompet');
        const sumInitialBalance = (dompetData ?? []).reduce((acc, w) => acc + Number(w.initial_balance || 0), 0);

        // Fetch all transactions BEFORE mulaiCari to calculate opening balance
        let pastTrxQuery = supabase
          .from('transactions')
          .select('id, wallet_id, to_wallet_id, type, amount, category, title, created_at')
          .eq('user_id', user.id)
          .eq('tab_id', activeTabId)
          .lt('created_at', mulaiCari.toISOString());

        const pastData = await safeMutate<Transaction[]>(pastTrxQuery, 'Gagal memuat riwayat saldo');
        
        let openingBalance = sumInitialBalance;
        if (pastData) {
          for (const t of pastData) {
            const amt = Number(t.amount) || 0;
            if (selectedWallet !== 'all') {
              if (t.wallet_id === selectedWallet && t.type === 'expense') openingBalance -= amt;
              if (t.wallet_id === selectedWallet && t.type === 'income') openingBalance += amt;
              if (t.wallet_id === selectedWallet && t.type === 'transfer') openingBalance -= amt;
              if (t.to_wallet_id === selectedWallet && t.type === 'transfer') openingBalance += amt;
            } else {
              if (t.type === 'income') openingBalance += amt;
              if (t.type === 'expense') openingBalance -= amt;
              // Transfers cancel out in 'all' view
            }
          }
        }

        if (!dibatalkan) setSaldoAwal(openingBalance);

        // Fetch transactions FOR THE PERIOD
        let periodTrxQuery = supabase
          .from('transactions')
          .select('id, wallet_id, to_wallet_id, type, amount, category, title, created_at')
          .eq('user_id', user.id)
          .eq('tab_id', activeTabId)
          .gte('created_at', mulaiCari.toISOString())
          .lt('created_at', batasCari.toISOString())
          .order('created_at', { ascending: true }); // We calculate chronologically then reverse

        const periodData = await safeMutate<Transaction[]>(periodTrxQuery, 'Gagal memuat data buku kas');
        
        if (!dibatalkan) {
          // Filter if specific wallet is selected
          let finalData = periodData ?? [];
          if (selectedWallet !== 'all') {
            finalData = finalData.filter(t => t.wallet_id === selectedWallet || t.to_wallet_id === selectedWallet);
          }
          setTransaksi(finalData);
        }
      } catch (error) {
        if (!dibatalkan) {
          setTransaksi([]);
          setSaldoAwal(0);
          toast.error(pesanError(error, 'Gagal memuat buku kas'));
        }
      } finally {
        if (!dibatalkan) setMemuat(false);
      }
    };

    muat();
    return () => { dibatalkan = true; };
  }, [periode.tahun, periode.bulan, tipeLaporan, rentangMingguan, rentangKustom, activeTabId, selectedWallet]);

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

  const bukuKas: CashbookRow[] = useMemo(() => {
    let runningBalance = saldoAwal;
    const baris: CashbookRow[] = [];

    for (const t of transaksi) {
      const amt = Number(t.amount) || 0;
      let debit = 0;
      let kredit = 0;

      if (selectedWallet !== 'all') {
        if (t.wallet_id === selectedWallet && t.type === 'expense') kredit = amt;
        if (t.wallet_id === selectedWallet && t.type === 'income') debit = amt;
        if (t.wallet_id === selectedWallet && t.type === 'transfer') kredit = amt;
        if (t.to_wallet_id === selectedWallet && t.type === 'transfer') debit = amt;
      } else {
        if (t.type === 'income') debit = amt;
        if (t.type === 'expense') kredit = amt;
        // Transfer does not affect total balance, unless it's an outside transfer, 
        // but within app transfers to other tab are not possible yet.
      }

      runningBalance = runningBalance + debit - kredit;

      baris.push({
        id: t.id,
        created_at: t.created_at,
        title: t.title,
        category: t.category ?? null,
        type: t.type,
        wallet_id: t.wallet_id,
        to_wallet_id: t.to_wallet_id ?? null,
        debit,
        kredit,
        saldo: runningBalance
      });
    }

    // NEWEST TO OLDEST
    return baris.reverse();
  }, [transaksi, saldoAwal, selectedWallet]);

  const ringkasan = useMemo(() => {
    let totMasuk = 0;
    let totKeluar = 0;
    for (const r of bukuKas) {
      totMasuk += r.debit;
      totKeluar += r.kredit;
    }
    const saldoAkhir = saldoAwal + totMasuk - totKeluar;
    const arusKas = totMasuk - totKeluar;
    return { totMasuk, totKeluar, saldoAkhir, arusKas };
  }, [bukuKas, saldoAwal]);

  const labelPeriodeLengkap = useMemo(() => {
    if (tipeLaporan === 'mingguan') return formatTanggalMingguan(rentangMingguan);
    if (tipeLaporan === 'kustom') return `${rentangKustom.mulai} s/d ${rentangKustom.selesai}`;
    return `${NAMA_BULAN[periode.bulan]} ${periode.tahun}`;
  }, [tipeLaporan, rentangMingguan, rentangKustom, periode.tahun, periode.bulan]);

  const hari = new Date();
  const bisaMaju =
    periode.tahun < hari.getFullYear() ||
    (periode.tahun === hari.getFullYear() && periode.bulan < hari.getMonth());

  const geserBulan = (langkah: number) => {
    setPeriode((p) => {
      const d = new Date(p.tahun, p.bulan + langkah, 1);
      return { tahun: d.getFullYear(), bulan: d.getMonth() };
    });
  };

  const eksporCSV = () => {
    if (bukuKas.length === 0 && saldoAwal === 0) {
      toast.error('Tidak ada data untuk diekspor');
      return;
    }
    const barisCsv: string[] = [
      'Waktu,Dompet,Judul,Kategori,Tipe,Pemasukan (Debit),Pengeluaran (Kredit),Saldo Berjalan',
    ];
    
    // Add opening balance row
    barisCsv.push(`"${labelPeriodeLengkap} (Awal)",-,"SALDO AWAL",-,-,-,-,${saldoAwal}`);

    // Since users want chronologically for accounting exports, we reverse it back to oldest->newest for CSV
    const copyBukuKas = [...bukuKas].reverse();

    for (const r of copyBukuKas) {
      const wName = namaDompet.get(r.wallet_id) ?? '-';
      const toWName = r.to_wallet_id ? (namaDompet.get(r.to_wallet_id) ?? '-') : '-';
      const dompetText = r.type === 'transfer' ? `${wName} -> ${toWName}` : wName;
      
      barisCsv.push(
        `${selCsv(formatTanggalJam(r.created_at))},${selCsv(dompetText)},${selCsv(r.title)},${selCsv(
          r.category ?? ''
        )},${r.type},${r.debit},${r.kredit},${r.saldo}`
      );
    }
    
    // Add closing balance row
    barisCsv.push(`"${labelPeriodeLengkap} (Akhir)",-,"SALDO AKHIR",-,-,-,-,${ringkasan.saldoAkhir}`);

    const blob = new Blob([barisCsv.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `buku_kas_duitkita_${labelPeriodeLengkap.replace(/[/\\?%*:|"<>]/g, '-')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="page min-h-[100dvh] pb-32 px-4 pt-4 md:px-8 md:pt-6"
    >
      {/* HEADER */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-white font-bold text-2xl">Buku Kas</h1>
          <p className="text-white/70 text-sm">Rekap perjalanan uangmu</p>
        </div>
        <button
          onClick={eksporCSV}
          disabled={memuat}
          className="bg-white/10 p-2 rounded-xl border border-white/20 active:scale-95 disabled:opacity-50 transition-transform"
        >
          <Download size={20} className="text-white" />
        </button>
      </div>

      {/* FILTER */}
      <div className="bg-white/5 backdrop-blur-md rounded-2xl border border-white/10 p-4 mb-6 space-y-4">
        {/* Tipe Rentang */}
        <div className="flex bg-white/5 rounded-xl p-1 gap-1">
          {(['bulanan', 'mingguan', 'kustom'] as const).map((tipe) => (
            <button
              key={tipe}
              onClick={() => setTipeLaporan(tipe)}
              className={`flex-1 text-sm font-semibold py-2 rounded-lg transition-colors capitalize ${
                tipeLaporan === tipe
                  ? 'bg-brand-500 text-white shadow-md'
                  : 'text-white/60 hover:text-white hover:bg-white/5'
              }`}
            >
              {tipe}
            </button>
          ))}
        </div>

        {/* Kontrol Waktu */}
        <div className="flex items-center justify-between gap-4">
          {tipeLaporan === 'bulanan' && (
            <div className="flex items-center w-full bg-black/20 rounded-xl px-2">
              <button
                onClick={() => geserBulan(-1)}
                className="p-3 active:scale-90 text-white/70 hover:text-white transition-all"
              >
                <ChevronLeft size={20} />
              </button>
              <div className="flex-1 flex flex-col items-center justify-center py-1">
                <span className="text-brand-300 text-xs font-bold uppercase tracking-wider">
                  Bulan
                </span>
                <select
                  value={periode.tahun}
                  onChange={(e) => setPeriode({ ...periode, tahun: Number(e.target.value) })}
                  className="bg-transparent text-white font-bold text-center appearance-none cursor-pointer outline-none w-auto"
                >
                  {daftarTahun.map((thn) => (
                    <option key={thn} value={thn} className="bg-slate-900">
                      {NAMA_BULAN[periode.bulan]} {thn}
                    </option>
                  ))}
                </select>
              </div>
              <button
                onClick={() => geserBulan(1)}
                disabled={!bisaMaju}
                className="p-3 active:scale-90 text-white/70 hover:text-white transition-all disabled:opacity-30"
              >
                <ChevronRight size={20} />
              </button>
            </div>
          )}

          {tipeLaporan === 'mingguan' && (
            <div className="flex items-center w-full bg-black/20 rounded-xl px-2">
              <button
                onClick={() => {
                  const baru = new Date(rentangMingguan);
                  baru.setDate(baru.getDate() - 7);
                  setRentangMingguan(baru);
                }}
                className="p-3 active:scale-90 text-white/70 hover:text-white transition-all"
              >
                <ChevronLeft size={20} />
              </button>
              <div className="flex-1 flex flex-col items-center justify-center py-2">
                <span className="text-brand-300 text-xs font-bold uppercase tracking-wider mb-1">
                  Minggu
                </span>
                <span className="text-white font-bold text-sm text-center">
                  {labelPeriodeLengkap}
                </span>
              </div>
              <button
                onClick={() => {
                  const baru = new Date(rentangMingguan);
                  baru.setDate(baru.getDate() + 7);
                  setRentangMingguan(baru);
                }}
                disabled={rentangMingguan.getTime() + 6 * 86400000 >= hari.getTime()}
                className="p-3 active:scale-90 text-white/70 hover:text-white transition-all disabled:opacity-30"
              >
                <ChevronRight size={20} />
              </button>
            </div>
          )}

          {tipeLaporan === 'kustom' && (
            <div className="flex w-full gap-2">
              <div className="flex-1">
                <label className="text-white/60 text-xs block mb-1">Dari</label>
                <input
                  type="date"
                  value={rentangKustom.mulai}
                  onChange={(e) => setRentangKustom({ ...rentangKustom, mulai: e.target.value })}
                  className="w-full bg-black/20 border border-white/10 rounded-xl px-3 py-2 text-white text-sm"
                />
              </div>
              <div className="flex-1">
                <label className="text-white/60 text-xs block mb-1">Sampai</label>
                <input
                  type="date"
                  value={rentangKustom.selesai}
                  onChange={(e) => setRentangKustom({ ...rentangKustom, selesai: e.target.value })}
                  min={rentangKustom.mulai}
                  className="w-full bg-black/20 border border-white/10 rounded-xl px-3 py-2 text-white text-sm"
                />
              </div>
            </div>
          )}
        </div>
        
        {/* Filter Dompet */}
        <div className="relative">
           <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
             <Filter size={16} className="text-white/50" />
           </div>
           <select 
              value={selectedWallet}
              onChange={(e) => setSelectedWallet(e.target.value)}
              className="w-full bg-black/20 border border-white/10 rounded-xl pl-9 pr-4 py-3 text-white text-sm appearance-none outline-none focus:ring-1 focus:ring-brand-500"
            >
              <option value="all" className="bg-slate-900">Semua Dompet</option>
              {(wallets ?? []).map(w => (
                <option key={w.id} value={w.id} className="bg-slate-900">{w.name}</option>
              ))}
            </select>
        </div>
      </div>

      {memuat ? (
        <div className="flex flex-col items-center justify-center py-20">
          <Loader2 size={32} className="animate-spin text-brand-400 mb-4" />
          <p className="text-white/60">Menghitung buku kas...</p>
        </div>
      ) : (
        <>
          {/* ANALISIS ARUS KAS */}
          <div className="grid grid-cols-2 gap-3 mb-6">
            <div className="bg-white/5 rounded-2xl p-4 border border-white/10 relative overflow-hidden group">
               <div className="absolute -right-4 -top-4 w-16 h-16 bg-brand-500/10 rounded-full blur-xl group-hover:bg-brand-500/20 transition-colors"></div>
               <p className="text-white/60 text-xs font-medium mb-1">Saldo Awal</p>
               <p className="text-white font-bold text-lg">{rupiah(saldoAwal)}</p>
            </div>
            <div className="bg-white/5 rounded-2xl p-4 border border-white/10 relative overflow-hidden group">
               <div className="absolute -right-4 -top-4 w-16 h-16 bg-brand-500/10 rounded-full blur-xl group-hover:bg-brand-500/20 transition-colors"></div>
               <p className="text-white/60 text-xs font-medium mb-1">Saldo Akhir</p>
               <p className="text-white font-bold text-lg">{rupiah(ringkasan.saldoAkhir)}</p>
            </div>
            <div className="bg-ok-500/10 rounded-2xl p-4 border border-ok-500/20 flex flex-col justify-between">
               <div className="flex items-center gap-2 mb-2">
                 <ArrowDownRight size={14} className="text-ok-400" />
                 <p className="text-ok-400/80 text-xs font-medium">Debit (Masuk)</p>
               </div>
               <p className="text-ok-400 font-bold text-lg">{rupiah(ringkasan.totMasuk)}</p>
            </div>
            <div className="bg-danger-500/10 rounded-2xl p-4 border border-danger-500/20 flex flex-col justify-between">
               <div className="flex items-center gap-2 mb-2">
                 <ArrowUpRight size={14} className="text-danger-400" />
                 <p className="text-danger-400/80 text-xs font-medium">Kredit (Keluar)</p>
               </div>
               <p className="text-danger-400 font-bold text-lg">{rupiah(ringkasan.totKeluar)}</p>
            </div>
          </div>
          
          <div className="bg-white/5 rounded-2xl p-4 border border-white/10 mb-8 flex justify-between items-center">
             <div>
                <p className="text-white/60 text-xs font-medium mb-1">Arus Kas Bersih (Cash Flow)</p>
                <p className={`font-bold text-xl ${ringkasan.arusKas >= 0 ? 'text-ok-400' : 'text-danger-400'}`}>
                  {ringkasan.arusKas >= 0 ? '+' : ''}{rupiah(ringkasan.arusKas)}
                </p>
             </div>
          </div>

          {/* TABEL BUKU KAS (CARD LIST) */}
          <h3 className="text-white font-bold text-lg mb-4">Mutasi Kas</h3>
          
          {bukuKas.length === 0 ? (
            <div className="text-center py-10 bg-white/5 rounded-2xl border border-white/10">
               <WalletIcon size={40} className="text-white/20 mx-auto mb-3" />
               <p className="text-white/50 text-sm">Belum ada mutasi di periode ini.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {bukuKas.map((row) => (
                <div key={row.id} className="bg-black/20 rounded-2xl p-4 border border-white/5">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <p className="text-white font-semibold text-sm">{row.title}</p>
                      <p className="text-white/50 text-[10px] uppercase tracking-wider">{row.category || (row.type === 'transfer' ? 'Transfer' : 'Tanpa Kategori')}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-white/40 text-[10px]">{formatTanggalJam(row.created_at)}</p>
                      <p className="text-white/30 text-[9px] mt-0.5">
                        {row.type === 'transfer' ? `${namaDompet.get(row.wallet_id) ?? '-'} ➔ ${row.to_wallet_id ? (namaDompet.get(row.to_wallet_id) ?? '-') : '-'}` : (namaDompet.get(row.wallet_id) ?? '-')}
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex justify-between items-end mt-4 pt-3 border-t border-white/5">
                    <div className="flex gap-4">
                      {row.debit > 0 && (
                        <div>
                          <p className="text-ok-400/50 text-[10px] mb-0.5">Debit</p>
                          <p className="text-ok-400 font-medium text-sm">+{rupiah(row.debit)}</p>
                        </div>
                      )}
                      {row.kredit > 0 && (
                        <div>
                          <p className="text-danger-400/50 text-[10px] mb-0.5">Kredit</p>
                          <p className="text-danger-400 font-medium text-sm">-{rupiah(row.kredit)}</p>
                        </div>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-brand-300/50 text-[10px] mb-0.5">Saldo</p>
                      <p className="text-brand-300 font-bold text-sm">{rupiah(row.saldo)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </motion.div>
  );
}
