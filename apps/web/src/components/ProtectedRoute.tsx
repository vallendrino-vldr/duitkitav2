import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../lib/AuthProvider';
import PinLockScreen from './PinLockScreen';
import FullScreenLoader from './FullScreenLoader';

interface ProtectedRouteProps {
  children: ReactNode;
  allowedRole?: 'user' | 'admin';
}

/**
 * Penjaga rute murni: tidak menyimpan state, tidak mengambil data, tidak menyentuh
 * sessionStorage. Semua keputusan datang dari `status` milik AuthProvider.
 *
 * Setiap cabang di bawah mengembalikan sesuatu yang terlihat, dan `status` hanya
 * punya empat nilai — jadi secara struktural tidak mungkin lagi merender layar
 * kosong. Versi lama bisa: `isLocked` selalu disetel true saat mount, sementara
 * layar PIN menyembunyikan dirinya sendiri berdasarkan sessionStorage, sehingga
 * layar PIN dan isi halaman sama-sama tidak muncul.
 */
export default function ProtectedRoute({ children, allowedRole = 'user' }: ProtectedRouteProps) {
  const { status, role, unlock } = useAuth();

  if (status === 'loading') {
    return <FullScreenLoader label="Memuat sistem…" />;
  }

  if (status === 'signedOut') {
    return <Navigate to="/login" replace />;
  }

  if (status === 'locked') {
    return <PinLockScreen isLocked onUnlock={unlock} />;
  }

  // status === 'ready'
  if (allowedRole === 'admin' && role !== 'admin') {
    return <Navigate to="/dashboard" replace />;
  }

  if (allowedRole === 'user' && role === 'admin') {
    return <Navigate to="/admin" replace />;
  }

  return <>{children}</>;
}
