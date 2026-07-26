import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { LayoutDashboard, Users, Database, Menu, X, LogOut } from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function AdminSidebar() {
  const [isOpen, setIsOpen] = useState(false);

  const navItems = [
    { to: '/admin', icon: LayoutDashboard, label: 'God-Mode Dashboard' },
    { to: '/admin/users', icon: Users, label: 'User Management' },
    { to: '/admin/storage', icon: Database, label: 'Storage Monitor' },
  ];

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/login';
  };

  const SidebarContent = () => (
    <div className="flex flex-col h-full p-6">
      <div className="flex items-center gap-3 mb-12">
        <div className="w-10 h-10 bg-gradient-to-tr from-red-500 to-orange-500 rounded-lg shadow-[0_0_15px_rgba(239,68,68,0.5)] flex items-center justify-center text-xl font-black text-white">
          DK
        </div>
        <span className="text-xl font-bold text-white tracking-widest uppercase">Admin</span>
      </div>

      <nav className="flex-1 space-y-4">
        {navItems.map((item) => (
          <NavLink key={item.to} to={item.to} onClick={() => setIsOpen(false)}>
            {({ isActive }) => (
              <div className={`flex items-center gap-4 px-4 py-3 rounded-xl transition-all ${
                isActive 
                  ? 'bg-white/10 text-orange-400 border border-white/20 shadow-[0_0_15px_rgba(249,115,22,0.3)]' 
                  : 'text-white/60 hover:bg-white/5 hover:text-white'
              }`}>
                <item.icon size={20} />
                <span className="font-medium">{item.label}</span>
              </div>
            )}
          </NavLink>
        ))}
      </nav>

      <button onClick={handleLogout} className="flex items-center gap-4 px-4 py-3 text-red-400 hover:bg-white/5 rounded-xl transition-all mt-auto w-full">
        <LogOut size={20} />
        <span className="font-medium">Logout</span>
      </button>
    </div>
  );

  return (
    <>
      {/* Mobile Hamburger */}
      <div className="md:hidden fixed top-0 left-0 w-full p-4 z-40 flex justify-between items-center bg-[#0F172A]/80 backdrop-blur-md border-b border-white/10">
        <div className="text-white font-bold tracking-widest text-lg">DK ADMIN</div>
        <button onClick={() => setIsOpen(true)} className="text-white p-2">
          <Menu size={24} />
        </button>
      </div>

      {/* Mobile Drawer */}
      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="md:hidden fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="w-3/4 max-w-sm h-full bg-[#0F172A] border-r border-white/10 shadow-2xl relative"
            >
              <button onClick={() => setIsOpen(false)} className="absolute top-6 right-6 text-white/50 hover:text-white">
                <X size={24} />
              </button>
              <SidebarContent />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Desktop Sidebar */}
      <div className="hidden md:block w-72 h-screen fixed top-0 left-0 bg-white/5 backdrop-blur-3xl border-r border-white/10 z-40">
        <SidebarContent />
      </div>
    </>
  );
}
