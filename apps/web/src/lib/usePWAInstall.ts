import { useCallback, useEffect, useState } from 'react';

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export type StatusPasang =
  | 'siap'          // browser menawarkan pemasangan otomatis
  | 'terpasang'     // sudah dipasang / sedang dibuka sebagai aplikasi
  | 'manual-ios'    // Safari iOS: hanya bisa lewat menu Bagikan
  | 'belum-siap';   // belum ada tawaran (butuh service worker + interaksi pengguna)

export function sudahTerpasang(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // Properti non-standar khusus iOS.
    (window.navigator as any).standalone === true
  );
}

export function iniIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent) && !(window as any).MSStream;
}

/**
 * Satu sumber kebenaran untuk pemasangan PWA.
 *
 * Event `beforeinstallprompt` hanya ditembakkan SEKALI dan sangat awal, sering
 * sebelum React sempat memasang pendengarnya. Karena itu event-nya sudah dijerat
 * di main.tsx sebelum React berjalan lalu disimpan di window; hook ini tinggal
 * mengambilnya. Tanpa jerat itu, tombol pasang bisa tidak pernah muncul sampai
 * tab dibuka ulang.
 */
export function usePWAInstall() {
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [terpasang, setTerpasang] = useState(sudahTerpasang);

  useEffect(() => {
    const tertunda = (window as any).__duitkitaInstallPrompt as BeforeInstallPromptEvent | undefined;
    if (tertunda) setPrompt(tertunda);

    const onPrompt = (e: Event) => {
      e.preventDefault();
      (window as any).__duitkitaInstallPrompt = e;
      setPrompt(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      (window as any).__duitkitaInstallPrompt = undefined;
      setPrompt(null);
      setTerpasang(true);
    };

    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const status: StatusPasang = terpasang
    ? 'terpasang'
    : prompt
      ? 'siap'
      : iniIOS()
        ? 'manual-ios'
        : 'belum-siap';

  /** Mengembalikan true bila pengguna menyetujui pemasangan. */
  const pasang = useCallback(async (): Promise<boolean> => {
    if (!prompt) return false;
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    // Tawaran pemasangan hanya berlaku sekali pakai.
    (window as any).__duitkitaInstallPrompt = undefined;
    setPrompt(null);
    if (outcome === 'accepted') setTerpasang(true);
    return outcome === 'accepted';
  }, [prompt]);

  return { status, pasang };
}
