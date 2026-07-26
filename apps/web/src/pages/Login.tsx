import React, { useState } from 'react';
import { useNavigate, Link, Navigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthProvider';
import { Wallet, ArrowRight } from 'lucide-react';
import Signature from '../components/Signature';

export default function Login() {
  // Semua hook dipanggil tanpa syarat dulu, baru boleh ada early return di bawah.
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const { status } = useAuth();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return toast.error('Email dan Kata Sandi wajib diisi');
    
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      toast.success('Otentikasi Berhasil');
      navigate('/dashboard');
    } catch (error: any) {
      toast.error('Kredensial tidak valid atau akun belum terdaftar.');
    } finally {
      setIsLoading(false);
    }
  };

  // Sudah punya sesi? Jangan tampilkan form login lagi.
  if (status === 'ready' || status === 'locked') {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="min-h-screen flex items-center justify-center p-6 relative z-10">
      <motion.div initial={{ scale: 0.95, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: "easeOut" }} className="w-full max-w-md">
        {/* backdrop-blur-xl (24px), bukan 3xl (64px): blur setebal itu membuat
            objek 3D di latar hilang sama sekali di balik kartu. */}
        <div className="glass p-8 sm:p-10 rounded-4xl overflow-hidden relative">
          <div className="flex flex-col items-center mb-10 relative z-10">
            <motion.div 
              animate={{ rotate: 360 }} 
              transition={{ repeat: Infinity, duration: 20, ease: "linear" }}
              className="relative w-24 h-24 flex items-center justify-center mb-6"
            >
              <div className="absolute inset-0 bg-gradient-to-tr from-teal-400/20 to-purple-600/20 rounded-3xl blur-xl"></div>
              <div className="relative bg-white/10 backdrop-blur-md border border-white/20 p-4 rounded-3xl shadow-[0_0_30px_rgba(45,212,191,0.3)]">
                <Wallet className="text-teal-400 drop-shadow-[0_0_15px_rgba(45,212,191,1)]" size={40} strokeWidth={1.5}/>
              </div>
            </motion.div>
            <h2 className="text-3xl font-semibold text-white tracking-tight">DuitKita</h2>
            <p className="text-teal-300 text-xs mt-2 font-medium tracking-[0.2em] uppercase">Keuangan Pintar</p>
          </div>
          
          <form onSubmit={handleLogin} className="space-y-5 relative z-10">
            <div>
              <label className="text-white/70 text-[10px] font-bold uppercase tracking-widest ml-2 block mb-2">Alamat Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full bg-black/20 border border-white/10 rounded-2xl px-5 py-4 text-white placeholder-white/45 focus:outline-none focus:ring-1 focus:ring-teal-400/50 focus:bg-black/40 transition-all font-light" placeholder="nama@email.com" />
            </div>
            <div>
              <label className="text-white/70 text-[10px] font-bold uppercase tracking-widest ml-2 block mb-2">Kata Sandi</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full bg-black/20 border border-white/10 rounded-2xl px-5 py-4 text-white placeholder-white/45 focus:outline-none focus:ring-1 focus:ring-teal-400/50 focus:bg-black/40 transition-all font-light" placeholder="••••••••" />
            </div>
            
            <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} type="submit" disabled={isLoading} className="w-full bg-white text-black font-semibold rounded-2xl px-4 py-4 shadow-[0_0_20px_rgba(255,255,255,0.2)] flex justify-center items-center mt-8 transition-all hover:shadow-[0_0_30px_rgba(255,255,255,0.4)] disabled:opacity-50">
              {isLoading ? <div className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin"></div> : <><span className="mr-2">Masuk</span><ArrowRight size={18}/></>}
            </motion.button>
          </form>
          
          <div className="mt-8 text-center relative z-10">
            <Link className="text-white/65 hover:text-white transition-colors text-sm font-light" to="/register">Belum punya akun? <span className="text-teal-400 font-medium">Daftar sekarang</span></Link>
          </div>
          <Signature className="mt-6 relative z-10" />
        </div>
      </motion.div>
    </motion.div>
  );
}
