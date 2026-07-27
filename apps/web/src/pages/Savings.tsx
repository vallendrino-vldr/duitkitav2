import React, { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, PiggyBank, Image as ImageIcon, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '../lib/supabase';
import { useFinanceStore } from '../store/useFinanceStore';
import { safeMutate, pesanError } from '../lib/db';
import { compressImage } from '../utils/imageCompressor';

export default function Savings() {
  const { wallets, activeTabId, fetchWallets, fetchTransactions } = useFinanceStore();
  const [goals, setGoals] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedGoal, setSelectedGoal] = useState<any>(null); // For Add Funds modal
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [newGoal, setNewGoal] = useState({
    title: '',
    target_amount: '',
    target_date: '',
    image_url: '',
  });

  const [addFunds, setAddFunds] = useState({
    amount: '',
    wallet_id: wallets?.[0]?.id || ''
  });

  useEffect(() => {
    fetchGoals();
  }, [activeTabId]);

  const fetchGoals = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const data = await safeMutate<any[]>(
        supabase.from('saving_goals').select('*').eq('user_id', user.id).eq('tab_id', activeTabId).order('created_at', { ascending: false }),
        'Gagal memuat target',
      );
      setGoals(data ?? []);
    } catch (error) {
      toast.error(pesanError(error, 'Gagal memuat target'));
      setGoals([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const toastId = toast.loading('Mengunggah gambar...');
    try {
      const compressedFile = await compressImage(file);
      
      const reader = new FileReader();
      reader.readAsDataURL(compressedFile);
      reader.onloadend = () => {
        // Functional update: closure `newGoal` sudah basi saat callback berjalan.
        setNewGoal((prev) => ({ ...prev, image_url: reader.result as string }));
        toast.success('Gambar berhasil diunggah', { id: toastId });
      };
      reader.onerror = () => {
        toast.error('Gagal membaca gambar', { id: toastId });
      };
    } catch (error) {
      console.error(error);
      toast.error('Gagal mengunggah gambar', { id: toastId });
    }
  };

  const handleCreateGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGoal.title || !newGoal.target_amount) {
      toast.error('Lengkapi judul dan target');
      return;
    }

    const toastId = toast.loading('Menyimpan target...');
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // `target_date` sekarang kolom tersendiri. Sebelumnya tanggal ditempelkan
      // ke dalam judul sebagai "(Target: 2026-01-01)" sehingga tidak bisa
      // diurutkan, difilter, atau diubah tanpa mengedit teks judul.
      const goalData = {
        user_id: user.id,
        tab_id: activeTabId,
        title: newGoal.title.trim(),
        target_amount: Number(newGoal.target_amount),
        current_amount: 0,
        target_date: newGoal.target_date || null,
        image_url: newGoal.image_url || null,
      };

      await safeMutate(supabase.from('saving_goals').insert(goalData), 'Gagal menyimpan target');

      toast.success('Target tabungan berhasil dibuat!', { id: toastId });
      setShowAddForm(false);
      setNewGoal({ title: '', target_amount: '', target_date: '', image_url: '' });
      fetchGoals();
    } catch (error) {
      toast.error(pesanError(error, 'Gagal menyimpan target'), { id: toastId });
    }
  };

  const handleAddFunds = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addFunds.amount || !addFunds.wallet_id || !selectedGoal) {
      toast.error('Lengkapi data');
      return;
    }

    const toastId = toast.loading('Memproses tabungan...');
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // 1. Create expense transaction
      const transactionData = {
        id: crypto.randomUUID(),
        user_id: user.id,
        tab_id: activeTabId,
        wallet_id: addFunds.wallet_id,
        type: 'expense' as const,
        amount: Number(addFunds.amount),
        category: 'Savings',
        title: `Tabungan: ${selectedGoal.title}`,
        created_at: new Date().toISOString()
      };

      await safeMutate(
        supabase.from('transactions').insert(transactionData),
        'Gagal mencatat transaksi tabungan',
      );

      // 2. Update goal amount
      const newCurrentAmount = Number(selectedGoal.current_amount) + Number(addFunds.amount);
      await safeMutate(
        supabase.from('saving_goals')
          .update({ current_amount: newCurrentAmount })
          .eq('id', selectedGoal.id),
        'Gagal memperbarui target',
      );

      // Saldo dompet dihitung ulang oleh trigger database.
      await Promise.allSettled([fetchWallets(), fetchTransactions()]);

      toast.success('Tabungan berhasil ditambah!', { id: toastId });
      setSelectedGoal(null);
      setAddFunds({ amount: '', wallet_id: wallets?.[0]?.id || '' });
      fetchGoals();
    } catch (error) {
      toast.error(pesanError(error, 'Gagal menambah tabungan'), { id: toastId });
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
      className="page pb-24 relative z-10"
    >
      <div className="flex flex-col items-center mb-8">
        <motion.div 
          animate={{ y: [0, -10, 0], scale: [1, 1.05, 1] }}
          transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
          className="text-pink-400 mb-2 drop-shadow-[0_0_15px_rgba(244,114,182,0.5)]"
        >
          <PiggyBank size={64} />
        </motion.div>
        <h2 className="text-2xl font-bold text-white text-center">Tabungan Impian</h2>
      </div>

      <button 
        onClick={() => setShowAddForm(!showAddForm)}
        className="w-full bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-4 flex items-center justify-center gap-2 text-white font-medium shadow-xl mb-6"
      >
        {showAddForm ? <PiggyBank size={20} /> : <Plus size={20} />}
        {showAddForm ? 'Batal Tambah' : 'Buat Target Baru'}
      </button>

      <AnimatePresence>
        {showAddForm && (
          <motion.form 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            onSubmit={handleCreateGoal}
            className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-5 shadow-2xl mb-6 overflow-hidden"
          >
            <div className="space-y-4">
              <div>
                <label className="text-white/60 text-xs font-medium ml-1 mb-1 block">Judul Target</label>
                <input 
                  type="text"
                  placeholder="Contoh: Liburan ke Jepang"
                  value={newGoal.title}
                  onChange={(e) => setNewGoal({...newGoal, title: e.target.value})}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/45 focus:outline-none focus:ring-2 focus:ring-pink-400 transition-all"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-white/60 text-xs font-medium ml-1 mb-1 block">Target Nominal</label>
                  <input 
                    type="number"
                    placeholder="Contoh: 15000000"
                    value={newGoal.target_amount}
                    onChange={(e) => setNewGoal({...newGoal, target_amount: e.target.value})}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/45 focus:outline-none focus:ring-2 focus:ring-pink-400 transition-all"
                  />
                </div>
                <div>
                  <label className="text-white/60 text-xs font-medium ml-1 mb-1 block">Target Tanggal</label>
                  <input 
                    type="date"
                    value={newGoal.target_date}
                    onChange={(e) => setNewGoal({...newGoal, target_date: e.target.value})}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-pink-400 transition-all appearance-none"
                  />
                </div>
              </div>
              <div>
                <label className="text-white/60 text-xs font-medium ml-1 mb-1 block">Gambar Inspirasi</label>
                <input 
                  type="file"
                  accept="image/*"
                  ref={fileInputRef}
                  onChange={handleImageUpload}
                  className="hidden"
                />
                <button 
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full bg-white/5 border border-white/10 border-dashed rounded-xl p-4 flex flex-col items-center justify-center gap-2 text-white/70 hover:text-white hover:bg-white/10 transition-all"
                >
                  <ImageIcon size={24} />
                  <span className="text-sm text-center">
                    {newGoal.image_url ? 'Gambar Terpilih (Ketuk untuk ganti)' : 'Unggah Gambar (Maks 75KB)'}
                  </span>
                </button>
              </div>
              <motion.button 
                whileTap={{ scale: 0.95 }}
                type="submit"
                className="w-full bg-gradient-to-r from-pink-500 to-purple-600 text-white font-bold rounded-xl px-4 py-3 shadow-[0_0_15px_rgba(236,72,153,0.4)] flex justify-center items-center mt-2"
              >
                <Save size={20} className="mr-2" />
                SIMPAN TARGET
              </motion.button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>

      <div className="space-y-4">
        {isLoading && (
          <p className="text-center text-white/60 text-sm py-8">Memuat target…</p>
        )}
        {!isLoading && goals.length === 0 && (
          <p className="text-center text-white/60 text-sm py-8">
            Belum ada target tabungan. Buat yang pertama di atas.
          </p>
        )}
        {goals.map(goal => {
          const progress = Math.min((Number(goal.current_amount) / Number(goal.target_amount)) * 100, 100);
          return (
            <div 
              key={goal.id}
              className="relative w-full h-48 rounded-3xl overflow-hidden shadow-2xl flex flex-col justify-end p-5 group"
            >
              <div
                className="absolute inset-0 bg-cover bg-center bg-gradient-to-br from-purple-800 to-pink-700 transition-transform duration-700 group-hover:scale-110"
                style={goal.image_url ? { backgroundImage: `url(${goal.image_url})` } : undefined}
              ></div>
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent"></div>
              
              <div className="relative z-10 w-full">
                <div className="flex justify-between items-end mb-2">
                  <div>
                    <h3 className="text-white font-bold text-lg leading-tight">{goal.title}</h3>
                    <p className="text-white/70 text-xs">
                      {formatIDR(Number(goal.current_amount))} / {formatIDR(Number(goal.target_amount))} 
                      <span className="text-pink-400 font-bold ml-1">({progress.toFixed(0)}%)</span>
                    </p>
                  </div>
                  <motion.button 
                    whileTap={{ scale: 0.9 }}
                    onClick={() => setSelectedGoal(goal)}
                    className="bg-pink-500 hover:bg-pink-400 text-white p-2 rounded-full shadow-[0_0_10px_rgba(236,72,153,0.5)] transition-colors"
                  >
                    <Plus size={20} />
                  </motion.button>
                </div>
                <div className="w-full h-2 bg-white/20 rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${progress}%` }}
                    transition={{ duration: 1, ease: "easeOut" }}
                    className="h-full bg-gradient-to-r from-pink-500 to-purple-500"
                  ></motion.div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add Funds Modal */}
      <AnimatePresence>
        {selectedGoal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedGoal(null)}
              className="absolute inset-0 bg-[#0F172A]/80 backdrop-blur-sm"
            ></motion.div>
            
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-[#1e293b] border border-white/10 p-6 rounded-3xl w-full max-w-sm relative z-10 shadow-2xl"
            >
              <h3 className="text-white font-bold text-lg mb-4">Tambah Tabungan: {selectedGoal.title}</h3>
              <form onSubmit={handleAddFunds} className="space-y-4">
                <div>
                  <label className="text-white/60 text-xs font-medium ml-1 mb-1 block">Sumber Dana (Dompet)</label>
                  <select 
                    value={addFunds.wallet_id}
                    onChange={(e) => setAddFunds({...addFunds, wallet_id: e.target.value})}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-pink-400 transition-all appearance-none"
                  >
                    {(wallets || []).map(w => (
                      <option key={w.id} value={w.id} className="bg-slate-800">{w.name} (Rp {w.balance})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-white/60 text-xs font-medium ml-1 mb-1 block">Nominal Tabungan</label>
                  <input 
                    type="number"
                    placeholder="Contoh: 100000"
                    value={addFunds.amount}
                    onChange={(e) => setAddFunds({...addFunds, amount: e.target.value})}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/45 focus:outline-none focus:ring-2 focus:ring-pink-400 transition-all"
                  />
                </div>
                <div className="flex gap-3 mt-6">
                  <button 
                    type="button"
                    onClick={() => setSelectedGoal(null)}
                    className="flex-1 bg-white/10 text-white font-medium rounded-xl py-3"
                  >
                    Batal
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 bg-gradient-to-r from-pink-500 to-purple-600 text-white font-bold rounded-xl py-3 shadow-[0_0_15px_rgba(236,72,153,0.4)]"
                  >
                    Simpan
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
