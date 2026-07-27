/**
 * Titik masuk API untuk Vercel.
 *
 * Nama berkas `[...slug].ts` berarti SELURUH permintaan ke /api/* diarahkan ke
 * sini beserta jalur aslinya, sehingga routing Express (/api/scan, /api/admin,
 * /api/auth) tetap bekerja apa adanya. Kalau berkas ini dinamai `index.ts`,
 * Vercel hanya akan menangani /api saja dan sub-jalurnya balas 404.
 *
 * Aplikasi Express diekspor langsung: di runtime Node milik Vercel, sebuah
 * app Express memang berbentuk fungsi (req, res) yang cocok sebagai handler.
 *
 * Di Vercel tidak ada berkas .env — nilainya diambil dari Environment Variables
 * pada dasbor proyek. `config.ts` sudah menanganinya (berkas .env hanya dicari
 * bila ada, selebihnya membaca process.env).
 */
import { buatApp } from '../apps/api/src/app';

export default buatApp();
