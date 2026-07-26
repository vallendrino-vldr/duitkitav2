import React, { useEffect, useState, lazy, Suspense } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../lib/supabase';
import { useFinanceStore } from '../store/useFinanceStore';
import { safeMutateOne, pesanError } from '../lib/db';
import toast from 'react-hot-toast';
import { ArrowUpRight, ArrowDownRight, RefreshCw, ChevronDown } from 'lucide-react';

import AtmCard from '../components/AtmCard';
import AiRoastBox from '../components/AiRoastBox';

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

  useEffect(() => {
    // allSettled: satu permintaan gagal tidak boleh menggantung dua lainnya.
    void Promise.allSettled([fetchProfile(), fetchWallets(), fetchTransactions()]);
  }, []);

  const refresh = () => {
    void Promise.allSettled([fetchProfile(), fetchWallets(), fetchTransactions()]);
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
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-gradient-to-tr from-teal-400 to-purple-500 rounded-full shadow-[0_0_15px_rgba(45,212,191,0.5)] flex items-center justify-center text-white font-bold text-lg">
                {profile?.display_name?.charAt(0)?.toUpperCase() || 'U'}
              </div>
              <div>
                <p className="text-white/60 text-sm font-medium">Halo,</p>
                <h1 className="text-white font-bold text-lg">{profile?.display_name || 'Pengguna'}</h1>
              </div>
            </div>
            <button
              type="button"
              onClick={refresh}
              aria-label="Muat ulang data"
              className="w-11 h-11 bg-white/10 rounded-full flex items-center justify-center text-white/80 backdrop-blur-md border border-white/20 shadow-lg"
            >
              <RefreshCw size={20} />
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
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-white font-bold text-lg">Log Transaksi Harian</h3>
            </div>
            
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
                      {groupedTransactions[date].map((trx: any) => (
                        <div key={trx.id} className="flex justify-between items-center pt-3 border-t border-white/5 first:border-0 first:pt-0">
                          <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                              trx.type === 'income' ? 'bg-teal-500/20 text-teal-400' : 
                              trx.type === 'expense' ? 'bg-red-500/20 text-red-400' : 
                              'bg-blue-500/20 text-blue-400'
                            }`}>
                              {trx.type === 'income' ? <ArrowDownRight size={20} /> : 
                               trx.type === 'expense' ? <ArrowUpRight size={20} /> : 
                               <RefreshCw size={20} />}
                            </div>
                            <div>
                              <p className="text-white font-medium">{trx.title}</p>
                              <p className="text-white/70 text-xs">{trx.category || trx.type}</p>
                            </div>
                          </div>
                          <p className={`font-bold ${
                            trx.type === 'income' ? 'text-teal-400' : 
                            trx.type === 'expense' ? 'text-red-400' : 'text-blue-400'
                          }`}>
                            {trx.type === 'income' ? '+' : trx.type === 'expense' ? '-' : ''}
                            {formatIDR(trx.amount)}
                          </p>
                        </div>
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
    </motion.div>
  );
}
