import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { supabase } from '../lib/supabase';

export default function Register() {
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!fullName || !username || !email || !password) {
      toast.error('Semua kolom harus diisi');
      return;
    }

    setIsLoading(true);

    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            display_name: fullName,
            username: username,
          }
        }
      });

      if (error) throw error;

      // Force sign out to prevent auto-login limbo
      await supabase.auth.signOut();

      toast.success('Akun berhasil dibuat! Silakan masuk.');
      navigate('/login');

    } catch (error: any) {
      console.error(error);
      toast.error(error.message || 'Gagal mendaftar');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="min-h-screen flex items-center justify-center p-4 relative z-10"
    >
      <div className="bg-white/10 backdrop-blur-lg border border-white/20 p-8 rounded-2xl shadow-2xl w-full max-w-md flex flex-col items-center">
        <h2 className="text-2xl font-bold text-white mb-8 text-center tracking-wide">Daftar Akun DuitKita</h2>
        
        <form onSubmit={handleRegister} className="w-full space-y-4">
          <div>
            <input 
              type="text" 
              placeholder="Nama Lengkap" 
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-teal-400 transition-all"
            />
          </div>
          <div>
            <input 
              type="text" 
              placeholder="Username" 
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-teal-400 transition-all"
            />
          </div>
          <div>
            <input 
              type="email" 
              placeholder="Email" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-teal-400 transition-all"
            />
          </div>
          <div>
            <input 
              type="password" 
              placeholder="Password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-teal-400 transition-all"
            />
          </div>
          
          <motion.button 
            whileTap={{ scale: 0.95 }}
            type="submit"
            disabled={isLoading}
            className="w-full bg-gradient-to-r from-teal-400 to-purple-500 text-white font-bold rounded-xl px-4 py-3 shadow-lg flex justify-center items-center mt-6 disabled:opacity-50"
          >
            {isLoading ? 'MEMPROSES...' : '==== BUAT AKUN SEKARANG ===='}
          </motion.button>
        </form>
        
        <div className="mt-6">
          <Link to="/login" className="text-white/70 hover:text-white transition-colors text-sm">
            Sudah punya akun? Masuk di sini
          </Link>
        </div>
      </div>
    </motion.div>
  );
}
