import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { supabase } from '../lib/supabase';
import { Wallet, ArrowRight } from 'lucide-react';
import Signature from '../components/Signature';

export default function Register() {
  const [formData, setFormData] = useState({ fullName: '', username: '', email: '', password: '', confirmPassword: '', pin: '' });
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.fullName || !formData.username || !formData.email || !formData.password || !formData.pin) return toast.error('Semua kolom wajib diisi (termasuk PIN)');
    if (formData.password !== formData.confirmPassword) return toast.error('Kata sandi tidak cocok');
    if (formData.password.length < 6) return toast.error('Kata sandi minimal 6 karakter');
    if (formData.pin.length !== 6) return toast.error('PIN harus 6 digit');

    setIsLoading(true);
    try {
      // PIN ikut dikirim sebagai metadata. Trigger handle_new_user() yang meng-hash
      // (bcrypt) lalu MENGHAPUS versi mentahnya dari auth.users dalam transaksi yang
      // sama. Ini juga menghilangkan race lama: dulu PIN disimpan lewat getUser()
      // setelah signUp, sehingga bila konfirmasi email aktif (belum ada sesi) PIN
      // diam-diam tidak pernah tersimpan dan akun tertinggal di default '123456'.
      const { error } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          data: {
            display_name: formData.fullName,
            username: formData.username,
            role: 'user',
            security_pin: formData.pin,
          },
        },
      });
      if (error) throw error;

      await supabase.auth.signOut(); // Prevent auto-login limbo
      toast.success('Pendaftaran Berhasil! Silakan masuk.');
      navigate('/login');
    } catch (error: any) {
      toast.error(error.message || 'Gagal mendaftar. Pastikan email valid.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="min-h-screen flex items-center justify-center p-6 relative z-10 py-12">
      <motion.div initial={{ scale: 0.95, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: "easeOut" }} className="w-full max-w-md">
        <div className="glass p-8 sm:p-10 rounded-4xl relative">
          <div className="flex flex-col items-center mb-8">
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
            <h2 className="text-2xl font-semibold text-white tracking-tight">Buat Akun</h2>
          </div>
          
          <form onSubmit={handleRegister} className="space-y-4">
            <div>
              <label className="text-white/70 text-[10px] font-bold uppercase tracking-widest ml-2 block mb-1">Nama Lengkap</label>
              <input type="text" value={formData.fullName} onChange={(e) => setFormData({...formData, fullName: e.target.value})} className="w-full bg-black/20 border border-white/10 rounded-2xl px-5 py-3 text-white placeholder-white/45 focus:outline-none focus:ring-1 focus:ring-teal-400/50 transition-all font-light" placeholder="John Doe" />
            </div>
            <div>
              <label className="text-white/70 text-[10px] font-bold uppercase tracking-widest ml-2 block mb-1">Username</label>
              <input type="text" value={formData.username} onChange={(e) => setFormData({...formData, username: e.target.value})} className="w-full bg-black/20 border border-white/10 rounded-2xl px-5 py-3 text-white placeholder-white/45 focus:outline-none focus:ring-1 focus:ring-teal-400/50 transition-all font-light" placeholder="johndoe99" />
            </div>
            <div>
              <label className="text-white/70 text-[10px] font-bold uppercase tracking-widest ml-2 block mb-1">Alamat Email</label>
              <input type="email" value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})} className="w-full bg-black/20 border border-white/10 rounded-2xl px-5 py-3 text-white placeholder-white/45 focus:outline-none focus:ring-1 focus:ring-teal-400/50 transition-all font-light" placeholder="nama@email.com" />
            </div>
            <div>
              <label className="text-white/70 text-[10px] font-bold uppercase tracking-widest ml-2 block mb-1">Kata Sandi</label>
              <input type="password" value={formData.password} onChange={(e) => setFormData({...formData, password: e.target.value})} className="w-full bg-black/20 border border-white/10 rounded-2xl px-5 py-3 text-white placeholder-white/45 focus:outline-none focus:ring-1 focus:ring-teal-400/50 transition-all font-light" placeholder="Minimal 6 karakter" />
            </div>
            <div>
              <label className="text-white/70 text-[10px] font-bold uppercase tracking-widest ml-2 block mb-1">Konfirmasi Kata Sandi</label>
              <input type="password" value={formData.confirmPassword} onChange={(e) => setFormData({...formData, confirmPassword: e.target.value})} className="w-full bg-black/20 border border-white/10 rounded-2xl px-5 py-3 text-white placeholder-white/45 focus:outline-none focus:ring-1 focus:ring-teal-400/50 transition-all font-light" placeholder="Ulangi kata sandi" />
            </div>
            <div>
              <label className="text-white/70 text-[10px] font-bold uppercase tracking-widest ml-2 block mb-1">PIN Keamanan (6 Digit)</label>
              <input type="password" maxLength={6} inputMode="numeric" value={formData.pin} onChange={(e) => setFormData({...formData, pin: e.target.value.replace(/\D/g, '')})} className="w-full bg-black/20 border border-white/10 rounded-2xl px-5 py-3 text-white placeholder-white/45 focus:outline-none focus:ring-1 focus:ring-teal-400/50 transition-all font-light tracking-[0.5em] text-center" placeholder="••••••" />
            </div>
            
            <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} type="submit" disabled={isLoading} className="w-full bg-white text-black font-semibold rounded-2xl px-4 py-4 shadow-[0_0_20px_rgba(255,255,255,0.2)] flex justify-center items-center mt-6 transition-all">
              {isLoading ? <div className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin"></div> : <><span className="mr-2">Daftar</span><ArrowRight size={18}/></>}
            </motion.button>
          </form>
          
          <div className="mt-6 text-center">
            <Link className="text-white/65 hover:text-white transition-colors text-sm font-light" to="/login">Sudah punya akun? <span className="text-teal-400 font-medium">Masuk di sini</span></Link>
          </div>
          <Signature className="mt-5" />
        </div>
      </motion.div>
    </motion.div>
  );
}
