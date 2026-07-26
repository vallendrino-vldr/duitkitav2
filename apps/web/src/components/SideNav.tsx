import { NavLink } from 'react-router-dom';
import { Home, CreditCard, Plus, PiggyBank, Settings, ShieldCheck, Wallet } from 'lucide-react';
import { useAuth } from '../lib/AuthProvider';

const items = [
  { to: '/dashboard', icon: Home, label: 'Beranda' },
  { to: '/add', icon: Plus, label: 'Tambah Transaksi' },
  { to: '/debts', icon: CreditCard, label: 'Hutang & Piutang' },
  { to: '/savings', icon: PiggyBank, label: 'Tabungan' },
  { to: '/settings', icon: Settings, label: 'Pengaturan' },
];

/**
 * Navigasi sisi kiri untuk layar lebar (md ke atas).
 *
 * Di ponsel yang dipakai tetap dock bawah — jempol lebih mudah menjangkau bagian
 * bawah layar. Di laptop, dock melayang di tengah layar lebar justru terasa
 * aneh dan menyisakan ruang kosong yang besar di kiri-kanan.
 */
export default function SideNav() {
  const { profile } = useAuth();

  return (
    <aside className="hidden md:flex flex-col w-64 lg:w-72 shrink-0 h-[100dvh] sticky top-0 glass border-r border-white/15 p-5">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-brand-400 to-accent-600 flex items-center justify-center shadow-glow-brand">
          <Wallet size={22} className="text-white" />
        </div>
        <div className="min-w-0">
          <p className="font-extrabold leading-tight">DuitKita</p>
          <p className="text-micro font-semibold uppercase tracking-wider text-brand-300">
            Keuangan Pintar
          </p>
        </div>
      </div>

      <nav className="flex-1 space-y-1.5">
        {items.map((item) => (
          <NavLink key={item.to} to={item.to}>
            {({ isActive }) => (
              <div
                className={`flex items-center gap-3 px-4 min-h-[48px] rounded-2xl border transition-all duration-200 ${
                  isActive
                    ? 'bg-brand-400/15 text-brand-300 border-brand-400/30'
                    : 'text-white/75 hover:bg-white/10 hover:text-white border-transparent'
                }`}
              >
                <item.icon size={20} strokeWidth={isActive ? 2.5 : 2} />
                <span className="font-semibold text-sm">{item.label}</span>
              </div>
            )}
          </NavLink>
        ))}
      </nav>

      {profile?.role === 'admin' && (
        <NavLink
          to="/admin"
          className="flex items-center gap-3 px-4 min-h-[48px] rounded-2xl text-accent-300 hover:bg-accent-500/15 transition-colors mb-3"
        >
          <ShieldCheck size={20} />
          <span className="font-semibold text-sm">Panel Admin</span>
        </NavLink>
      )}

      <div className="pt-4 border-t border-white/15">
        <p className="text-micro text-white/60">Masuk sebagai</p>
        <p className="text-sm font-semibold truncate">
          {profile?.display_name || profile?.username || 'Pengguna'}
        </p>
      </div>
    </aside>
  );
}
