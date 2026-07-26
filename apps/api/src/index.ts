// WAJIB paling atas: memuat .env dari folder API sendiri sebelum modul lain
// (yang membuat klien Supabase saat di-import) ikut dijalankan.
import { config, pastikanConfigValid } from './config';
import express from 'express';
import cors from 'cors';

import authRoutes from './routes/auth';
import scanRoutes from './routes/scan';
import adminRoutes from './routes/admin';
import { requireAdmin } from './middleware/auth';

const app = express();

// Sebelumnya `origin: true` memantulkan origin APA PUN. Sekarang dibatasi ke
// frontend yang dikenal (beberapa origin bisa dipisah koma di FRONTEND_URL).
const ORIGIN_DIIZINKAN = config.frontendUrl.split(',').map((s) => s.trim()).filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    // localhost/127.0.0.1 di port mana pun diizinkan saat pengembangan, supaya
    // membuka aplikasi lewat IP jaringan atau port lain tidak langsung diblokir.
    const lokal = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\]|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+)(:\d+)?$/;
    if (ORIGIN_DIIZINKAN.includes(origin) || lokal.test(origin)) return cb(null, true);
    cb(new Error(`Origin ditolak: ${origin}`));
  },
  credentials: true,
}));

app.use(express.json({ limit: '1mb' }));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', message: 'DuitKita API is running' });
});

// Router-router ini SEBELUMNYA TIDAK PERNAH DIPASANG — file-nya ada tapi tidak
// pernah tersambung, jadi /api/scan/receipt selalu membalas 404 dan fitur
// "Scan Struk" tidak pernah sekali pun berhasil.
app.use('/api/auth', authRoutes);
app.use('/api/scan', scanRoutes);
app.use('/api/admin', requireAdmin, adminRoutes);

app.use((_req, res) => {
  res.status(404).json({ error: 'Endpoint tidak ditemukan' });
});

// Penangkap error terakhir supaya kegagalan membalas JSON, bukan HTML Express.
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[API] error tidak tertangani:', err);
  const status = err?.message?.startsWith('Origin ditolak') ? 403 : 500;
  res.status(status).json({ error: err?.message || 'Terjadi kesalahan server' });
});

// Diperiksa sebelum listen: kalau kunci tidak lengkap, server berhenti dengan
// pesan jelas alih-alih menyala lalu menolak semua permintaan.
pastikanConfigValid();

app.listen(config.port, () => {
  console.log(`[API] Server berjalan di http://localhost:${config.port}`);
});
