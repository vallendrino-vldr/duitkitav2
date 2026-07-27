import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useFinanceStore } from '../store/useFinanceStore';
import { Eye, EyeOff, CreditCard, Wallet, ChevronDown, Nfc, Pencil } from 'lucide-react';
import WalletEditor from './WalletEditor';
import { Wallet as WalletType } from '../store/useFinanceStore';

/**
 * Kartu saldo bergaya kartu ATM.
 *
 * Dua hal yang sengaja dikerjakan di sini:
 *
 * 1. KESAN TIGA DIMENSI. Kartu dimiringkan sedikit di ruang 3D dan diberi
 *    lapisan kilau, sehingga terasa seperti benda fisik, bukan kotak datar.
 *    Kemiringannya statis (bukan animasi terus-menerus) supaya tidak membebani
 *    GPU ponsel.
 *
 * 2. KETERLIHATAN FITUR. Sebelumnya kartu ini bisa diketuk untuk membuka
 *    rincian dompet, tetapi TIDAK ADA satu pun tanda bahwa ia bisa diketuk —
 *    fiturnya ada tapi praktis tak pernah ditemukan orang. Sekarang ada baris
 *    ajakan yang jelas ("Ketuk untuk lihat N dompet") lengkap dengan panah yang
 *    berputar saat terbuka. Fitur yang tidak terlihat sama saja dengan tidak ada.
 */
export default function AtmCard() {
  const { wallets } = useFinanceStore();
  const [isExpanded, setIsExpanded] = useState(false);
  const [showBalance, setShowBalance] = useState(true);
  const [editingWallet, setEditingWallet] = useState<WalletType | null>(null);

  const safeWallets = wallets || [];
  const totalBalance = safeWallets.reduce((acc, w) => acc + Number(w.balance || 0), 0);

  const formatIDR = (num: number) =>
    new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(num);

  return (
    <div style={{ perspective: '1400px' }}>
      <motion.div
        // Kemiringan halus + sedikit dorongan ke depan saat ditekan: itulah yang
        // membuat benda datar terasa punya ketebalan.
        initial={{ rotateX: 8, rotateY: -6 }}
        whileTap={{ rotateX: 2, rotateY: -2, scale: 0.985 }}
        transition={{ type: 'spring', stiffness: 220, damping: 22 }}
        style={{ transformStyle: 'preserve-3d' }}
        className="relative w-full rounded-4xl overflow-hidden shadow-[0_20px_50px_-12px_rgba(0,0,0,0.75)]"
      >
        {/* Badan kartu */}
        <div className="absolute inset-0 bg-gradient-to-br from-brand-600 via-ink-800 to-accent-700" />
        <div className="absolute inset-0 bg-gradient-to-tr from-black/50 via-transparent to-white/10" />

        {/* Guratan cahaya diagonal — memberi kesan permukaan mengilap */}
        <div
          className="absolute inset-0 opacity-40"
          style={{
            background:
              'linear-gradient(115deg, transparent 30%, rgba(255,255,255,0.22) 45%, transparent 58%)',
          }}
        />
        <div className="absolute -top-16 -right-10 w-52 h-52 rounded-full bg-brand-300/25 blur-2xl" />

        <div className="relative p-6" style={{ transform: 'translateZ(30px)' }}>
          {/* Baris atas: label + chip + NFC + tombol mata */}
          <div className="flex justify-between items-start mb-6">
            <div>
              <p className="text-white/80 font-semibold tracking-widest text-micro uppercase mb-3">
                Total Saldo Aktif
              </p>
              <div className="flex items-center gap-2">
                {/* Chip kartu */}
                <div className="w-9 h-7 rounded-md bg-gradient-to-br from-yellow-200 via-yellow-400 to-yellow-600 shadow-inner relative overflow-hidden">
                  <div className="absolute inset-x-1 top-1/2 h-px bg-black/25" />
                  <div className="absolute inset-y-1 left-1/2 w-px bg-black/25" />
                </div>
                <Nfc size={20} className="text-white/70" />
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowBalance((v) => !v)}
              aria-label={showBalance ? 'Sembunyikan saldo' : 'Tampilkan saldo'}
              aria-pressed={!showBalance}
              className="w-11 h-11 -mr-2 -mt-2 shrink-0 inline-flex items-center justify-center rounded-full text-white/85 hover:bg-white/10 active:scale-90 transition-all"
            >
              {showBalance ? <Eye size={20} /> : <EyeOff size={20} />}
            </button>
          </div>

          {/* Nominal */}
          <h2
            className={`text-[2rem] leading-none font-extrabold text-white mb-1 tracking-tight tabular-nums ${
              totalBalance < 0 ? 'text-danger-400' : ''
            }`}
            data-selectable
          >
            {showBalance ? formatIDR(totalBalance) : 'Rp ••••••••'}
          </h2>
          <p className="text-white/70 text-micro">
            {safeWallets.length} dompet aktif
          </p>

          {/* AJAKAN YANG JELAS — inilah yang dulu tidak ada sama sekali */}
          <button
            type="button"
            onClick={() => setIsExpanded((v) => !v)}
            aria-expanded={isExpanded}
            className="mt-5 w-full min-h-[44px] flex items-center justify-between gap-2 rounded-2xl bg-white/15 border border-white/25 px-4 text-white active:scale-[0.98] transition-transform"
          >
            <span className="text-sm font-semibold">
              {isExpanded ? 'Tutup rincian dompet' : `Ketuk untuk lihat ${safeWallets.length} dompet`}
            </span>
            <ChevronDown
              size={18}
              className={`shrink-0 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}
            />
          </button>

          <AnimatePresence initial={false}>
            {isExpanded && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="mt-4 pt-4 border-t border-white/25 space-y-3"
              >
                {safeWallets.map((wallet) => (
                  <div key={wallet.id} className="flex justify-between items-center gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      {(wallet.name ?? '').toLowerCase().includes('cash') ? (
                        <Wallet size={16} className="text-brand-300 shrink-0" />
                      ) : (
                        <CreditCard size={16} className="text-accent-300 shrink-0" />
                      )}
                      <span className="text-white/95 font-medium truncate">{wallet.name}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-white font-bold tabular-nums shrink-0">
                        {showBalance ? formatIDR(Number(wallet.balance || 0)) : '••••••'}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingWallet(wallet);
                        }}
                        className="p-1.5 rounded-full text-white/40 hover:text-white/90 hover:bg-white/10 transition-colors"
                        aria-label="Edit dompet"
                      >
                        <Pencil size={14} />
                      </button>
                    </div>
                  </div>
                ))}
                {safeWallets.length === 0 && (
                  <p className="text-white/75 text-sm text-center">Belum ada dompet.</p>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
      <WalletEditor
        wallet={editingWallet}
        onClose={() => setEditingWallet(null)}
        onSuccess={() => {
          setEditingWallet(null);
          // Assuming useFinanceStore's fetchWallets might be needed, but mutations usually trigger a reload
          // if we refresh from parent Dashboard. The user will see it after Dashboard reloads or we can trigger it.
          // Since refreshAll/fetchWallets is available in store, we could call it:
          useFinanceStore.getState().fetchWallets();
        }}
      />
    </div>
  );
}
