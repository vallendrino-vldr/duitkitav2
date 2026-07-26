import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, X, Share } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const KUNCI_TUNDA = 'duitkita_install_ditunda';

function sudahTerpasang(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS memakai properti non-standar ini.
    (window.navigator as any).standalone === true
  );
}

function iniIOS(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) && !(window as any).MSStream;
}

/**
 * Ajakan pasang aplikasi ke layar utama.
 *
 * Browser hanya menembakkan `beforeinstallprompt` SEKALI dan pada saat yang
 * tidak bisa ditebak — biasanya sebelum halaman selesai digambar. Kalau
 * kejadiannya tidak ditangkap sejak awal, tombol pasang tidak akan pernah
 * muncul lagi sampai tab dibuka ulang. Karena itu event-nya sudah dijerat di
 * main.tsx sebelum React berjalan, dan komponen ini tinggal mengambilnya.
 *
 * Safari iOS tidak mendukung pemasangan otomatis sama sekali, jadi di sana
 * yang ditampilkan adalah petunjuk manual.
 */
export default function InstallPWA() {
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [tampil, setTampil] = useState(false);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    if (sudahTerpasang()) return;
    if (sessionStorage.getItem(KUNCI_TUNDA) === '1') return;

    // Event yang mungkin sudah tertangkap sebelum React sempat berjalan.
    const tertunda = (window as any).__duitkitaInstallPrompt as BeforeInstallPromptEvent | undefined;
    if (tertunda) {
      setPrompt(tertunda);
      setTampil(true);
    } else if (iniIOS()) {
      setIos(true);
      setTampil(true);
    }

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as BeforeInstallPromptEvent);
      setTampil(true);
    };
    const onInstalled = () => {
      setTampil(false);
      (window as any).__duitkitaInstallPrompt = undefined;
    };

    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const pasang = async () => {
    if (!prompt) return;
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === 'accepted') setTampil(false);
    // Event pasang hanya berlaku sekali pakai.
    (window as any).__duitkitaInstallPrompt = undefined;
    setPrompt(null);
  };

  const tunda = () => {
    sessionStorage.setItem(KUNCI_TUNDA, '1');
    setTampil(false);
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
            {ios ? (
              <p className="text-micro text-white/75 mt-1 leading-relaxed">
                Ketuk <Share size={12} className="inline align-[-1px]" /> lalu pilih
                <strong className="text-white"> Tambahkan ke Layar Utama</strong>.
              </p>
            ) : (
              <>
                <p className="text-micro text-white/75 mt-1 leading-relaxed">
                  Buka langsung dari layar utama, tetap tersambung data terbaru.
                </p>
                <button onClick={pasang} className="btn-primary mt-3 w-full text-sm">
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
