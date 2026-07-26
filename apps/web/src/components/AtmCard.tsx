import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useFinanceStore } from '../store/useFinanceStore';
import { Eye, EyeOff, CreditCard, Wallet } from 'lucide-react';

export default function AtmCard() {
  const { wallets } = useFinanceStore();
  const [isExpanded, setIsExpanded] = useState(false);
  const [showBalance, setShowBalance] = useState(true);

  const safeWallets = wallets || [];
  const totalBalance = safeWallets.reduce((acc, wallet) => acc + Number(wallet.balance), 0);

  const formatIDR = (num: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(num);
  };

  return (
    <motion.div
      layout
      whileTap={{ scale: 0.95 }}
      onClick={() => setIsExpanded(!isExpanded)}
      className="relative w-full rounded-3xl p-6 overflow-hidden cursor-pointer shadow-2xl"
      style={{
        background: 'linear-gradient(135deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.05) 100%)',
        backdropFilter: 'blur(20px)',
        border: '1px solid rgba(255,255,255,0.2)'
      }}
    >
      {/* Decorative Elements */}
      <div className="absolute -top-10 -right-10 w-32 h-32 bg-teal-400 rounded-full mix-blend-screen filter blur-3xl opacity-50"></div>
      <div className="absolute -bottom-10 -left-10 w-32 h-32 bg-purple-500 rounded-full mix-blend-screen filter blur-3xl opacity-50"></div>

      <div className="relative z-10">
        <div className="flex justify-between items-center mb-6">
          <p className="text-white/70 font-medium tracking-widest text-sm uppercase">Total Saldo Aktif</p>
          <button 
            onClick={(e) => { e.stopPropagation(); setShowBalance(!showBalance); }}
            className="text-white/70 hover:text-white transition-colors"
          >
            {showBalance ? <Eye size={20} /> : <EyeOff size={20} />}
          </button>
        </div>

        <h2 className="text-4xl font-bold text-white mb-2 tracking-tight">
          {showBalance ? formatIDR(totalBalance) : 'Rp •••••••••'}
        </h2>

        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ opacity: 0, height: 0, marginTop: 0 }}
              animate={{ opacity: 1, height: 'auto', marginTop: 24 }}
              exit={{ opacity: 0, height: 0, marginTop: 0 }}
              className="border-t border-white/20 pt-4 space-y-3"
            >
              {safeWallets.map((wallet) => (
                <div key={wallet.id} className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    {/* ?? '' — nama dompet bisa saja null dan .toLowerCase() pada
                        null langsung menjatuhkan kartu saldo. */}
                    {(wallet.name ?? '').toLowerCase().includes('cash') ? (
                      <Wallet size={16} className="text-teal-400" />
                    ) : (
                      <CreditCard size={16} className="text-purple-400" />
                    )}
                    <span className="text-white/90 font-medium">{wallet.name}</span>
                  </div>
                  <span className="text-white font-bold">
                    {showBalance ? formatIDR(Number(wallet.balance)) : '••••••'}
                  </span>
                </div>
              ))}
              {safeWallets.length === 0 && (
                <div className="text-white/70 text-sm text-center">No wallets found</div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
