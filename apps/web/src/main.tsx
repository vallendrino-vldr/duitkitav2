import React from 'react';
import ReactDOM from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import './index.css';

/**
 * Jerat `beforeinstallprompt` SEBELUM React berjalan.
 *
 * Browser menembakkan event ini sekali saja, sangat awal — sering sebelum React
 * sempat memasang pendengarnya. Kalau terlewat, tombol "Pasang" tidak pernah
 * muncul sampai tab dibuka ulang.
 */
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  (window as any).__duitkitaInstallPrompt = e;
});

/**
 * MEMAKSA APLIKASI TERPASANG SELALU MEMAKAI VERSI TERBARU.
 *
 * Masalah sebelumnya: membuka lewat ikon PWA menampilkan versi lama, sedangkan
 * membuka lewat browser sudah versi baru. Penyebabnya, service worker yang lama
 * masih memegang kendali halaman. Meski versi baru sudah terunduh, ia hanya
 * MENUNGGU di belakang layar sampai semua jendela aplikasi ditutup — dan
 * aplikasi terpasang nyaris tidak pernah benar-benar ditutup.
 *
 * Tiga hal yang dilakukan di bawah:
 * 1. Versi baru langsung dipasang begitu terdeteksi (tidak menunggu antrean).
 * 2. Halaman dimuat ulang satu kali saat kendali berpindah, supaya berkas yang
 *    sudah dipegang browser ikut diperbarui. Dijaga penanda agar tidak berulang.
 * 3. Pemeriksaan berkala + saat aplikasi dibuka kembali, sehingga hasil deploy
 *    baru terpakai tanpa perlu menutup aplikasi.
 */
const perbaruiSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    perbaruiSW(true); // pasang sekarang, lalu muat ulang
  },
  onRegisteredSW(_url, reg) {
    if (!reg) return;
    const cek = () => { void reg.update(); };
    setInterval(cek, 60_000);
    // Saat pengguna kembali ke aplikasi, periksa juga — momen paling wajar
    // seseorang mendapati versi barunya.
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) cek();
    });
  },
});

let sudahMuatUlang = false;
navigator.serviceWorker?.addEventListener('controllerchange', () => {
  if (sudahMuatUlang) return;
  sudahMuatUlang = true;
  window.location.reload();
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
