import { api } from './api';

export interface StatsAdmin {
  pengguna: number;
  dompet: number;
  transaksi: number;
  hutang: number;
  target: number;
  totalMasuk: number;
  totalKeluar: number;
}

export interface PemakaianPengguna {
  userId: string;
  bytes: number;
  jumlah: number;
}

export interface StorageAdmin {
  totalMB: number;
  totalBytes: number;
  totalFiles: number;
  limitMB: number;
  persen: number;
  rataRataKB: number;
  perPengguna: PemakaianPengguna[];
  diperbaruiPada: string;
}

export interface PenggunaAdmin {
  id: string;
  email: string;
  username: string;
  display_name: string | null;
  role: 'user' | 'admin';
  created_at: string;
  totalSaldo: number;
  jumlahTransaksi: number;
}

export const adminApi = {
  stats: () => api.get<StatsAdmin>('/api/admin/stats').then((r) => r.data),
  storage: () => api.get<StorageAdmin>('/api/admin/storage').then((r) => r.data),
  users: () => api.get<PenggunaAdmin[]>('/api/admin/users').then((r) => r.data),

  buatUser: (payload: {
    email: string; password: string; username?: string;
    display_name?: string; role?: 'user' | 'admin'; security_pin?: string;
  }) => api.post('/api/admin/users', payload).then((r) => r.data),

  ubahUser: (id: string, payload: {
    display_name?: string; username?: string; role?: 'user' | 'admin';
  }) => api.patch(`/api/admin/users/${id}`, payload).then((r) => r.data),

  resetPin: (id: string, pin: string) =>
    api.post(`/api/admin/users/${id}/reset-pin`, { pin }).then((r) => r.data),

  hapusUser: (id: string) => api.delete(`/api/admin/users/${id}`).then((r) => r.data),
};

export function formatIDR(n: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency', currency: 'IDR',
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(Number(n) || 0);
}

export function formatBytes(bytes: number): string {
  const b = Number(bytes) || 0;
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(2)} MB`;
  return `${(b / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function formatTanggal(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}
