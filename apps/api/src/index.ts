// Titik masuk untuk pengembangan lokal: bangun aplikasi lalu dengarkan port.
// Di Vercel yang dipakai adalah api/[...slug].ts, bukan berkas ini.
import { config, pastikanConfigValid } from './config';
import { buatApp } from './app';

// Diperiksa sebelum listen: kalau kunci tidak lengkap, server berhenti dengan
// pesan jelas alih-alih menyala lalu menolak semua permintaan.
pastikanConfigValid();

buatApp().listen(config.port, () => {
  console.log(`[API] Server berjalan di http://localhost:${config.port}`);
});
