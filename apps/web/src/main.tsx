import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import './index.css';

/**
 * Jerat `beforeinstallprompt` SEBELUM React berjalan.
 *
 * Browser menembakkan event ini sekali saja, sangat awal — sering sebelum React
 * sempat memasang pendengarnya. Kalau terlewat, tombol "Pasang" tidak akan
 * pernah muncul sampai tab dibuka ulang. Disimpan di window supaya komponen
 * InstallPWA bisa mengambilnya kapan pun ia siap.
 */
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  (window as any).__duitkitaInstallPrompt = e;
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
