import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, X, Share } from 'lucide-react';
import { usePWAInstall } from '../lib/usePWAInstall';

const KUNCI_TUNDA = 'duitkita_install_ditunda';

/**
 * Ajakan memasang aplikasi, muncul mengambang di bawah.
 *
 * Sengaja BUKAN satu-satunya jalan memasang: tombol permanen juga tersedia di
 * halaman Pengaturan. Browser hanya menawarkan pemasangan otomatis bila
 * syaratnya terpenuhi (service worker aktif, sudah ada interaksi, belum
 * terpasang), dan Safari iOS tidak mendukungnya sama sekali — kalau hanya
 * mengandalkan kartu ini, banyak pengguna tidak pernah melihat cara memasang.
 */
export default function InstallPWA() {
  const { status, pasang } = usePWAInstall();
  const [ditunda, setDitunda] = useState(true);

  useEffect(() => {
    try {
      setDitunda(sessionStorage.getItem(KUNCI_TUNDA) === '1');
    } catch {
      setDitunda(false);
    }
  }, []);

  const tampil = !ditunda && (status === 'siap' || status === 'manual-ios');

  const tunda = () => {
    try { sessionStorage.setItem(KUNCI_TUNDA, '1'); } catch { /* mode privat */ }
    setDitunda(true);
  };

  return (
    <AnimatePresence>
      {tampil && (
        <motion.div
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={{ type: 'spring', damping: 22, stiffness: 110 }}
          className="fixed left-4 right-4 bottom-[calc(7.5rem+env(safe-area-inset-bottom,0px))] md:left-auto md:right-6 md:bottom-6 md:w-96 z-50 glass-strong rounded-3xl p-4 flex items-start gap-3"
          role="dialog"
          aria-label="Pasang aplikasi"
        >
          <div className="w-11 h-11 shrink-0 rounded-2xl bg-gradient-to-br from-brand-400 to-accent-600 flex items-center justify-center shadow-glow-brand">
            <Download size={20} className="text-white" />
          </div>

          <div className="min-w-0 flex-1">
            <p className="font-bold text-sm">Pasang DuitKita</p>
            {status === 'manual-ios' ? (
              <p className="text-micro text-white/75 mt-1 leading-relaxed">
                Ketuk <Share size={12} className="inline align-[-1px]" /> di bilah bawah Safari, lalu pilih
                <strong className="text-white"> Tambahkan ke Layar Utama</strong>.
              </p>
            ) : (
              <>
                <p className="text-micro text-white/75 mt-1 leading-relaxed">
                  Buka langsung dari layar utama, datanya tetap yang terbaru.
                </p>
                <button onClick={() => void pasang()} className="btn-primary mt-3 w-full text-sm">
                  <Download size={16} /> Pasang Sekarang
                </button>
              </>
            )}
          </div>

          <button onClick={tunda} aria-label="Nanti saja" className="icon-btn shrink-0 -mt-1 -mr-1">
            <X size={18} />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
