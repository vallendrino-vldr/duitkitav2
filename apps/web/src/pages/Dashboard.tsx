import React, { useEffect, useState, lazy, Suspense } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../lib/supabase';
import { useFinanceStore, type Transaction } from '../store/useFinanceStore';
import { safeMutateOne, pesanError } from '../lib/db';
import { urlStruk } from '../lib/api';
import toast from 'react-hot-toast';
import { ArrowUpRight, ArrowDownRight, RefreshCw, ChevronDown, Pencil } from 'lucide-react';

import AtmCard from '../components/AtmCard';
import AiRoastBox from '../components/AiRoastBox';
import ProfileSheet from '../components/ProfileSheet';
import TransactionEditor from '../components/TransactionEditor';

// Pustaka grafik itu bagian terberat aplikasi (±374 KB) dan letaknya di bawah
// layar. Dimuat terpisah supaya saldo dan daftar transaksi muncul lebih dulu.
const CashflowChart = lazy(() => import('../components/CashflowChart'));

export default function Dashboard() {
  // 1. ALL HOOKS FIRST — no early returns above hooks
  const {
    wallets, transactions, profile,
    fetchWallets, fetchTransactions, fetchProfile,
    setWallets,
  } = useFinanceStore();
  const [newWalletName, setNewWalletName] = useState('');
  const [isCreatingWallet, setIsCreatingWallet] = useState(false);
  const [profilTerbuka, setProfilTerbuka] = useState(false);
  const [trxDiedit, setTrxDiedit] = useState<Transaction | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    // allSettled: satu permintaan gagal tidak boleh menggantung dua lainnya.
    void Promise.allSettled([fetchProfile(), fetchWallets(), fetchTransactions()]);
  }, []);

  // Foto profil disimpan sebagai PATH di bucket privat, jadi perlu ditukar
  // dulu jadi URL bertanda tangan sebelum bisa ditampilkan.
  useEffect(() => {
    let aktif = true;
    (async () => {
      try {
        const { data: sesi } = await supabase.auth.getSession();
        const uid = sesi.session?.user?.id;
        if (!uid) return;
        const { data } = await supabase
          .from('user_preferences')
          .select('avatar_url')
          .eq('user_id', uid)
          .maybeSingle();
        if (!aktif || !data?.avatar_url) return;
        const url = await urlStruk(data.avatar_url);
        if (aktif) setAvatarUrl(url);
      } catch (e) {
        // Foto profil bukan hal kritis: kalau gagal, huruf awal nama dipakai.
        console.error('[DASBOR] gagal memuat foto profil', e);
      }
    })();
    return () => { aktif = false; };
  }, [profilTerbuka]);

  // Tombol muat ulang WAJIB memberi tanda. Sebelumnya ia menembakkan permintaan
  // diam-diam: kalau datanya kebetulan sama, layar tidak berubah sedikit pun dan
  // tombolnya terasa rusak. Sekarang ikonnya berputar, ditahan minimal 600ms
  // supaya perputarannya sempat terlihat, lalu ditutup pesan singkat.
  const [sedangMuat, setSedangMuat] = useState(false);

  const refresh = async () => {
    if (sedangMuat) return;
    setSedangMuat(true);
    const mulai = Date.now();
    try {
      await Promise.allSettled([fetchProfile(), fetchWallets(), fetchTransactions()]);
      const sisa = 600 - (Date.now() - mulai);
      if (sisa > 0) await new Promise((r) => setTimeout(r, sisa));
      toast.success('Data diperbarui', { duration: 1500 });
    } finally {
      setSedangMuat(false);
    }
  };

  const handleCreateWallet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWalletName.trim()) return;
    setIsCreatingWallet(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Sesi berakhir. Silakan masuk ulang.');

      // safeMutateOne menolak hasil kosong; `data[0]` yang lama bisa menyisipkan
      // `undefined` ke daftar dompet dan menjatuhkan AtmCard pada render berikutnya.
      const dompetBaru = await safeMutateOne<any>(
        supabase
          .from('wallets')
          .insert({ user_id: user.id, name: newWalletName.trim(), balance: 0, initial_balance: 0 })
          .select(),
        'Gagal membuat dompet',
      );
      setWallets([...(wallets || []), dompetBaru]);
      setNewWalletName('');
      toast.success('Dompet berhasil dibuat!');
    } catch (error) {
      toast.error(pesanError(error, 'Gagal membuat dompet'));
    } finally {
      setIsCreatingWallet(false);
    }
  };

  // 2. LOADING STATE — digerbangi oleh `null` (belum pernah dimuat), BUKAN oleh
  // flag boolean. Flag `isLoadingWallets` yang lama ikut tersimpan ke localStorage
  // sebagai `true` lalu direhidrasi, sehingga spinner tidak pernah selesai.
  if (wallets === null || transactions === null) {
    return (
      <div className="flex-1 flex items-center justify-center bg-transparent flex-col gap-4">
        <div className="w-10 h-10 border-4 border-teal-400 border-t-transparent rounded-full animate-spin"></div>
        <div className="text-teal-400 text-sm font-medium animate-pulse">Menyiapkan Dasbor...</div>
      </div>
    );
  }

  // 3. FALLBACK ARRAYS — guaranteed non-null
  const safeWallets = wallets || [];
  const safeTransactions = transactions || [];

  // 4. SAFE DATA DERIVATION — only after null guards
  const income = safeTransactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
  const expense = safeTransactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);

  const categories: Record<string, number> = {};
  safeTransactions.filter(t => t.type === 'expense').forEach(t => {
    if (t.category) {
      categories[t.category] = (categories[t.category] || 0) + t.amount;
    }
  });
  const topCategory = Object.keys(categories).sort((a, b) => categories[b] - categories[a])[0] || 'Tidak Ada';

  // Group transactions by date
  const groupedTransactions = safeTransactions.reduce((groups: any, tx) => {
    const date = new Date(tx.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
    if (!groups[date]) groups[date] = [];
    groups[date].push(tx);
    return groups;
  }, {});

  const formatIDR = (num: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(num);
  };

  // 5. EMPTY WALLET STATE — blocking modal
  const isWalletEmpty = safeWallets.length === 0;

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="flex flex-col h-full relative z-10 w-full"
    >
      {/* Wallet Creation Modal (Blocking) */}
      <AnimatePresence>
        {isWalletEmpty && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xl">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white/5 backdrop-blur-xl border border-white/10 p-6 rounded-3xl w-full max-w-sm relative z-10 shadow-2xl"
            >
              <h3 className="text-white font-bold text-xl mb-2 text-center">Buat Dompet Pertama</h3>
              <p className="text-white/60 text-xs text-center mb-6">Kamu belum memiliki dompet. Buat sekarang untuk mulai mencatat keuangan.</p>
              
              <form onSubmit={handleCreateWallet} className="space-y-4">
                <div>
                  <label className="text-white/60 text-xs font-medium ml-1 mb-1 block">Nama Dompet</label>
                  <input 
                    type="text"
                    placeholder="Contoh: Dompet Utama, Rekening BCA"
                    value={newWalletName}
                    onChange={(e) => setNewWalletName(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-teal-400 transition-all"
                    required
                  />
                </div>
                <button 
                  type="submit" disabled={isCreatingWallet}
                  className="w-full bg-gradient-to-r from-teal-500 to-teal-600 text-white font-bold rounded-xl py-3 shadow-[0_0_15px_rgba(20,184,166,0.4)] mt-2"
                >
                  {isCreatingWallet ? 'Menyimpan...' : 'Buat Dompet'}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 6. FULL FEATURE RENDER — only when wallet exists */}
      {!isWalletEmpty && (
        <div className="page pb-32 space-y-6">
          {/* Header */}
          <div className="flex justify-between items-center">
            {/* Avatar + nama sekarang SATU TOMBOL menuju Profil Saya.
                Sebelumnya lingkaran ini cuma hiasan yang tidak bisa ditekan,
                padahal itu tempat yang paling wajar dicari orang untuk
                mengganti foto dan nama. */}
            <button
              type="button"
              onClick={() => setProfilTerbuka(true)}
              aria-label="Buka profil saya"
              className="flex items-center gap-3 min-h-[48px] rounded-2xl pr-3 -ml-1 pl-1 active:scale-[0.97] transition-transform"
            >
              <div className="relative w-12 h-12 shrink-0">
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt=""
                    className="w-12 h-12 rounded-full object-cover border-2 border-white/25"
                  />
                ) : (
                  <div className="w-12 h-12 bg-gradient-to-tr from-brand-400 to-accent-500 rounded-full shadow-glow-brand flex items-center justify-center text-white font-bold text-lg">
                    {profile?.display_name?.charAt(0)?.toUpperCase() || 'U'}
                  </div>
                )}
                <span className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-ink-900 border border-white/20 flex items-center justify-center">
                  <Pencil size={10} className="text-brand-300" />
                </span>
              </div>
              <div className="text-left">
                <p className="text-white/70 text-sm font-medium">Halo,</p>
                <h1 className="text-white font-bold text-lg">{profile?.display_name || 'Pengguna'}</h1>
              </div>
            </button>
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={sedangMuat}
              aria-label="Muat ulang data"
              aria-busy={sedangMuat}
              className="w-11 h-11 shrink-0 bg-white/10 rounded-full flex items-center justify-center text-white/80 backdrop-blur-md border border-white/20 shadow-lg active:scale-90 transition-transform disabled:opacity-60"
            >
              <RefreshCw size={20} className={sedangMuat ? 'animate-spin' : ''} />
            </button>
          </div>

          {/* ATM Card */}
          <AtmCard />

          {/* AI Roast — only if transactions exist */}
          {safeTransactions.length > 0 && (
            <AiRoastBox income={income} expense={expense} topCategory={topCategory} />
          )}

          {/* Grafik arus kas */}
          <Suspense fallback={<div className="skeleton h-64 rounded-3xl" />}>
            <CashflowChart />
          </Suspense>

          {/* Log Transaksi Harian (Accordion) */}
          <div className="bg-white/5 backdrop-blur-lg border border-white/10 rounded-3xl p-5 shadow-xl">
            <div className="flex justify-between items-baseline mb-1">
              <h3 className="text-white font-bold text-lg">Log Transaksi Harian</h3>
            </div>
            <p className="text-white/70 text-micro mb-4">
              Ketuk transaksi untuk mengubah atau menghapusnya.
            </p>

            <div className="space-y-3">
              {safeTransactions.length > 0 ? (
                Object.keys(groupedTransactions).map(date => (
                  <details key={date} className="group bg-white/5 rounded-2xl border border-white/5 overflow-hidden">
                    <summary className="flex justify-between items-center p-4 cursor-pointer select-none">
                      <span className="text-white font-bold">{date}</span>
                      {/* Ikon SVG, bukan karakter "▼": bentuk emoji/glif berubah-ubah
                          antar perangkat dan tidak bisa diwarnai lewat token. */}
                      <ChevronDown
                        size={18}
                        className="text-white/70 shrink-0 group-open:rotate-180 transition-transform duration-200"
                      />
                    </summary>
                    <div className="px-4 pb-4 space-y-3">
                      {groupedTransactions[date].map((trx: Transaction) => (
                        // Baris jadi TOMBOL, bukan div: salah catat itu hal biasa,
                        // dan sebelumnya tidak ada satu pun cara memperbaiki
                        // transaksi yang sudah tersimpan.
                        <button
                          key={trx.id}
                          type="button"
                          onClick={() => setTrxDiedit(trx)}
                          aria-label={`Ubah transaksi ${trx.title}`}
                          className="w-full min-h-[56px] flex justify-between items-center gap-3 pt-3 border-t border-white/5 first:border-0 first:pt-0 text-left rounded-xl active:bg-white/5 transition-colors"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className={`w-10 h-10 shrink-0 rounded-xl flex items-center justify-center ${
                              trx.type === 'income' ? 'bg-brand-500/20 text-brand-300' :
                              trx.type === 'expense' ? 'bg-danger-500/20 text-danger-400' :
                              'bg-accent-500/20 text-accent-300'
                            }`}>
                              {trx.type === 'income' ? <ArrowDownRight size={20} /> :
                               trx.type === 'expense' ? <ArrowUpRight size={20} /> :
                               <RefreshCw size={20} />}
                            </div>
                            <div className="min-w-0">
                              <p className="text-white font-medium truncate">{trx.title}</p>
                              <p className="text-white/70 text-xs truncate">{trx.category || trx.type}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <p className={`font-bold tabular-nums ${
                              trx.type === 'income' ? 'text-brand-300' :
                              trx.type === 'expense' ? 'text-danger-400' : 'text-accent-300'
                            }`}>
                              {trx.type === 'income' ? '+' : trx.type === 'expense' ? '-' : ''}
                              {formatIDR(trx.amount)}
                            </p>
                            <Pencil size={13} className="text-white/40" />
                          </div>
                        </button>
                      ))}
                    </div>
                  </details>
                ))
              ) : (
                <p className="text-center text-white/70 text-sm py-4">Belum ada transaksi</p>
              )}
            </div>
          </div>
        </div>
      )}

      <ProfileSheet terbuka={profilTerbuka} onTutup={() => setProfilTerbuka(false)} />

      <TransactionEditor
        transaksi={trxDiedit}
        wallets={safeWallets}
        onTutup={() => setTrxDiedit(null)}
        onSelesai={() => {
          setTrxDiedit(null);
          // Trigger database sudah menghitung ulang saldo dompet; ambil ulang
          // supaya angka di layar ikut menyesuaikan tanpa memuat ulang halaman.
          refresh();
        }}
      />
    </motion.div>
  );
}
