import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Save, Trash2, Wallet as WalletIcon } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { safeMutate, pesanError } from '../lib/db';
import toast from 'react-hot-toast';
import Portal from './Portal';
import { Wallet } from '../store/useFinanceStore';

interface WalletEditorProps {
  wallet: Wallet | null;
  onClose: () => void;
  onSuccess: () => void;
}

export default function WalletEditor({ wallet, onClose, onSuccess }: WalletEditorProps) {
  const [name, setName] = useState('');
  const [initialBalance, setInitialBalance] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (wallet) {
      setName(wallet.name || '');
      setInitialBalance(String(wallet.initial_balance || 0));
    }
  }, [wallet]);

  if (!wallet) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsSaving(true);
    try {
      await safeMutate(
        supabase
          .from('wallets')
          .update({
            name: name.trim(),
            initial_balance: Number(initialBalance) || 0,
          })
          .eq('id', wallet.id),
        'Gagal memperbarui dompet'
      );
      toast.success('Dompet berhasil diperbarui');
      onSuccess();
    } catch (error) {
      toast.error(pesanError(error, 'Gagal memperbarui dompet'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Yakin ingin menghapus dompet "${wallet.name}"? Ini hanya bisa dilakukan jika tidak ada transaksi yang terhubung.`)) return;
    
    setIsDeleting(true);
    try {
      await safeMutate(
        supabase.from('wallets').delete().eq('id', wallet.id),
        'Gagal menghapus dompet'
      );
      toast.success('Dompet berhasil dihapus');
      onSuccess();
    } catch (error: any) {
      if (error?.message?.includes('foreign key constraint')) {
        toast.error('Tidak bisa dihapus: masih ada transaksi di dompet ini.');
      } else {
        toast.error(pesanError(error, 'Gagal menghapus dompet'));
      }
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Portal>
      <AnimatePresence>
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative w-full max-w-sm bg-slate-900 border border-white/15 rounded-3xl overflow-hidden shadow-2xl"
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 bg-white/5">
              <div className="flex items-center gap-2 text-white">
                <WalletIcon size={20} className="text-brand-400" />
                <h3 className="font-bold text-lg">Edit Dompet</h3>
              </div>
              <button onClick={onClose} className="p-2 rounded-full hover:bg-white/10 text-white/50 hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-5 space-y-4">
              <div>
                <label className="text-white/70 text-sm font-medium ml-1 mb-1.5 block">Nama Dompet</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Mis. Dompet Utama"
                  className="w-full bg-black/40 border border-white/15 rounded-xl px-4 py-3 text-white placeholder-white/40 focus:outline-none focus:border-brand-400 focus:ring-1 focus:ring-brand-400"
                  required
                />
              </div>

              <div>
                <label className="text-white/70 text-sm font-medium ml-1 mb-1.5 block">Saldo Awal</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-white/50">Rp</span>
                  <input
                    type="number"
                    value={initialBalance}
                    onChange={(e) => setInitialBalance(e.target.value)}
                    placeholder="0"
                    className="w-full bg-black/40 border border-white/15 rounded-xl pl-11 pr-4 py-3 text-white placeholder-white/40 focus:outline-none focus:border-brand-400 focus:ring-1 focus:ring-brand-400"
                  />
                </div>
                <p className="text-white/50 text-xs mt-1.5 ml-1">
                  Saldo sebelum transaksi pertama dicatat.
                </p>
              </div>

              <div className="pt-4 flex gap-3">
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={isDeleting || isSaving}
                  className="p-3 rounded-xl bg-danger-500/20 text-danger-400 hover:bg-danger-500/30 transition-colors disabled:opacity-50"
                  aria-label="Hapus dompet"
                >
                  <Trash2 size={20} />
                </button>
                <button
                  type="submit"
                  disabled={isSaving || isDeleting || !name.trim()}
                  className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold bg-brand-500 hover:bg-brand-400 text-white transition-colors disabled:opacity-50"
                >
                  <Save size={18} />
                  {isSaving ? 'Menyimpan...' : 'Simpan Perubahan'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      </AnimatePresence>
    </Portal>
  );
}
