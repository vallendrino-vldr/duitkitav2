// WAJIB paling atas: memuat .env dari folder API sendiri sebelum modul lain
// (yang membuat klien Supabase saat di-import) ikut dijalankan.
import { config } from './config';
import express from 'express';
import cors from 'cors';

import authRoutes from './routes/auth';
import scanRoutes from './routes/scan';
import adminRoutes from './routes/admin';
import { requireAdmin } from './middleware/auth';

/**
 * Membangun aplikasi Express TANPA memanggil listen().
 *
 * Dipisahkan dari index.ts supaya bisa dipakai dua cara:
 *  - lokal  : index.ts memanggil listen() seperti server biasa
 *  - Vercel : api/[...slug].ts mengekspornya sebagai fungsi serverless
 * Vercel tidak menjalankan proses yang hidup terus, jadi memanggil listen()
 * di sana justru membuat penerapan gagal.
 */
export function buatApp() {
  const app = express();

  const ORIGIN_DIIZINKAN = config.frontendUrl.split(',').map((s) => s.trim()).filter(Boolean);

  app.use(cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);

      // Saat di Vercel, frontend dan API berbagi domain yang sama sehingga
      // permintaannya bukan lintas-origin sama sekali. Domain *.vercel.app
      // tetap diizinkan agar pratinjau tiap deploy (URL-nya selalu berubah)
      // tidak ikut terblokir.
      const lokal = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\]|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+)(:\d+)?$/;
      const vercel = /^https:\/\/[a-z0-9-]+\.vercel\.app$/i;

      if (ORIGIN_DIIZINKAN.includes(origin) || lokal.test(origin) || vercel.test(origin)) {
        return cb(null, true);
      }
      cb(new Error(`Origin ditolak: ${origin}`));
    },
    credentials: true,
  }));

  app.use(express.json({ limit: '1mb' }));

  const health = (req: express.Request, res: express.Response) => {
    res.json({
      status: 'ok',
      message: 'DuitKita API is running',
      lingkungan: process.env.VERCEL ? 'vercel' : 'lokal',
      // Jalur yang benar-benar dilihat Express setelah rewrite. Dicantumkan
      // karena kegagalan sebelumnya justru terjadi di lapisan routing Vercel,
      // dan tanpa angka ini penyebabnya hanya bisa ditebak-tebak.
      jalurTerbaca: req.originalUrl,
    });
  };
  app.get('/health', health);
  app.get('/api/health', health); // di Vercel semua lalu lintas fungsi diawali /api

  /** Uji rute bersarang: membuktikan jalur multi-segmen benar-benar sampai. */
  app.get('/api/diag/rute/:a/:b', (req, res) => {
    res.json({ ok: true, jalurTerbaca: req.originalUrl, a: req.params.a, b: req.params.b });
  });

  // Router-router ini SEBELUMNYA TIDAK PERNAH DIPASANG — berkasnya ada tapi tidak
  // pernah tersambung, jadi /api/scan/receipt selalu membalas 404.
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

  return app;
}
