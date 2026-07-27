import { NavLink } from 'react-router-dom';
import {
  Home, CreditCard, Plus, PiggyBank, Settings, ShieldCheck, Wallet,
  ArrowLeftRight, Receipt, Wallet2, Repeat, BarChart3, SlidersHorizontal,
} from 'lucide-react';
import { useAuth } from '../lib/AuthProvider';

/**
 * Navigasi sisi kiri untuk layar lebar (md ke atas).
 *
 * Di ponsel yang dipakai tetap dock bawah — jempol lebih mudah menjangkau
 * bagian bawah layar, dan dock hanya muat lima tujuan. Di laptop ruangnya
 * lega, jadi SELURUH halaman ditampilkan sekaligus dan dikelompokkan supaya
 * daftar panjangnya tetap mudah dipindai.
 */
const KELOMPOK = [
  {
    judul: null,
    item: [
      { to: '/dashboard', icon: Home, label: 'Beranda' },
      { to: '/add', icon: Plus, label: 'Tambah Transaksi' },
      { to: '/transfer', icon: ArrowLeftRight, label: 'Transfer Dompet' },
    ],
  },
  {
    judul: 'Kelola',
    item: [
      { to: '/budget', icon: Wallet2, label: 'Anggaran' },
      { to: '/recurring', icon: Repeat, label: 'Transaksi Berulang' },
      { to: '/debts', icon: CreditCard, label: 'Hutang & Piutang' },
      { to: '/savings', icon: PiggyBank, label: 'Tabungan' },
    ],
  },
  {
    judul: 'Tinjau',
    item: [
      { to: '/reports', icon: BarChart3, label: 'Laporan & Statistik' },
      { to: '/receipts', icon: Receipt, label: 'Galeri Struk' },
    ],
  },
  {
    judul: 'Pengaturan',
    item: [
      { to: '/settings', icon: Settings, label: 'Akun & Keamanan' },
      { to: '/preferences', icon: SlidersHorizontal, label: 'Preferensi & Data' },
    ],
  },
];

export default function SideNav() {
  const { profile } = useAuth();

  return (
    <aside className="hidden md:flex flex-col w-64 lg:w-72 shrink-0 h-[100dvh] sticky top-0 glass border-r border-white/15">
      <div className="flex items-center gap-3 p-5 pb-4">
        <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-brand-400 to-accent-600 flex items-center justify-center shadow-glow-brand shrink-0">
          <Wallet size={22} className="text-white" />
        </div>
        <div className="min-w-0">
          <p className="font-extrabold leading-tight">DuitKita</p>
          <p className="text-micro font-semibold uppercase tracking-wider text-brand-300">
            Keuangan Pintar
          </p>
        </div>
      </div>

      {/* Daftarnya bisa lebih tinggi dari layar pendek, jadi bagian ini digulir
          sendiri sementara header dan footer tetap di tempat. */}
      <nav className="flex-1 overflow-y-auto thin-scrollbar px-4 pb-2 space-y-4">
        {KELOMPOK.map((k, i) => (
          <div key={k.judul ?? `grup-${i}`} className="space-y-1">
            {k.judul && (
              <p className="text-micro font-bold uppercase tracking-wider text-white/50 px-2 pt-2 pb-1">
                {k.judul}
              </p>
            )}
            {k.item.map((item) => (
              <NavLink key={item.to} to={item.to}>
                {({ isActive }) => (
                  <div
                    className={`flex items-center gap-3 px-3 min-h-[44px] rounded-xl border transition-all duration-200 ${
                      isActive
                        ? 'bg-brand-400/15 text-brand-300 border-brand-400/30'
                        : 'text-white/75 hover:bg-white/10 hover:text-white border-transparent'
                    }`}
                  >
                    <item.icon size={18} strokeWidth={isActive ? 2.5 : 2} className="shrink-0" />
                    <span className="font-semibold text-sm truncate">{item.label}</span>
                  </div>
                )}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      <div className="p-4 pt-3 border-t border-white/15 space-y-3">
        {profile?.role === 'admin' && (
          <NavLink
            to="/admin"
            className="flex items-center gap-3 px-3 min-h-[44px] rounded-xl text-accent-300 hover:bg-accent-500/15 transition-colors"
          >
            <ShieldCheck size={18} className="shrink-0" />
            <span className="font-semibold text-sm">Panel Admin</span>
          </NavLink>
        )}
        <div>
          <p className="text-micro text-white/60">Masuk sebagai</p>
          <p className="text-sm font-semibold truncate">
            {profile?.display_name || profile?.username || 'Pengguna'}
          </p>
        </div>
      </div>
    </aside>
  );
}
