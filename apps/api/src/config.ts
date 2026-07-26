import path from 'node:path';
import fs from 'node:fs';
import dotenv from 'dotenv';

/**
 * Memuat .env dari folder API-nya sendiri, bukan dari folder tempat perintah diketik.
 *
 * BUG YANG DIPERBAIKI: `import 'dotenv/config'` membaca .env relatif terhadap
 * process.cwd(). Menjalankan server lewat `npm run dev` dari folder utama
 * membuat cwd = akar repo, sehingga apps/api/.env TIDAK PERNAH TERBACA.
 * Akibatnya semua kunci kosong, klien Supabase dibuat dengan URL kosong,
 * setiap pemeriksaan token gagal dengan "Sesi tidak valid", dan seluruh fitur
 * AI mati — semuanya tanpa satu pun pesan peringatan.
 */
function muatEnv() {
  // Proyek ini dikompilasi ke CommonJS, jadi __dirname selalu tersedia dan
  // selalu menunjuk ke folder berkas ini — bukan ke folder tempat perintah diketik.
  const dir = __dirname;

  const kandidat = [
    path.resolve(dir, '../.env'),        // apps/api/.env  (dari src/)
    path.resolve(dir, '../../.env'),     // apps/.env
    path.resolve(process.cwd(), '.env'), // cadangan: folder saat ini
  ];

  for (const berkas of kandidat) {
    if (fs.existsSync(berkas)) {
      dotenv.config({ path: berkas });
      return berkas;
    }
  }
  return null;
}

const berkasEnv = muatEnv();

export const config = {
  port: Number(process.env.PORT) || 4000,
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  supabaseUrl: process.env.SUPABASE_URL || '',
  // Kunci anon sudah cukup untuk MEMVERIFIKASI token pengguna. Hanya operasi
  // admin lintas-pengguna (buat/hapus akun) yang butuh service_role.
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '',
  supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  geminiKeys: [process.env.GEMINI_API_KEY, process.env.GEMINI_API_KEY_SECONDARY]
    .filter((k): k is string => Boolean(k && k.trim())),
  geminiModel: process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
};

/**
 * Berhenti keras kalau kunci wajib tidak ada.
 * Lebih baik server menolak menyala dengan pesan jelas daripada menyala lalu
 * menolak setiap permintaan dengan "Sesi tidak valid" yang membingungkan.
 */
/**
 * Membaca isi JWT tanpa memverifikasi tanda tangannya — cukup untuk memeriksa
 * apakah bentuk klaimnya masuk akal.
 */
function bacaKlaim(jwt: string): Record<string, unknown> | null {
  try {
    const bagian = jwt.split('.');
    if (bagian.length !== 3) return null;
    return JSON.parse(Buffer.from(bagian[1], 'base64url').toString());
  } catch {
    return null;
  }
}

/**
 * Memeriksa apakah kunci benar-benar milik proyek ini dan punya peran yang benar.
 *
 * Ditambahkan setelah menemukan SUPABASE_SERVICE_ROLE_KEY berisi JWT KARANGAN:
 * bentuknya sah, tapi klaimnya `{"ref":"service_role"}` tanpa klaim `role` sama
 * sekali — bukan kunci Supabase asli. Akibatnya setiap permintaan dijawab
 * "Invalid API key", yang di aplikasi muncul sebagai "Sesi tidak valid".
 */
export function periksaKunci(jwt: string, peranDiharapkan: string): { valid: boolean; alasan?: string } {
  if (!jwt) return { valid: false, alasan: 'kosong' };
  const klaim = bacaKlaim(jwt);
  if (!klaim) return { valid: false, alasan: 'bukan JWT yang bisa dibaca' };

  const refProyek = config.supabaseUrl.replace(/^https?:\/\//, '').split('.')[0];
  if (klaim.role !== peranDiharapkan) {
    return { valid: false, alasan: `klaim role = ${JSON.stringify(klaim.role)}, seharusnya "${peranDiharapkan}"` };
  }
  if (refProyek && klaim.ref !== refProyek) {
    return { valid: false, alasan: `klaim ref = ${JSON.stringify(klaim.ref)}, seharusnya "${refProyek}"` };
  }
  return { valid: true };
}

export const serviceKeyValid = () => periksaKunci(config.supabaseServiceKey, 'service_role').valid;

export function pastikanConfigValid() {
  console.log(`[API] berkas .env : ${berkasEnv ?? '(TIDAK DITEMUKAN)'}`);
  console.log(`[API] Supabase    : ${config.supabaseUrl || 'KOSONG'}`);

  if (!config.supabaseUrl) {
    console.error('\n[API] GAGAL MENYALA — SUPABASE_URL tidak ditemukan di apps/api/.env\n');
    process.exit(1);
  }

  const anon = periksaKunci(config.supabaseAnonKey, 'anon');
  const service = periksaKunci(config.supabaseServiceKey, 'service_role');

  console.log(`[API] Kunci anon  : ${anon.valid ? 'OK' : `TIDAK VALID (${anon.alasan})`}`);
  console.log(`[API] Service key : ${service.valid ? 'OK' : `TIDAK VALID (${service.alasan})`}`);
  console.log(`[API] Kunci Gemini: ${config.geminiKeys.length} tersedia`);
  console.log(`[API] Model AI    : ${config.geminiModel}`);

  if (!anon.valid) {
    console.error(
      `\n[API] GAGAL MENYALA — SUPABASE_ANON_KEY tidak valid: ${anon.alasan}\n` +
      `      Ambil di Supabase Dashboard > Project Settings > API Keys > anon public\n`,
    );
    process.exit(1);
  }

  if (!service.valid) {
    console.warn(
      `\n[API] PERINGATAN: SUPABASE_SERVICE_ROLE_KEY tidak valid (${service.alasan}).\n` +
      `      Login, scan struk, dan AI TETAP JALAN (pakai kunci anon).\n` +
      `      Yang mati hanya panel admin (buat/hapus/ubah akun & monitor penyimpanan).\n` +
      `      Perbaiki: Supabase Dashboard > Project Settings > API Keys > service_role\n` +
      `      lalu tempel ke apps/api/.env pada baris SUPABASE_SERVICE_ROLE_KEY=\n`,
    );
  }

  if (config.geminiKeys.length === 0) {
    console.warn('[API] PERINGATAN: GEMINI_API_KEY kosong — fitur AI akan gagal.');
  }
}
