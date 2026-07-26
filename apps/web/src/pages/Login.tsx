import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { supabase } from '../lib/supabase'; // assume this exists for now
import axios from 'axios'; // for api call

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!username || !password) {
      toast.error('Username dan Password harus diisi');
      return;
    }

    setIsLoading(true);

    try {
      // Admin Bypass
      if (username === 'admin' && password === '123456') {
        const { error } = await supabase.auth.signInWithPassword({
          email: 'admin@duitkita.com', // Using the seeded admin email
          password: '123456',
        });
        if (error) throw error;
        toast.success('Welcome Super Admin');
        navigate('/admin');
        return;
      }

      // Step A: Intercept and lookup email
      // Assuming API runs on localhost:4000 for now, or relative path
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:4000';
      const { data } = await axios.post(`${apiUrl}/api/auth/lookup`, { username });
      
      const email = data.email;

      // Step C: SignIn with Email
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      toast.success('Berhasil Masuk!');
      navigate('/dashboard');

    } catch (error: any) {
      console.error(error);
      toast.error(error.response?.data?.error || error.message || 'Gagal masuk');
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
        {/* Placeholder for Logo */}
        <div className="w-16 h-16 bg-gradient-to-tr from-purple-500 to-teal-400 rounded-full mb-4 shadow-[0_0_15px_rgba(126,34,206,0.5)] flex items-center justify-center text-2xl font-bold">
          DK
        </div>
        <h2 className="text-2xl font-bold text-white mb-8 text-center tracking-wide">Masuk Duit Kita</h2>
        
        <form onSubmit={handleLogin} className="w-full space-y-4">
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
            {isLoading ? 'MEMPROSES...' : '==== MASUK SEKARANG ===='}
          </motion.button>
        </form>
        
        <div className="mt-6">
          <Link to="/register" className="text-white/70 hover:text-white transition-colors text-sm">
            Belum punya akun? Daftar di sini
          </Link>
        </div>
      </div>
    </motion.div>
  );
}
