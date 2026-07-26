import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { safeMutate, PROFILE_COLUMNS } from './db';
import { useFinanceStore, type Profile } from '../store/useFinanceStore';

/**
 * Status sesi. Ini SATU-SATUNYA sumber kebenaran soal "boleh masuk atau belum".
 *
 * Empat nilai ini saling meniadakan dan mencakup semua kemungkinan, jadi
 * ProtectedRoute selalu punya tepat satu cabang untuk dirender. Versi lama
 * menyimpan `session`, `role`, `loading`, dan `isLocked` secara terpisah lalu
 * membaca sessionStorage saat render — kombinasi tertentu membuat layar tidak
 * merender apa pun (layar putih tanpa error).
 */
export type AuthStatus = 'loading' | 'signedOut' | 'locked' | 'ready';

interface AuthContextValue {
  status: AuthStatus;
  session: Session | null;
  profile: Profile | null;
  role: 'user' | 'admin' | null;
  unlock: () => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const KUNCI_BUKA = 'duitkita_unlocked';

/** Dibaca sekali di luar render. Nilainya = id user, jadi ganti akun otomatis mengunci lagi. */
function bacaStatusBuka(): string | null {
  try {
    return sessionStorage.getItem(KUNCI_BUKA);
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  // `undefined` = belum diketahui, `null` = sudah dipastikan tidak ada sesi.
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileSiap, setProfileSiap] = useState(false);
  const [unlockedFor, setUnlockedFor] = useState<string | null>(() => bacaStatusBuka());

  const setProfileDiStore = useFinanceStore((s) => s.setProfile);

  const tandaiTerbuka = useCallback((userId: string) => {
    try {
      sessionStorage.setItem(KUNCI_BUKA, userId);
    } catch {
      /* mode privat: cukup simpan di memori */
    }
    setUnlockedFor(userId);
  }, []);

  const unlock = useCallback(() => {
    const uid = session?.user?.id;
    if (uid) tandaiTerbuka(uid);
  }, [session, tandaiTerbuka]);

  const signOut = useCallback(async () => {
    try {
      sessionStorage.removeItem(KUNCI_BUKA);
    } catch { /* abaikan */ }
    setUnlockedFor(null);
    await supabase.auth.signOut();
  }, []);

  useEffect(() => {
    let aktif = true;

    supabase.auth.getSession().then(({ data }) => {
      if (aktif) setSession(data.session ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, sesiBaru) => {
      if (!aktif) return;
      setSession(sesiBaru ?? null);

      if (event === 'SIGNED_OUT' || !sesiBaru) {
        try { sessionStorage.removeItem(KUNCI_BUKA); } catch { /* abaikan */ }
        setUnlockedFor(null);
        setProfile(null);
        setProfileSiap(false);
        return;
      }

      // Baru saja login pakai kata sandi = identitas sudah terbukti, jadi langsung
      // buka. PIN gunanya menjaga sesi yang ditinggal / dibuka ulang, bukan
      // menanyai orang yang detik ini juga baru mengetik kata sandinya.
      if (event === 'SIGNED_IN') tandaiTerbuka(sesiBaru.user.id);
    });

    return () => {
      aktif = false;
      subscription.unsubscribe();
    };
  }, [tandaiTerbuka]);

  // Ambil profil setiap kali user berganti.
  useEffect(() => {
    let aktif = true;

    if (session === undefined) return;
    if (session === null) {
      setProfile(null);
      setProfileSiap(true);
      return;
    }

    setProfileSiap(false);
    (async () => {
      try {
        const rows = await safeMutate<Profile[]>(
          supabase.from('profiles').select(PROFILE_COLUMNS).eq('id', session.user.id).limit(1),
          'Gagal memuat profil',
        );
        if (!aktif) return;
        const p = rows?.[0] ?? null;
        setProfile(p);
        setProfileDiStore(p);
      } catch (e) {
        console.error('[AUTH] gagal memuat profil', e);
        if (aktif) setProfile(null);
      } finally {
        // Selalu dijalankan: kegagalan mengambil profil tidak boleh membuat
        // aplikasi menggantung di layar "Memuat" selamanya.
        if (aktif) setProfileSiap(true);
      }
    })();

    return () => { aktif = false; };
  }, [session, setProfileDiStore]);

  const status: AuthStatus =
    session === undefined ? 'loading'
    : session === null ? 'signedOut'
    : !profileSiap ? 'loading'
    : unlockedFor !== session.user.id ? 'locked'
    : 'ready';

  return (
    <AuthContext.Provider
      value={{
        status,
        session: session ?? null,
        profile,
        role: profile?.role ?? (session ? 'user' : null),
        unlock,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth harus dipakai di dalam <AuthProvider>');
  return ctx;
}
