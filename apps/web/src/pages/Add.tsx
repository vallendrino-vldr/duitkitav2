import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Camera, Mic, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import axios from 'axios';
import { supabase } from '../lib/supabase';
import { useFinanceStore } from '../store/useFinanceStore';
import { compressImage } from '../utils/imageCompressor';

export default function Add() {
  const { wallets, addTransactionOffline } = useFinanceStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    wallet_id: wallets[0]?.id || '',
    type: 'expense' as 'income' | 'expense' | 'transfer',
    amount: '',
    category: '',
    title: ''
  });

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    const toastId = toast.loading('Memproses struk dengan AI...');

    try {
      const compressedFile = await compressImage(file);
      
      const formDataUpload = new FormData();
      formDataUpload.append('receipt', compressedFile);

      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:4000';
      const { data } = await axios.post(`${apiUrl}/api/scan/receipt`, formDataUpload, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      setFormData(prev => ({
        ...prev,
        title: data.title || prev.title,
        amount: data.amount ? data.amount.toString() : prev.amount,
        type: data.type || prev.type,
        category: data.category || prev.category
      }));

      toast.success('AI berhasil membaca struk!', { id: toastId });
    } catch (error) {
      console.error(error);
      toast.error('Gagal membaca struk', { id: toastId });
    } finally {
      setIsLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleVoice = async () => {
    toast('Fitur suara segera hadir!', { icon: '🎙️' });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.wallet_id || !formData.amount || !formData.title) {
      toast.error('Lengkapi form terlebih dahulu');
      return;
    }

    setIsLoading(true);
    const toastId = toast.loading('Menyimpan transaksi...');

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const transactionData = {
        id: crypto.randomUUID(),
        user_id: user.id,
        wallet_id: formData.wallet_id,
        type: formData.type,
        amount: Number(formData.amount),
        category: formData.category,
        title: formData.title,
        created_at: new Date().toISOString()
      };

      // Push to Supabase if online, else handle offline gracefully via Zustand
      const { error } = await supabase.from('transactions').insert(transactionData);
      
      // Zustand Offline Sync Queue Logic handles local state & offline queue
      addTransactionOffline(transactionData as any);

      toast.success('Transaksi berhasil disimpan', { id: toastId });
      
      // Reset form
      setFormData({
        wallet_id: wallets[0]?.id || '',
        type: 'expense',
        amount: '',
        category: '',
        title: ''
      });
    } catch (error: any) {
      console.error(error);
      toast.error('Gagal menyimpan transaksi', { id: toastId });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="p-4 pt-10 pb-24 max-w-lg mx-auto relative z-10"
    >
      <h2 className="text-2xl font-bold text-white mb-6 text-center">Smart Input Hub</h2>

      {/* AI Hub Actions */}
      <div className="grid grid-cols-2 gap-4 mb-8">
        <motion.button 
          whileTap={{ scale: 0.95 }}
          onClick={() => fileInputRef.current?.click()}
          className="bg-gradient-to-br from-teal-500/20 to-teal-600/20 border border-teal-400/30 p-6 rounded-3xl flex flex-col items-center justify-center gap-3 backdrop-blur-md shadow-[0_0_15px_rgba(45,212,191,0.2)]"
        >
          <div className="bg-teal-400/20 p-3 rounded-2xl text-teal-400">
            <Camera size={28} />
          </div>
          <span className="text-white font-medium">Scan Struk</span>
        </motion.button>

        <motion.button 
          whileTap={{ scale: 0.95 }}
          onClick={handleVoice}
          className="bg-gradient-to-br from-purple-500/20 to-purple-600/20 border border-purple-400/30 p-6 rounded-3xl flex flex-col items-center justify-center gap-3 backdrop-blur-md shadow-[0_0_15px_rgba(168,85,247,0.2)]"
        >
          <div className="bg-purple-400/20 p-3 rounded-2xl text-purple-400">
            <Mic size={28} />
          </div>
          <span className="text-white font-medium">Rekam Suara</span>
        </motion.button>
      </div>

      <input 
        type="file" 
        accept="image/*" 
        capture="environment"
        ref={fileInputRef} 
        onChange={handleFileChange} 
        className="hidden" 
      />

      {/* Manual Form */}
      <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-6 shadow-2xl relative overflow-hidden">
        
        {/* Loading Overlay */}
        <AnimatePresence>
          {isLoading && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-[#0F172A]/80 backdrop-blur-sm z-20 flex flex-col items-center justify-center"
            >
              <div className="w-12 h-12 border-4 border-teal-400 border-t-transparent rounded-full animate-spin mb-4"></div>
              <p className="text-white font-medium animate-pulse">Memproses...</p>
            </motion.div>
          )}
        </AnimatePresence>

        <h3 className="text-white/80 font-medium mb-4">Manual Input</h3>
        
        <form onSubmit={handleSubmit} className="space-y-4 relative z-10">
          <div>
            <label className="text-white/60 text-xs font-medium ml-1 mb-1 block">Dompet</label>
            <select 
              value={formData.wallet_id}
              onChange={(e) => setFormData({...formData, wallet_id: e.target.value})}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-teal-400 transition-all appearance-none"
            >
              <option value="" disabled className="bg-slate-800 text-white/50">Pilih Dompet</option>
              {wallets.map(w => (
                <option key={w.id} value={w.id} className="bg-slate-800">{w.name} (Rp {w.balance})</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-white/60 text-xs font-medium ml-1 mb-1 block">Tipe</label>
              <select 
                value={formData.type}
                onChange={(e) => setFormData({...formData, type: e.target.value as any})}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-teal-400 transition-all appearance-none"
              >
                <option value="expense" className="bg-slate-800 text-red-400">Pengeluaran</option>
                <option value="income" className="bg-slate-800 text-teal-400">Pemasukan</option>
                <option value="transfer" className="bg-slate-800 text-blue-400">Transfer</option>
              </select>
            </div>
            <div>
              <label className="text-white/60 text-xs font-medium ml-1 mb-1 block">Nominal</label>
              <input 
                type="number"
                placeholder="0"
                value={formData.amount}
                onChange={(e) => setFormData({...formData, amount: e.target.value})}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-teal-400 transition-all"
              />
            </div>
          </div>

          <div>
            <label className="text-white/60 text-xs font-medium ml-1 mb-1 block">Judul / Keterangan</label>
            <input 
              type="text"
              placeholder="Contoh: Beli Kopi"
              value={formData.title}
              onChange={(e) => setFormData({...formData, title: e.target.value})}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-teal-400 transition-all"
            />
          </div>

          <div>
            <label className="text-white/60 text-xs font-medium ml-1 mb-1 block">Kategori</label>
            <input 
              type="text"
              placeholder="Contoh: Makanan"
              value={formData.category}
              onChange={(e) => setFormData({...formData, category: e.target.value})}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-teal-400 transition-all"
            />
          </div>

          <motion.button 
            whileTap={{ scale: 0.95 }}
            type="submit"
            className="w-full bg-gradient-to-r from-teal-400 to-teal-500 text-white font-bold rounded-xl px-4 py-4 shadow-[0_0_15px_rgba(45,212,191,0.4)] flex justify-center items-center mt-4"
          >
            <Save size={20} className="mr-2" />
            SIMPAN TRANSAKSI
          </motion.button>
        </form>
      </div>
    </motion.div>
  );
}
