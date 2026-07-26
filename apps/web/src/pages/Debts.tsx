import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Check, Clock, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '../lib/supabase';
import { useFinanceStore } from '../store/useFinanceStore';
import { differenceInDays } from 'date-fns';

export default function Debts() {
  const { wallets, addTransactionOffline } = useFinanceStore();
  const [debts, setDebts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedDebt, setSelectedDebt] = useState<any>(null);

  const [newDebt, setNewDebt] = useState({
    title: '',
    amount: '',
    due_date: ''
  });

  const [payDebt, setPayDebt] = useState({
    wallet_id: wallets[0]?.id || ''
  });

  useEffect(() => {
    fetchDebts();
  }, []);

  const fetchDebts = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from('debts').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
      if (data) setDebts(data);
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateDebt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDebt.title || !newDebt.amount || !newDebt.due_date) {
      toast.error('Lengkapi semua data hutang');
      return;
    }

    const toastId = toast.loading('Menyimpan catatan hutang...');
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const debtData = {
        user_id: user.id,
        title: newDebt.title,
        amount: Number(newDebt.amount),
        due_date: new Date(newDebt.due_date).toISOString(),
        is_paid: false
      };

      const { error } = await supabase.from('debts').insert(debtData);
      if (error) throw error;

      toast.success('Hutang berhasil dicatat!', { id: toastId });
      setShowAddForm(false);
      setNewDebt({ title: '', amount: '', due_date: '' });
      fetchDebts();
    } catch (error) {
      console.error(error);
      toast.error('Gagal mencatat hutang', { id: toastId });
    }
  };

  const handleMarkAsPaid = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payDebt.wallet_id || !selectedDebt) {
      toast.error('Pilih dompet pembayaran');
      return;
    }

    const toastId = toast.loading('Memproses pembayaran...');
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // 1. Create expense transaction
      const transactionData = {
        id: crypto.randomUUID(),
        user_id: user.id,
        wallet_id: payDebt.wallet_id,
        type: 'expense' as const,
        amount: Number(selectedDebt.amount),
        category: 'Debt Repayment',
        title: `Bayar Hutang: ${selectedDebt.title}`,
        created_at: new Date().toISOString()
      };

      await supabase.from('transactions').insert(transactionData);
      
      // Sync offline transaction (updates local wallet balance)
      addTransactionOffline(transactionData as any);

      // 2. Update debt status
      await supabase.from('debts')
        .update({ is_paid: true })
        .eq('id', selectedDebt.id);

      toast.success('Hutang berhasil dilunasi!', { id: toastId });
      setSelectedDebt(null);
      fetchDebts();
    } catch (error) {
      console.error(error);
      toast.error('Gagal melunasi hutang', { id: toastId });
    }
  };

  const formatIDR = (num: number) => {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(num);
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="p-4 pt-10 pb-24 max-w-lg mx-auto relative z-10"
    >
      <h2 className="text-2xl font-bold text-white mb-6 text-center">Catatan Hutang</h2>

      <button 
        onClick={() => setShowAddForm(!showAddForm)}
        className="w-full bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-4 flex items-center justify-center gap-2 text-white font-medium shadow-xl mb-6"
      >
        {showAddForm ? <AlertCircle size={20} /> : <Plus size={20} />}
        {showAddForm ? 'Batal Tambah' : 'Catat Hutang Baru'}
      </button>

      <AnimatePresence>
        {showAddForm && (
          <motion.form 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            onSubmit={handleCreateDebt}
            className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-5 shadow-2xl mb-6 overflow-hidden"
          >
            <div className="space-y-4">
              <div>
                <label className="text-white/60 text-xs font-medium ml-1 mb-1 block">Judul / Keterangan</label>
                <input 
                  type="text"
                  placeholder="Contoh: Pinjam ke Budi"
                  value={newDebt.title}
                  onChange={(e) => setNewDebt({...newDebt, title: e.target.value})}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-orange-400 transition-all"
                />
              </div>
              <div>
                <label className="text-white/60 text-xs font-medium ml-1 mb-1 block">Nominal Hutang</label>
                <input 
                  type="number"
                  placeholder="Contoh: 500000"
                  value={newDebt.amount}
                  onChange={(e) => setNewDebt({...newDebt, amount: e.target.value})}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-orange-400 transition-all"
                />
              </div>
              <div>
                <label className="text-white/60 text-xs font-medium ml-1 mb-1 block">Jatuh Tempo</label>
                <input 
                  type="date"
                  value={newDebt.due_date}
                  onChange={(e) => setNewDebt({...newDebt, due_date: e.target.value})}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-orange-400 transition-all appearance-none"
                />
              </div>
              <motion.button 
                whileTap={{ scale: 0.95 }}
                type="submit"
                className="w-full bg-gradient-to-r from-orange-500 to-red-600 text-white font-bold rounded-xl px-4 py-3 shadow-[0_0_15px_rgba(239,68,68,0.4)] flex justify-center items-center mt-2"
              >
                SIMPAN CATATAN
              </motion.button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>

      <div className="space-y-4">
        {debts.map(debt => {
          const dueDate = new Date(debt.due_date);
          const daysLeft = differenceInDays(dueDate, new Date());
          const isDanger = !debt.is_paid && daysLeft <= 3;
          
          return (
            <div 
              key={debt.id}
              className={`relative bg-white/5 backdrop-blur-xl border rounded-3xl p-5 overflow-hidden transition-all duration-300 ${
                isDanger 
                  ? 'border-red-500/50 shadow-[0_0_20px_rgba(239,68,68,0.4)]' 
                  : 'border-white/10 shadow-xl'
              }`}
            >
              {isDanger && (
                <div className="absolute top-0 left-0 w-full h-1 bg-red-500 animate-pulse"></div>
              )}
              
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className={`font-bold text-lg ${isDanger ? 'text-red-400 animate-pulse' : 'text-white'}`}>
                    {debt.title}
                  </h3>
                  <div className="flex items-center gap-1 text-white/50 text-xs mt-1">
                    <Clock size={12} />
                    <span>Jatuh Tempo: {dueDate.toLocaleDateString('id-ID')}</span>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-white font-bold text-lg">{formatIDR(Number(debt.amount))}</p>
                  <p className={`text-xs font-medium mt-1 ${debt.is_paid ? 'text-teal-400' : isDanger ? 'text-red-400' : 'text-orange-400'}`}>
                    {debt.is_paid ? 'LUNAS' : isDanger ? `${daysLeft < 0 ? 'TERLAMBAT' : `SISA ${daysLeft} HARI`}` : 'BELUM LUNAS'}
                  </p>
                </div>
              </div>

              {!debt.is_paid && (
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
        {debts.length === 0 && !isLoading && (
          <p className="text-center text-white/50 text-sm py-8">Belum ada catatan hutang.</p>
        )}
      </div>

      {/* Pay Debt Modal */}
      <AnimatePresence>
        {selectedDebt && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedDebt(null)}
              className="absolute inset-0 bg-[#0F172A]/80 backdrop-blur-sm"
            ></motion.div>
            
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-[#1e293b] border border-white/10 p-6 rounded-3xl w-full max-w-sm relative z-10 shadow-2xl"
            >
              <h3 className="text-white font-bold text-lg mb-4">Lunasi: {selectedDebt.title}</h3>
              <form onSubmit={handleMarkAsPaid} className="space-y-4">
                <div className="bg-white/5 p-3 rounded-xl mb-4 text-center">
                  <p className="text-white/60 text-xs">Total Pembayaran</p>
                  <p className="text-white font-bold text-xl">{formatIDR(Number(selectedDebt.amount))}</p>
                </div>
                <div>
                  <label className="text-white/60 text-xs font-medium ml-1 mb-1 block">Bayar Dari (Dompet)</label>
                  <select 
                    value={payDebt.wallet_id}
                    onChange={(e) => setPayDebt({...payDebt, wallet_id: e.target.value})}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-teal-400 transition-all appearance-none"
                  >
                    {wallets.map(w => (
                      <option key={w.id} value={w.id} className="bg-slate-800">{w.name} (Rp {w.balance})</option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-3 mt-6">
                  <button 
                    type="button"
                    onClick={() => setSelectedDebt(null)}
                    className="flex-1 bg-white/10 text-white font-medium rounded-xl py-3"
                  >
                    Batal
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 bg-gradient-to-r from-teal-500 to-teal-600 text-white font-bold rounded-xl py-3 shadow-[0_0_15px_rgba(20,184,166,0.4)]"
                  >
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
