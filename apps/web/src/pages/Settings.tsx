import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
  User, Wallet, Tags, Shield, LogOut, ChevronRight, X, Plus, Trash2, Save, Download,
  ArrowLeftRight, Wallet2, Repeat, BarChart3, Receipt, SlidersHorizontal,
  Settings as SettingsIcon,
} from 'lucide-react';
import { usePWAInstall } from '../lib/usePWAInstall';
import { supabase } from '../lib/supabase';
import { useFinanceStore } from '../store/useFinanceStore';
import { useAuth } from '../lib/AuthProvider';
import { safeMutate, safeMutateOne, pesanError, PROFILE_COLUMNS } from '../lib/db';
import Signature from '../components/Signature';
import toast from 'react-hot-toast';

export default function Settings() {
  const { wallets, setWallets, clearStore } = useFinanceStore();
  const { signOut } = useAuth();
  const { status: statusPasang, pasang: pasangAplikasi } = usePWAInstall();
  const [profile, setProfile] = useState<any>(null);
  const [activeModal, setActiveModal] = useState<string | null>(null);

  // Forms State
  const [displayName, setDisplayName] = useState('');
  const [newWalletName, setNewWalletName] = useState('');
  const [categories, setCategories] = useState<string[]>([]);
  const [newCategory, setNewCategory] = useState('');
  const [pinLama, setPinLama] = useState('');
  const [pinBaru, setPinBaru] = useState('');

  useEffect(() => {
    fetchProfile();
    const savedCategories = localStorage.getItem('duitkita_categories');
    if (savedCategories) {
      setCategories(JSON.parse(savedCategories));
    }
  }, []);

  const fetchProfile = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      // PROFILE_COLUMNS, bukan '*': kolom security_pin sudah dicabut dari klien,
      // sehingga select('*') ditolak dengan "permission denied for table profiles".
      const rows = await safeMutate<any[]>(
        supabase.from('profiles').select(PROFILE_COLUMNS).eq('id', user.id).limit(1),
        'Gagal memuat profil',
      );
      const data = rows?.[0];
      if (data) {
        setProfile(data);
        setDisplayName(data.display_name || '');
      }
    } catch (error) {
      toast.error(pesanError(error, 'Gagal memuat profil'));
    }
  };

  const handleLogout = async () => {
    try {
      clearStore();
      localStorage.removeItem('duitkita-finance-storage');
      // signOut() milik AuthProvider yang membersihkan status buka-kunci dan
      // memicu perpindahan rute. Tidak perlu window.location.href lagi —
      // reload paksa itu dulu dipakai untuk menutupi state yang tidak ikut bersih.
      await signOut();
    } catch (error) {
      toast.error('Gagal keluar');
    }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    const toastId = toast.loading('Menyimpan profil...');
    try {
      if (!profile?.id) throw new Error('Profile ID is missing');
      await safeMutate(
        supabase.from('profiles').update({ display_name: displayName }).eq('id', profile.id),
        'Gagal menyimpan profil',
      );
      setProfile({ ...profile, display_name: displayName });
      toast.success('Profil berhasil diperbarui', { id: toastId });
      setActiveModal(null);
    } catch (error) {
      toast.error(pesanError(error, 'Gagal menyimpan'), { id: toastId });
    }
  };

  const handleAddWallet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWalletName) return;
    const toastId = toast.loading('Menambah dompet...');
    try {
      if (!profile?.id) throw new Error('Profile ID is missing');
      // safeMutateOne menolak hasil kosong. Pola lama `data[0]` memasukkan
      // `undefined` ke daftar dompet ketika RLS memblokir baris yang dikembalikan.
      const dompetBaru = await safeMutateOne<any>(
        supabase
          .from('wallets')
          .insert({ user_id: profile.id, name: newWalletName, balance: 0, initial_balance: 0 })
          .select(),
        'Gagal menambah dompet',
      );
      setWallets([...(wallets || []), dompetBaru]);
      setNewWalletName('');
      toast.success('Dompet ditambahkan', { id: toastId });
    } catch (error) {
      toast.error(pesanError(error, 'Gagal menambah dompet'), { id: toastId });
    }
  };

  const handleDeleteWallet = async (id: string) => {
    if (!window.confirm('Yakin ingin menghapus dompet ini? Transaksi di dalamnya akan ikut terhapus.')) return;
    const toastId = toast.loading('Menghapus dompet...');
    try {
      await safeMutate(
        supabase.from('wallets').delete().eq('id', id),
        'Gagal menghapus dompet',
      );
      setWallets((wallets || []).filter(w => w.id !== id));
      toast.success('Dompet dihapus', { id: toastId });
    } catch (error) {
      toast.error(pesanError(error, 'Gagal menghapus dompet'), { id: toastId });
    }
  };

  const handleAddCategory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCategory) return;
    const updated = [...categories, newCategory];
    setCategories(updated);
    localStorage.setItem('duitkita_categories', JSON.stringify(updated));
    setNewCategory('');
    toast.success('Kategori ditambahkan');
  };

  const handleDeleteCategory = (cat: string) => {
    const updated = categories.filter(c => c !== cat);
    setCategories(updated);
    localStorage.setItem('duitkita_categories', JSON.stringify(updated));
  };

  const handleUpdatePIN = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pinLama.length !== 6 || pinBaru.length !== 6) {
      toast.error('PIN harus 6 digit');
      return;
    }
    const toastId = toast.loading('Memverifikasi...');
    try {
      // Seluruh proses terjadi di database. PIN lama diverifikasi dan PIN baru
      // di-hash server-side; browser tidak pernah menerima hash apa pun.
      const { data, error } = await supabase.rpc('change_pin', {
        p_old_pin: pinLama,
        p_new_pin: pinBaru,
      });
      if (error) throw error;

      if (data !== true) {
        toast.error('PIN Lama salah!', { id: toastId });
        return;
      }

      toast.success('PIN berhasil diperbarui', { id: toastId });
      setPinLama('');
      setPinBaru('');
      setActiveModal(null);
    } catch (error) {
      toast.error(pesanError(error, 'Gagal memperbarui PIN'), { id: toastId });
    }
  };

  const fiturLain = [
    { to: '/transfer', icon: ArrowLeftRight, label: 'Transfer Dompet', warna: 'bg-brand-400/15 text-brand-300' },
    { to: '/budget', icon: Wallet2, label: 'Anggaran Bulanan', warna: 'bg-warn-400/15 text-warn-400' },
    { to: '/recurring', icon: Repeat, label: 'Transaksi Berulang', warna: 'bg-accent-500/15 text-accent-300' },
    { to: '/reports', icon: BarChart3, label: 'Laporan & Statistik', warna: 'bg-ok-400/15 text-ok-400' },
    { to: '/receipts', icon: Receipt, label: 'Galeri Struk', warna: 'bg-brand-400/15 text-brand-300' },
    { to: '/preferences', icon: SlidersHorizontal, label: 'Preferensi & Data', warna: 'bg-accent-500/15 text-accent-300' },
  ];

  const menuItems = [
    { id: 'profil', icon: User, title: 'Profil Saya', desc: 'Atur nama, email, dan foto profil' },
    { id: 'wallet', icon: Wallet, title: 'Manajemen Dompet', desc: 'Tambah, edit, atau hapus dompet' },
    { id: 'kategori', icon: Tags, title: 'Kategori Transaksi', desc: 'Kelola kategori khusus' },
    { id: 'keamanan', icon: Shield, title: 'Keamanan', desc: 'Ubah PIN atau kata sandi' },
  ];

  const renderModalContent = () => {
    switch (activeModal) {
      case 'profil':
        return (
          <form onSubmit={handleUpdateProfile} className="space-y-4">
            <div>
              <label className="text-white/60 text-xs font-medium ml-1 mb-1 block">Nama Tampilan</label>
              <input 
                type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-teal-400"
              />
            </div>
            <div>
              <label className="text-white/60 text-xs font-medium ml-1 mb-1 block">Username</label>
              <input 
                type="text" value={profile?.username || ''} disabled
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white/70 cursor-not-allowed"
              />
            </div>
            <button type="submit" className="w-full bg-teal-500 text-white font-bold rounded-xl py-3 shadow-[0_0_15px_rgba(20,184,166,0.4)] mt-2 flex items-center justify-center gap-2">
              <Save size={18} /> Simpan Profil
            </button>
          </form>
        );
      case 'wallet':
        return (
          <div className="space-y-4">
            <form onSubmit={handleAddWallet} className="flex gap-2">
              <input 
                type="text" placeholder="Nama Dompet Baru" value={newWalletName} onChange={(e) => setNewWalletName(e.target.value)}
                className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-teal-400"
              />
              <button type="submit" className="bg-teal-500 text-white p-3 rounded-xl shadow-lg"><Plus size={20} /></button>
            </form>
            <div className="max-h-64 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
              {(wallets || []).map(w => (
                <div key={w.id} className="flex justify-between items-center bg-white/5 p-3 rounded-xl border border-white/10">
                  <div>
                    <p className="text-white font-medium">{w.name}</p>
                    <p className="text-white/70 text-xs">Rp {Number(w.balance).toLocaleString('id-ID')}</p>
                  </div>
                  <button onClick={() => handleDeleteWallet(w.id)} className="text-red-400 p-2 hover:bg-red-400/20 rounded-lg transition-colors">
                    <Trash2 size={18} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        );
      case 'kategori':
        return (
          <div className="space-y-4">
            <form onSubmit={handleAddCategory} className="flex gap-2">
              <input 
                type="text" placeholder="Kategori Baru" value={newCategory} onChange={(e) => setNewCategory(e.target.value)}
                className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-purple-400"
              />
              <button type="submit" className="bg-purple-500 text-white p-3 rounded-xl shadow-lg"><Plus size={20} /></button>
            </form>
            <div className="flex flex-wrap gap-2">
              {categories.map(c => (
                <div key={c} className="bg-white/10 text-white px-3 py-1.5 rounded-full flex items-center gap-2 text-sm">
                  {c}
                  <button onClick={() => handleDeleteCategory(c)} className="text-white/70 hover:text-red-400"><X size={14}/></button>
                </div>
              ))}
              {categories.length === 0 && <p className="text-white/65 text-sm text-center w-full py-4">Belum ada kategori kustom.</p>}
            </div>
          </div>
        );
      case 'keamanan':
        return (
          <form onSubmit={handleUpdatePIN} className="space-y-4">
            <div>
              <label className="text-white/60 text-xs font-medium ml-1 mb-1 block">PIN Lama (6 Digit)</label>
              <input 
                type="password" maxLength={6} inputMode="numeric" value={pinLama} onChange={(e) => setPinLama(e.target.value.replace(/\D/g, ''))}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-teal-400 tracking-[0.5em] text-center"
              />
            </div>
            <div>
              <label className="text-white/60 text-xs font-medium ml-1 mb-1 block">PIN Baru (6 Digit)</label>
              <input 
                type="password" maxLength={6} inputMode="numeric" value={pinBaru} onChange={(e) => setPinBaru(e.target.value.replace(/\D/g, ''))}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-teal-400 tracking-[0.5em] text-center"
              />
            </div>
            <button type="submit" className="w-full bg-teal-500 text-white font-bold rounded-xl py-3 shadow-[0_0_15px_rgba(20,184,166,0.4)] mt-2 flex items-center justify-center gap-2">
              <Shield size={18} /> Update PIN
            </button>
          </form>
        );
      default:
        return null;
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
      className="page pb-24 relative z-10"
    >
      <div className="flex flex-col items-center mb-8">
        <motion.div 
          animate={{ y: [0, -10, 0], scale: [1, 1.05, 1] }}
          transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
          className="text-purple-400 mb-2 drop-shadow-[0_0_15px_rgba(168,85,247,0.5)]"
        >
          <SettingsIcon size={64} />
        </motion.div>
        <h2 className="text-2xl font-bold text-white text-center tracking-tight">Pengaturan</h2>
      </div>

      {/* Pintu masuk fitur di ponsel. Dock bawah hanya muat lima tujuan,
          sedangkan aplikasi punya sebelas halaman — sisanya dikumpulkan di sini
          supaya tetap terjangkau tanpa menjejali dock. Di layar lebar semuanya
          sudah tampil di sidebar, jadi bagian ini disembunyikan. */}
      <div className="md:hidden mb-8">
        <h3 className="label mb-3">Fitur</h3>
        <div className="grid grid-cols-2 gap-3">
          {fiturLain.map((f) => (
            <Link
              key={f.to}
              to={f.to}
              className="glass rounded-2xl p-4 flex flex-col gap-2 min-h-[96px] active:scale-[0.97] transition-transform"
            >
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${f.warna}`}>
                <f.icon size={18} />
              </div>
              <span className="text-sm font-semibold leading-tight">{f.label}</span>
            </Link>
          ))}
        </div>
      </div>

      <div className="space-y-4 mb-8">
        {menuItems.map((item) => (
          <motion.button
            key={item.id}
            onClick={() => setActiveModal(item.id)}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="w-full bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-4 flex items-center justify-between shadow-xl"
          >
            <div className="flex items-center gap-4">
              <div className="bg-teal-500/20 text-teal-400 p-3 rounded-xl shadow-[0_0_15px_rgba(45,212,191,0.2)]">
                <item.icon size={20} />
              </div>
              <div className="text-left">
                <h3 className="text-white font-semibold text-sm">{item.title}</h3>
                <p className="text-white/70 text-[10px] font-light mt-0.5">{item.desc}</p>
              </div>
            </div>
            <ChevronRight className="text-white/60" size={20} />
          </motion.button>
        ))}
      </div>

      {/* Tombol pasang PERMANEN. Kartu mengambang bisa ditutup pengguna dan
          browser tidak selalu menawarkan pemasangan otomatis, jadi harus ada
          satu tempat tetap yang selalu bisa dituju. */}
      <div className="glass rounded-2xl p-4 mb-4">
        <div className="flex items-center gap-4">
          <div className="bg-accent-500/20 text-accent-300 p-3 rounded-xl shrink-0">
            <Download size={20} />
          </div>
          <div className="text-left min-w-0 flex-1">
            <h3 className="text-white font-semibold text-sm">Pasang Aplikasi</h3>
            <p className="text-white/70 text-micro mt-0.5">
              {statusPasang === 'terpasang'
                ? 'Sudah terpasang di perangkat ini.'
                : statusPasang === 'manual-ios'
                  ? 'Ketuk ikon Bagikan di Safari, lalu "Tambahkan ke Layar Utama".'
                  : statusPasang === 'siap'
                    ? 'Buka langsung dari layar utama seperti aplikasi biasa.'
                    : 'Belum tersedia di browser ini. Coba Chrome/Edge, atau buka lewat alamat aslinya.'}
            </p>
          </div>
          {statusPasang === 'siap' && (
            <button onClick={() => void pasangAplikasi()} className="btn-primary shrink-0 text-sm px-4">
              Pasang
            </button>
          )}
        </div>
      </div>

      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={handleLogout}
        className="w-full bg-red-500/10 border border-red-500/30 text-red-400 font-bold rounded-2xl px-4 py-4 flex justify-center items-center gap-2 shadow-[0_0_20px_rgba(239,68,68,0.2)] hover:bg-red-500/20 transition-all"
      >
        <LogOut size={18} />
        KELUAR / LOGOUT
      </motion.button>

      {/* Modal Container */}
      <AnimatePresence>
        {activeModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setActiveModal(null)}
              className="absolute inset-0 bg-[#0F172A]/80 backdrop-blur-md"
            ></motion.div>
            
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-[#1e293b] border border-white/10 p-6 rounded-3xl w-full max-w-sm relative z-10 shadow-2xl"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-white font-bold text-lg capitalize">{activeModal}</h3>
                <button onClick={() => setActiveModal(null)} className="text-white/70 hover:text-white bg-white/5 p-2 rounded-full">
                  <X size={20} />
                </button>
              </div>
              {renderModalContent()}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      
      <div className="mt-10 pt-6 border-t border-white/10">
        <Signature />
        <p className="text-center text-white/50 text-micro mt-1">DuitKita v2 · Aplikasi Web (PWA)</p>
      </div>
    </motion.div>
  );
}
