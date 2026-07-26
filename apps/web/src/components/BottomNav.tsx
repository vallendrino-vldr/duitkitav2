import { NavLink } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Home, CreditCard, Plus, PiggyBank, Settings } from 'lucide-react';

/**
 * Tingkatan lapisan (z-index) aplikasi — dipatuhi semua komponen:
 *   z-40  navbar bawah  <- di sini
 *   z-60  lembar/modal
 *   z-70  overlay layar penuh (kamera, mikrofon)
 *   z-80  layar kunci PIN
 * Dulu navbar dan overlay kamera sama-sama z-50, dan karena navbar digambar
 * paling akhir, dialah yang menang — tombol rana jadi tertimbun di bawahnya.
 */
const navItems = [
  { to: '/dashboard', icon: Home, label: 'Beranda' },
  { to: '/debts', icon: CreditCard, label: 'Hutang' },
  { to: '/add', icon: Plus, label: 'Tambah', isFab: true },
  { to: '/savings', icon: PiggyBank, label: 'Nabung' },
  { to: '/settings', icon: Settings, label: 'Atur' },
];

export default function BottomNav() {
  return (
    <nav
      aria-label="Navigasi utama"
      className="absolute bottom-0 left-0 right-0 z-40 px-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] pointer-events-none"
    >
      <div className="glass rounded-4xl flex justify-between items-center px-2 py-1.5 pointer-events-auto">
        {navItems.map((item) => {
          const Icon = item.icon;

          if (item.isFab) {
            return (
              <NavLink key={item.to} to={item.to} aria-label={item.label} className="relative -top-6 shrink-0">
                {({ isActive }) => (
                  <motion.div
                    whileTap={{ scale: 0.92 }}
                    transition={{ duration: 0.15 }}
                    className={`w-16 h-16 rounded-full flex items-center justify-center text-white border-4 border-ink-950/40 ${
                      isActive
                        ? 'bg-gradient-to-br from-brand-400 to-brand-600 shadow-glow-brand'
                        : 'bg-gradient-to-br from-accent-500 to-accent-700 shadow-glow-accent'
                    }`}
                  >
                    <Icon size={30} strokeWidth={2.5} />
                  </motion.div>
                )}
              </NavLink>
            );
          }

          return (
            <NavLink key={item.to} to={item.to} className="flex-1 flex justify-center min-h-[44px]">
              {({ isActive }) => (
                <div className="relative flex flex-col items-center justify-center w-full py-2 gap-0.5">
                  {isActive && (
                    <motion.div
                      layoutId="active-pill"
                      className="absolute inset-0 bg-white/15 rounded-2xl"
                      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                    />
                  )}
                  <Icon
                    size={22}
                    strokeWidth={isActive ? 2.5 : 2}
                    className={`relative z-10 transition-colors duration-200 ${
                      isActive ? 'text-brand-300' : 'text-white/70'
                    }`}
                  />
                  {/* text-white/70, bukan /50: kontras lebih aman di atas latar bergerak. */}
                  <span
                    className={`relative z-10 text-[11px] font-semibold transition-colors duration-200 ${
                      isActive ? 'text-brand-300' : 'text-white/70'
                    }`}
                  >
                    {item.label}
                  </span>
                </div>
              )}
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
