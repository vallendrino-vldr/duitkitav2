import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { LayoutDashboard, Users, Database, Menu, X, LogOut, ShieldCheck } from 'lucide-react';
import { useAuth } from '../lib/AuthProvider';

const navItems = [
  { to: '/admin', icon: LayoutDashboard, label: 'Ringkasan', end: true },
  { to: '/admin/users', icon: Users, label: 'Kelola Pengguna' },
  { to: '/admin/storage', icon: Database, label: 'Monitor Penyimpanan' },
];

export default function AdminSidebar() {
  const [isOpen, setIsOpen] = useState(false);
  const { profile, signOut } = useAuth();

  const Isi = () => (
    <div className="flex flex-col h-full p-6">
      <div className="flex items-center gap-3 mb-10">
        <div className="w-11 h-11 bg-gradient-to-br from-brand-400 to-accent-600 rounded-xl shadow-glow-brand flex items-center justify-center">
          <ShieldCheck size={22} className="text-white" />
        </div>
        <div className="min-w-0">
          <p className="text-base font-extrabold text-white leading-tight">DuitKita</p>
          <p className="text-micro font-semibold uppercase tracking-wider text-brand-300">Super Admin</p>
        </div>
      </div>

      <nav className="flex-1 space-y-2">
        {navItems.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.end} onClick={() => setIsOpen(false)}>
            {({ isActive }) => (
              <div
                className={`flex items-center gap-3 px-4 min-h-[48px] rounded-2xl transition-all duration-200 ${
                  isActive
                    ? 'bg-brand-400/15 text-brand-300 border border-brand-400/30'
                    : 'text-white/70 hover:bg-white/10 hover:text-white border border-transparent'
                }`}
              >
                <item.icon size={20} strokeWidth={isActive ? 2.5 : 2} />
                <span className="font-semibold text-sm">{item.label}</span>
              </div>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="mt-auto pt-6 border-t border-white/15">
        <p className="text-micro text-white/60 mb-1">Masuk sebagai</p>
        <p className="text-sm font-semibold text-white truncate mb-4">
          {profile?.display_name || profile?.username || 'Admin'}
        </p>
        <button onClick={() => void signOut()} className="btn-danger w-full">
          <LogOut size={18} />
          Keluar
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Bilah atas versi ponsel */}
      <div className="md:hidden fixed top-0 inset-x-0 h-16 px-4 z-40 flex justify-between items-center glass-strong border-b border-white/15">
        <div className="flex items-center gap-2">
          <ShieldCheck size={20} className="text-brand-300" />
          <span className="text-white font-bold">DuitKita Admin</span>
        </div>
        <button onClick={() => setIsOpen(true)} aria-label="Buka menu" className="icon-btn">
          <Menu size={24} />
        </button>
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setIsOpen(false)}
            className="md:hidden fixed inset-0 z-[60] bg-ink-950/70 backdrop-blur-sm"
          >
            <motion.div
              initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              onClick={(e) => e.stopPropagation()}
              className="w-4/5 max-w-xs h-full glass-strong border-r border-white/15 relative"
            >
              <button
                onClick={() => setIsOpen(false)}
                aria-label="Tutup menu"
                className="icon-btn absolute top-4 right-4 z-10"
              >
                <X size={22} />
              </button>
              <Isi />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Sidebar versi layar lebar */}
      <aside className="hidden md:block w-72 h-[100dvh] fixed top-0 left-0 glass border-r border-white/15 z-40">
        <Isi />
      </aside>
    </>
  );
}
