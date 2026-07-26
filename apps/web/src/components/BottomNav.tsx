import React from 'react';
import { NavLink } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Home, CreditCard, Plus, PiggyBank, Settings } from 'lucide-react';

export default function BottomNav() {
  const navItems = [
    { to: '/dashboard', icon: Home, label: 'Home' },
    { to: '/debts', icon: CreditCard, label: 'Debts' },
    { to: '/add', icon: Plus, label: 'Add', isFab: true },
    { to: '/savings', icon: PiggyBank, label: 'Savings' },
    { to: '/settings', icon: Settings, label: 'Settings' },
  ];

  return (
    <div className="fixed bottom-0 w-full z-50 px-4 pb-6 pt-2 pointer-events-none">
      <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-3xl shadow-2xl flex justify-between items-center px-2 py-2 pointer-events-auto">
        {navItems.map((item) => {
          const Icon = item.icon;

          if (item.isFab) {
            return (
              <NavLink key={item.to} to={item.to} className="relative -top-6">
                {({ isActive }) => (
                  <motion.div
                    whileTap={{ scale: 0.9 }}
                    animate={{
                      boxShadow: isActive
                        ? ['0px 0px 15px rgba(13,148,136,0.8)', '0px 0px 25px rgba(13,148,136,1)', '0px 0px 15px rgba(13,148,136,0.8)']
                        : ['0px 0px 10px rgba(126,34,206,0.5)', '0px 0px 20px rgba(126,34,206,0.8)', '0px 0px 10px rgba(126,34,206,0.5)'],
                    }}
                    transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                    className={`w-16 h-16 rounded-full flex items-center justify-center text-white shadow-xl ${
                      isActive
                        ? 'bg-gradient-to-r from-teal-400 to-teal-500'
                        : 'bg-gradient-to-tr from-purple-500 to-purple-600'
                    }`}
                  >
                    <Icon size={32} />
                  </motion.div>
                )}
              </NavLink>
            );
          }

          return (
            <NavLink key={item.to} to={item.to} className="flex-1 flex justify-center">
              {({ isActive }) => (
                <motion.div
                  animate={isActive ? { y: [-2, 2, -2] } : { y: 0 }}
                  transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                  className="flex flex-col items-center justify-center py-2"
                >
                  <Icon
                    size={24}
                    className={`transition-colors ${isActive ? 'text-teal-400 drop-shadow-[0_0_5px_rgba(13,148,136,0.8)]' : 'text-white/50'}`}
                  />
                  <span className={`text-[10px] mt-1 font-medium transition-colors ${isActive ? 'text-teal-400' : 'text-white/50'}`}>
                    {item.label}
                  </span>
                </motion.div>
              )}
            </NavLink>
          );
        })}
      </div>
    </div>
  );
}
