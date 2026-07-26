import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Check, Clock, AlertCircle, CreditCard } from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '../lib/supabase';
import { useFinanceStore } from '../store/useFinanceStore';
import { safeMutate, pesanError } from '../lib/db';
import { differenceInDays } from 'date-fns';

export default function Debts() {
  const { wallets, fetchWallets, fetchTransactions } = useFinanceStore();
  const [debts, setDebts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedDebt, setSelectedDebt] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'HUTANG' | 'PIUTANG'>('HUTANG');

  const [newDebt, setNewDebt] = useState({
    title: '',
    amount: '',
    due_date: ''
  });

  const [payDebt, setPayDebt] = useState({
    wallet_id: ''
  });

  useEffect(() => {
    fetchDebts();
  }, []);

  const fetchDebts = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const data = await safeMutate<any[]>(
        supabase.from('debts').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
        'Gagal memuat catatan',
      );
      setDebts(data ?? []);
    } catch (error) {
      toast.error(pesanError(error, 'Gagal memuat catatan'));
      setDebts([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateDebt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDebt.title || !newDebt.amount || !newDebt.due_date) {
      toast.error('Lengkapi semua data');
      return;
    }

    const toastId = toast.loading('Menyimpan catatan...');
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Kolom `type` dan `status` sekarang nyata di database. Judul tidak lagi
      // diberi awalan "[HUTANG] " — cara lama itu tidak bisa diindeks dan rusak
      // begitu pengguna mengetik "[" di dalam nama.
      const debtData = {
        user_id: user.id,
        title: newDebt.title.trim(),
        amount: Number(newDebt.amount),
        due_date: new Date(newDebt.due_date).toISOString(),
        type: activeTab,
        status: 'unpaid',
      };

      await safeMutate(supabase.from('debts').insert(debtData), 'Gagal mencatat');

      toast.success('Berhasil dicatat!', { id: toastId });
      setShowAddForm(false);
      setNewDebt({ title: '', amount: '', due_date: '' });
      fetchDebts();
    } catch (error) {
      toast.error(pesanError(error, 'Gagal mencatat'), { id: toastId });
    }
  };

  const handleMarkAsPaid = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payDebt.wallet_id || !selectedDebt) {
      toast.error('Pilih dompet pembayaran');
      return;
    }

    const toastId = toast.loading('Memproses pelunasan...');
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const isHutang = selectedDebt.type === 'HUTANG';
      const transactionData = {
        id: crypto.randomUUID(),
        user_id: user.id,
        wallet_id: payDebt.wallet_id,
        type: isHutang ? 'expense' : 'income', // Bayar hutang = keluar. Terima piutang = masuk.
        amount: Number(selectedDebt.amount),
        category: isHutang ? 'Bayar Hutang' : 'Terima Piutang',
        title: `${isHutang ? 'Bayar Hutang' : 'Terima Piutang'}: ${selectedDebt.title}`,
        created_at: new Date().toISOString()
      };

      // Transaksi dulu. Bila langkah ini gagal, safeMutate melempar dan catatan
      // TIDAK ikut ditandai lunas — dulu keduanya bisa gagal diam-diam dan
      // hutang tetap tampak lunas tanpa transaksi apa pun.
      await safeMutate(
        supabase.from('transactions').insert(transactionData),
        'Gagal mencatat transaksi pelunasan',
      );

      await safeMutate(
        supabase.from('debts').update({ status: 'paid' }).eq('id', selectedDebt.id),
        'Gagal menandai lunas',
      );

      await Promise.allSettled([fetchWallets(), fetchTransactions()]);

      toast.success('Berhasil dilunasi!', { id: toastId });
      setSelectedDebt(null);
      fetchDebts();
    } catch (error) {
      toast.error(pesanError(error, 'Gagal melunasi'), { id: toastId });
    }
  };

  const formatIDR = (num: number) => {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(num);
  };

  const filteredDebts = debts.filter(d => d.type === activeTab);

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
      className="page pb-24 relative z-10"
    >
      <div className="flex flex-col items-center mb-8">
        <motion.div 
          animate={{ y: [0, -10, 0], scale: [1, 1.05, 1] }}
          transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
          className="text-red-400 mb-2 drop-shadow-[0_0_15px_rgba(239,68,68,0.5)]"
        >
          <CreditCard size={64} />
        </motion.div>
        <h2 className="text-2xl font-bold text-white text-center">Hutang & Piutang</h2>
      </div>

      <div className="flex bg-white/5 border border-white/10 rounded-2xl p-1 mb-6">
        <button 
          onClick={() => setActiveTab('HUTANG')}
          className={`flex-1 py-2 rounded-xl text-sm font-bold transition-all ${activeTab === 'HUTANG' ? 'bg-red-500/20 text-red-400 shadow-lg' : 'text-white/70 hover:text-white'}`}
        >Hutang (Saya Pinjam)</button>
        <button 
          onClick={() => setActiveTab('PIUTANG')}
          className={`flex-1 py-2 rounded-xl text-sm font-bold transition-all ${activeTab === 'PIUTANG' ? 'bg-teal-500/20 text-teal-400 shadow-lg' : 'text-white/70 hover:text-white'}`}
        >Piutang (Orang Pinjam)</button>
      </div>

      <button 
        onClick={() => setShowAddForm(!showAddForm)}
        className="w-full bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-4 flex items-center justify-center gap-2 text-white font-medium shadow-xl mb-6 hover:bg-white/15"
      >
        {showAddForm ? <AlertCircle size={20} /> : <Plus size={20} />}
        {showAddForm ? 'Batal Tambah' : `Catat ${activeTab === 'HUTANG' ? 'Hutang' : 'Piutang'} Baru`}
      </button>

      <AnimatePresence>
        {showAddForm && (
          <motion.form 
            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
            onSubmit={handleCreateDebt}
            className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-5 shadow-2xl mb-6 overflow-hidden"
          >
            <div className="space-y-4">
              <div>
                <label className="text-white/70 text-[10px] font-bold uppercase tracking-widest ml-1 block mb-1">Judul / Kepada Siapa</label>
                <input 
                  type="text"
                  placeholder="Contoh: Budi"
                  value={newDebt.title}
                  onChange={(e) => setNewDebt({...newDebt, title: e.target.value})}
                  className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/45 focus:outline-none focus:ring-1 focus:ring-teal-400 transition-all font-light"
                />
              </div>
              <div>
                <label className="text-white/70 text-[10px] font-bold uppercase tracking-widest ml-1 block mb-1">Nominal</label>
                <input 
                  type="number"
                  placeholder="Contoh: 500000"
                  value={newDebt.amount}
                  onChange={(e) => setNewDebt({...newDebt, amount: e.target.value})}
                  className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/45 focus:outline-none focus:ring-1 focus:ring-teal-400 transition-all font-light"
                />
              </div>
              <div>
                <label className="text-white/70 text-[10px] font-bold uppercase tracking-widest ml-1 block mb-1">Jatuh Tempo</label>
                <input 
                  type="date"
                  value={newDebt.due_date}
                  onChange={(e) => setNewDebt({...newDebt, due_date: e.target.value})}
                  className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-1 focus:ring-teal-400 transition-all appearance-none font-light"
                />
              </div>
              <motion.button 
                whileTap={{ scale: 0.95 }} type="submit"
                className={`w-full text-white font-bold rounded-xl px-4 py-3 flex justify-center items-center mt-2 ${activeTab === 'HUTANG' ? 'bg-gradient-to-r from-red-500 to-red-600 shadow-[0_0_15px_rgba(239,68,68,0.4)]' : 'bg-gradient-to-r from-teal-500 to-teal-600 shadow-[0_0_15px_rgba(20,184,166,0.4)]'}`}
              >
                SIMPAN CATATAN
              </motion.button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>

      <div className="space-y-4">
        {filteredDebts.map(debt => {
          const isPaid = debt.status === 'paid';
          const dueDate = debt.due_date ? new Date(debt.due_date) : null;
          const daysLeft = dueDate ? differenceInDays(dueDate, new Date()) : null;
          const isDanger = !isPaid && daysLeft !== null && daysLeft <= 3;

          return (
            <div 
              key={debt.id}
              className={`relative bg-white/5 backdrop-blur-xl border rounded-3xl p-5 overflow-hidden transition-all duration-300 ${
                isDanger 
                  ? 'border-red-500/50 shadow-[0_0_20px_rgba(239,68,68,0.4)]' 
                  : 'border-white/10 shadow-xl'
              }`}
            >
              {isDanger && <div className="absolute top-0 left-0 w-full h-1 bg-red-500 animate-pulse"></div>}
              
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className={`font-bold text-lg ${isDanger ? 'text-red-400' : 'text-white'}`}>
                    {debt.title}
                  </h3>
                  <div className={`flex items-center gap-1 text-xs mt-1 font-medium px-2 py-1 inline-flex rounded-md ${isDanger ? 'bg-red-500/20 text-red-200' : 'bg-white/10 text-white/70'}`}>
                    <Clock size={12} />
                    <span>Pengingat: {dueDate ? dueDate.toLocaleDateString('id-ID') : 'Tidak ada'}</span>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-white font-bold text-lg">{formatIDR(Number(debt.amount))}</p>
                  <p className={`text-xs font-bold mt-1 tracking-wider ${isPaid ? 'text-teal-400' : isDanger ? 'text-red-400' : 'text-orange-400'}`}>
                    {isPaid
                      ? 'LUNAS'
                      : isDanger
                        ? (daysLeft! < 0 ? 'TERLAMBAT' : `SISA ${daysLeft} HARI`)
                        : 'BELUM LUNAS'}
                  </p>
                </div>
              </div>

              {!isPaid && (
                <motion.button
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setSelectedDebt(debt)}
                  className={`w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all ${
                    isDanger 
                      ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30' 
                      : 'bg-white/10 text-white hover:bg-white/20'
                  }`}
                >
                  <Check size={18} />
                  TANDAI LUNAS
                </motion.button>
              )}
            </div>
          );
        })}
        {filteredDebts.length === 0 && !isLoading && (
          <p className="text-center text-white/60 text-sm py-8 font-light italic">Belum ada catatan.</p>
        )}
      </div>

      <AnimatePresence>
        {selectedDebt && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setSelectedDebt(null)}
              className="absolute inset-0 bg-[#0F172A]/80 backdrop-blur-sm"
            ></motion.div>
            
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="bg-[#1e293b] border border-white/10 p-6 rounded-3xl w-full max-w-sm relative z-10 shadow-2xl"
            >
              <h3 className="text-white font-bold text-lg mb-4">Lunasi: {selectedDebt.title}</h3>
              <form onSubmit={handleMarkAsPaid} className="space-y-4">
                <div className="bg-white/5 p-3 rounded-xl mb-4 text-center border border-white/5">
                  <p className="text-white/60 text-xs">Total Pembayaran</p>
                  <p className="text-white font-bold text-xl mt-1">{formatIDR(Number(selectedDebt.amount))}</p>
                </div>
                <div>
                  <label className="text-white/70 text-[10px] font-bold uppercase tracking-widest ml-1 block mb-1">Dompet</label>
                  <select 
                    value={payDebt.wallet_id}
                    onChange={(e) => setPayDebt({...payDebt, wallet_id: e.target.value})}
                    className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-1 focus:ring-teal-400 appearance-none font-light"
                  >
                    <option value="" disabled className="bg-slate-900">Pilih Dompet</option>
                    {(wallets || []).map(w => (
                      <option key={w.id} value={w.id} className="bg-slate-900">{w.name} (Rp {w.balance})</option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-3 mt-6">
                  <button type="button" onClick={() => setSelectedDebt(null)} className="flex-1 bg-white/5 text-white font-medium rounded-xl py-3 border border-white/10 hover:bg-white/10">
                    Batal
                  </button>
                  <button type="submit" className="flex-1 bg-gradient-to-r from-teal-500 to-teal-600 text-white font-bold rounded-xl py-3 shadow-[0_0_15px_rgba(20,184,166,0.4)]">
                    Konfirmasi Lunas
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </motion.div>
  );
}
