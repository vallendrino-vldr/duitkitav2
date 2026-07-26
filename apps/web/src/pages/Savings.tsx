import React, { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, PiggyBank, Image as ImageIcon, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '../lib/supabase';
import { useFinanceStore } from '../store/useFinanceStore';
import { compressImage } from '../utils/imageCompressor';

export default function Savings() {
  const { wallets, addTransactionOffline } = useFinanceStore();
  const [goals, setGoals] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedGoal, setSelectedGoal] = useState<any>(null); // For Add Funds modal
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [newGoal, setNewGoal] = useState({
    title: '',
    target_amount: '',
    image_url: '',
  });

  const [addFunds, setAddFunds] = useState({
    amount: '',
    wallet_id: wallets[0]?.id || ''
  });

  useEffect(() => {
    fetchGoals();
  }, []);

  const fetchGoals = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from('saving_goals').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
      if (data) setGoals(data);
    } catch (error) {
      console.error(error);
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
      const fileName = `${Date.now()}-${file.name}`;
      
      const { data, error } = await supabase.storage
        .from('receipts') // Assuming 'receipts' bucket is available for uploads as configured earlier
        .upload(fileName, compressedFile, {
          cacheControl: '3600',
          upsert: false
        });

      if (error) throw error;

      const { data: { publicUrl } } = supabase.storage.from('receipts').getPublicUrl(fileName);
      
      setNewGoal({ ...newGoal, image_url: publicUrl });
      toast.success('Gambar berhasil diunggah', { id: toastId });
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

      const goalData = {
        user_id: user.id,
        title: newGoal.title,
        target_amount: Number(newGoal.target_amount),
        current_amount: 0,
        image_url: newGoal.image_url || 'https://images.unsplash.com/photo-1579621970588-a35d0e7ab9b6?w=500&q=80',
      };

      const { error } = await supabase.from('saving_goals').insert(goalData);
      if (error) throw error;

      toast.success('Target tabungan berhasil dibuat!', { id: toastId });
      setShowAddForm(false);
      setNewGoal({ title: '', target_amount: '', image_url: '' });
      fetchGoals();
    } catch (error) {
      console.error(error);
      toast.error('Gagal menyimpan target', { id: toastId });
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
        wallet_id: addFunds.wallet_id,
        type: 'expense' as const,
        amount: Number(addFunds.amount),
        category: 'Savings',
        title: `Tabungan: ${selectedGoal.title}`,
        created_at: new Date().toISOString()
      };

      await supabase.from('transactions').insert(transactionData);
      
      // Sync offline transaction (updates local wallet balance)
      addTransactionOffline(transactionData as any);

      // 2. Update goal amount
      const newCurrentAmount = Number(selectedGoal.current_amount) + Number(addFunds.amount);
      await supabase.from('saving_goals')
        .update({ current_amount: newCurrentAmount })
        .eq('id', selectedGoal.id);

      toast.success('Tabungan berhasil ditambah!', { id: toastId });
      setSelectedGoal(null);
      setAddFunds({ amount: '', wallet_id: wallets[0]?.id || '' });
      fetchGoals();
    } catch (error) {
      console.error(error);
      toast.error('Gagal menambah tabungan', { id: toastId });
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
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-pink-400 transition-all"
                />
              </div>
              <div>
                <label className="text-white/60 text-xs font-medium ml-1 mb-1 block">Target Nominal</label>
                <input 
                  type="number"
                  placeholder="Contoh: 15000000"
                  value={newGoal.target_amount}
                  onChange={(e) => setNewGoal({...newGoal, target_amount: e.target.value})}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-pink-400 transition-all"
                />
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
                  className="w-full bg-white/5 border border-white/10 border-dashed rounded-xl p-4 flex flex-col items-center justify-center gap-2 text-white/50 hover:text-white hover:bg-white/10 transition-all"
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
        {goals.map(goal => {
          const progress = Math.min((Number(goal.current_amount) / Number(goal.target_amount)) * 100, 100);
          return (
            <div 
              key={goal.id}
              className="relative w-full h-48 rounded-3xl overflow-hidden shadow-2xl flex flex-col justify-end p-5 group"
            >
              <div 
                className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-110"
                style={{ backgroundImage: `url(${goal.image_url})` }}
              ></div>
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent"></div>
              
              <div className="relative z-10 w-full">
                <div className="flex justify-between items-end mb-2">
                  <div>
                    <h3 className="text-white font-bold text-lg leading-tight">{goal.title}</h3>
                    <p className="text-white/70 text-xs">{formatIDR(Number(goal.current_amount))} / {formatIDR(Number(goal.target_amount))}</p>
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
                    {wallets.map(w => (
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
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-pink-400 transition-all"
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
