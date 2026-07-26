import type { PostgrestError } from '@supabase/supabase-js';

/**
 * Kolom `profiles` yang boleh dibaca klien.
 * `security_pin` sengaja TIDAK ada di sini — kolomnya sudah dicabut di database,
 * jadi `select('*')` akan gagal dengan "permission denied for table profiles".
 * Selalu pakai konstanta ini, jangan pernah `select('*')` pada profiles.
 */
export const PROFILE_COLUMNS = 'id, email, username, display_name, role, created_at';

/** Error database yang sudah diterjemahkan dan aman ditampilkan ke pengguna. */
export class DbError extends Error {
  readonly code?: string;
  readonly raw?: PostgrestError | null;

  constructor(message: string, raw?: PostgrestError | null) {
    super(message);
    this.name = 'DbError';
    this.code = raw?.code;
    this.raw = raw ?? null;
  }
}

const PESAN_ERROR: Record<string, string> = {
  '42501': 'Akses ditolak. Sesi kamu mungkin sudah berakhir — silakan masuk ulang.',
  '23505': 'Data dengan nama tersebut sudah ada.',
  '23503': 'Data terkait tidak ditemukan atau sudah dihapus.',
  '23514': 'Data tidak memenuhi aturan validasi.',
  '22023': 'Format data tidak valid.',
  'PGRST301': 'Sesi kamu sudah berakhir. Silakan masuk ulang.',
};

type QueryResult<T> = { data: T | null; error: PostgrestError | null };

function terjemahkan(error: PostgrestError, fallback: string): string {
  return PESAN_ERROR[error.code] ?? `${fallback}: ${error.message}`;
}

/**
 * Menjalankan query Supabase dan MELEMPAR DbError bila gagal.
 *
 * Pengganti wajib untuk pola lama `const { error } = await supabase...` yang
 * hasil errornya tidak pernah diperiksa — penyebab "toast hijau padahal data
 * tidak pernah tersimpan". Dengan RLS aktif, kegagalan jadi hal yang normal,
 * jadi kegagalan harus terlihat.
 */
export async function safeMutate<T>(
  query: PromiseLike<QueryResult<T>>,
  fallback = 'Operasi gagal',
): Promise<T | null> {
  const { data, error } = await query;
  if (error) {
    console.error(`[DB] ${fallback}`, error);
    throw new DbError(terjemahkan(error, fallback), error);
  }
  return data;
}

/**
 * Seperti safeMutate, tapi juga menolak hasil kosong.
 * Dipakai untuk insert/update yang diakhiri `.select()`: bila RLS memblokir baris,
 * Supabase mengembalikan array kosong TANPA error — dan kode lama memakai `data[0]`
 * sehingga `undefined` masuk ke state dan merusak render berikutnya.
 */
export async function safeMutateOne<T>(
  query: PromiseLike<QueryResult<T[]>>,
  fallback = 'Operasi gagal',
): Promise<T> {
  const rows = await safeMutate<T[]>(query, fallback);
  if (!rows || rows.length === 0) {
    throw new DbError(
      `${fallback}: server tidak mengembalikan data (kemungkinan ditolak aturan keamanan).`,
    );
  }
  return rows[0];
}

/** Mengambil pesan yang layak ditampilkan dari error apa pun. */
export function pesanError(e: unknown, fallback = 'Terjadi kesalahan'): string {
  if (e instanceof DbError) return e.message;
  if (e instanceof Error && e.message) return e.message;
  return fallback;
}
