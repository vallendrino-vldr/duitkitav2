import axios from 'axios';
import { supabase } from './supabase';

/**
 * Menentukan alamat API.
 *
 * Di Vercel, frontend dan API berbagi domain yang sama, jadi alamat dasarnya
 * harus KOSONG supaya permintaan jadi relatif ('/api/...') dan menuju domain
 * yang sedang dibuka. Kalau tetap dipaku ke http://localhost:4000, aplikasi
 * yang dibuka dari ponsel akan mencari server di ponsel itu sendiri — dan
 * seluruh fitur AI serta panel admin langsung mati.
 */
function tentukanBaseURL(): string {
  const dariEnv = import.meta.env.VITE_API_URL;
  if (typeof dariEnv === 'string' && dariEnv.trim()) return dariEnv.trim();

  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    const lokal = host === 'localhost' || host === '127.0.0.1' || host === '::1';
    // Bukan di komputer sendiri -> API satu domain dengan halamannya.
    if (!lokal) return '';
  }
  return 'http://localhost:4000';
}

export const api = axios.create({ baseURL: tentukanBaseURL(), timeout: 45000 });

/**
 * Menempelkan token sesi ke setiap permintaan. Endpoint AI sekarang wajib login
 * di sisi server — sebelumnya siapa pun bisa memanggilnya dan membakar kuota
 * Gemini tanpa punya akun.
 */
api.interceptors.request.use(async (config) => {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

/** Pesan error yang enak dibaca dari kegagalan panggilan API. */
export function pesanApi(e: unknown, fallback: string): string {
  if (axios.isAxiosError(e)) {
    if (e.code === 'ECONNABORTED') return 'Permintaan terlalu lama. Coba lagi.';
    if (!e.response) return 'Tidak bisa menghubungi server. Pastikan API menyala.';
    return (e.response.data as any)?.error || fallback;
  }
  return fallback;
}

/**
 * Mengunggah struk ke bucket `receipts`, di folder milik user sendiri.
 * Aturan keamanan storage mensyaratkan segmen pertama nama file = id user.
 * Mengembalikan path yang disimpan di kolom transactions.receipt_url.
 */
export async function unggahStruk(file: File): Promise<string | null> {
  const { data: sesi } = await supabase.auth.getSession();
  const uid = sesi.session?.user?.id;
  if (!uid) return null;

  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
  const path = `${uid}/${crypto.randomUUID()}.${ext}`;

  const { error } = await supabase.storage
    .from('receipts')
    .upload(path, file, { contentType: file.type, upsert: false });

  if (error) {
    console.error('[STORAGE] gagal mengunggah struk', error);
    return null;
  }
  return path;
}

/** Bucket bersifat privat, jadi tampilkan lewat URL bertanda tangan sementara. */
export async function urlStruk(path: string, detik = 3600): Promise<string | null> {
  const { data, error } = await supabase.storage.from('receipts').createSignedUrl(path, detik);
  if (error) {
    console.error('[STORAGE] gagal membuat signed url', error);
    return null;
  }
  return data?.signedUrl ?? null;
}
