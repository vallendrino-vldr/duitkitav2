import type { Request, Response, NextFunction } from 'express';
import { createClient } from '@supabase/supabase-js';
import { config, serviceKeyValid } from '../config';

/**
 * Verifikasi token memakai kunci ANON, bukan service_role.
 *
 * Kunci anon sudah cukup untuk memanggil /auth/v1/user dan memastikan sebuah
 * token asli — sudah diuji langsung ke Supabase (HTTP 200). Ini penting karena
 * service_role yang ada di .env ternyata JWT karangan, dan dulu SEMUA
 * pemeriksaan login lewat kunci itu. Akibatnya login, scan struk, dan seluruh
 * fitur AI ikut mati padahal sesi penggunanya baik-baik saja.
 *
 * Dengan pemisahan ini, service_role hanya dipakai untuk hal yang benar-benar
 * memerlukannya (kelola akun orang lain di panel admin).
 */
const supabaseAuth = createClient(config.supabaseUrl, config.supabaseAnonKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

export interface AuthedRequest extends Request {
  userId?: string;
  userRole?: 'user' | 'admin';
  userToken?: string;
}

function ambilToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  return header.slice('Bearer '.length).trim() || null;
}

export async function requireUser(req: AuthedRequest, res: Response, next: NextFunction) {
  const token = ambilToken(req);
  if (!token) return res.status(401).json({ error: 'Tidak terautentikasi' });

  try {
    const { data, error } = await supabaseAuth.auth.getUser(token);
    if (error || !data.user) {
      console.error('[AUTH] token ditolak:', error?.message ?? 'tidak ada user');
      return res.status(401).json({
        error: 'Sesi tidak valid atau sudah berakhir. Silakan masuk ulang.',
      });
    }

    req.userId = data.user.id;
    req.userToken = token;

    // Peran dibaca memakai token pengguna itu sendiri. Kebijakan RLS
    // "Users can view own profile" mengizinkannya, jadi service_role tidak perlu.
    const klienPengguna = createClient(config.supabaseUrl, config.supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: profile } = await klienPengguna
      .from('profiles')
      .select('role')
      .eq('id', data.user.id)
      .maybeSingle();

    req.userRole = (profile?.role as 'user' | 'admin') ?? 'user';
    next();
  } catch (e) {
    console.error('[AUTH] verifikasi token gagal', e);
    res.status(401).json({ error: 'Sesi tidak valid' });
  }
}

export async function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction) {
  await requireUser(req, res, () => {
    if (req.userRole !== 'admin') {
      return res.status(403).json({ error: 'Butuh hak akses admin' });
    }
    // Pesan jelas, bukan kegagalan misterius: panel admin memang mustahil
    // bekerja tanpa service_role yang sah.
    if (!serviceKeyValid()) {
      return res.status(503).json({
        error:
          'Panel admin butuh SUPABASE_SERVICE_ROLE_KEY yang sah. ' +
          'Kunci di apps/api/.env saat ini tidak valid — ambil yang asli di ' +
          'Supabase Dashboard > Project Settings > API Keys > service_role.',
      });
    }
    next();
  });
}
