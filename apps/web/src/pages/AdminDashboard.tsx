import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Trash2, HardDrive, Users, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import axios from 'axios';
import { supabase } from '../lib/supabase';

export default function AdminDashboard() {
  const [users, setUsers] = useState<any[]>([]);
  const [storageMB, setStorageMB] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  const STORAGE_LIMIT_MB = 1024; // 1GB limit
  const isStorageWarning = storageMB > 800;

  useEffect(() => {
    fetchAdminData();
  }, []);

  const fetchAdminData = async () => {
    setIsLoading(true);
    try {
      // Fetch all users (Admin RLS allows this)
      const { data: usersData, error: usersError } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });
        
      if (usersError) throw usersError;
      if (usersData) setUsers(usersData);

      // Fetch storage
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:4000';
      const { data: storageData } = await axios.get(`${apiUrl}/api/admin/storage`);
      setStorageMB(storageData.totalMB || 0);

    } catch (error: any) {
      console.error(error);
      toast.error('Gagal mengambil data admin');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!window.confirm('Yakin ingin menghapus user ini? SEMUA DATA AKAN HILANG.')) return;

    const toastId = toast.loading('Menghapus user dan data...');
    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:4000';
      await axios.delete(`${apiUrl}/api/admin/users/${userId}`);
      
      toast.success('User berhasil dihapus (Cascade)', { id: toastId });
      setUsers(users.filter(u => u.id !== userId));
    } catch (error) {
      console.error(error);
      toast.error('Gagal menghapus user', { id: toastId });
    }
  };

  if (isLoading) {
    return (
      <div className="flex-1 min-h-screen flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  const storagePercentage = Math.min((storageMB / STORAGE_LIMIT_MB) * 100, 100);

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="p-8 max-w-6xl mx-auto space-y-8"
    >
      <div>
        <h1 className="text-4xl font-bold text-white mb-2 tracking-tight">God-Mode Panel</h1>
        <p className="text-white/60">Monitor sistem dan kelola pengguna.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Storage Monitor */}
        <div className="md:col-span-1 bg-white/5 backdrop-blur-xl border border-white/10 p-6 rounded-3xl shadow-2xl flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-center mb-6">
              <div className="bg-indigo-500/20 p-3 rounded-xl text-indigo-400">
                <HardDrive size={24} />
              </div>
              {isStorageWarning && (
                <div className="flex items-center gap-2 text-red-500 animate-pulse bg-red-500/10 px-3 py-1 rounded-full text-xs font-bold border border-red-500/30">
                  <AlertTriangle size={14} /> WARNING
                </div>
              )}
            </div>
            <h3 className="text-white/80 font-medium mb-1">Total Storage (Receipts)</h3>
            <p className="text-3xl font-bold text-white mb-6">
              {storageMB.toFixed(2)} <span className="text-lg text-white/50">MB</span>
            </p>
          </div>
          
          <div>
            <div className="flex justify-between text-xs text-white/50 mb-2">
              <span>{storagePercentage.toFixed(1)}% Terpakai</span>
              <span>Limit: 1 GB</span>
            </div>
            <div className={`w-full h-3 rounded-full overflow-hidden ${isStorageWarning ? 'bg-red-500/20 shadow-[0_0_15px_rgba(239,68,68,0.5)]' : 'bg-white/10'}`}>
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: `${storagePercentage}%` }}
                className={`h-full ${isStorageWarning ? 'bg-red-500 animate-pulse' : 'bg-gradient-to-r from-indigo-500 to-purple-500'}`}
              ></motion.div>
            </div>
          </div>
        </div>

        {/* Stats Card */}
        <div className="md:col-span-2 bg-gradient-to-br from-indigo-600/20 to-purple-600/20 backdrop-blur-xl border border-indigo-500/30 p-6 rounded-3xl shadow-2xl flex items-center justify-between">
           <div>
              <div className="flex items-center gap-3 mb-4">
                <Users className="text-indigo-400" size={28} />
                <h3 className="text-white font-bold text-xl">Total Pengguna</h3>
              </div>
              <p className="text-5xl font-black text-white">{users.length}</p>
           </div>
        </div>
      </div>

      {/* User Spy Grid */}
      <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl shadow-2xl overflow-hidden">
        <div className="p-6 border-b border-white/10">
          <h3 className="text-white font-bold text-xl">User Spy Grid</h3>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-black/20 text-white/60 text-sm">
                <th className="p-4 font-medium">Username</th>
                <th className="p-4 font-medium">Email</th>
                <th className="p-4 font-medium">Role</th>
                <th className="p-4 font-medium">Dibuat Pada</th>
                <th className="p-4 font-medium text-right">Aksi (Cascade)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {users.map(u => (
                <tr key={u.id} className="hover:bg-white/5 transition-colors">
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white font-bold text-xs">
                        {u.username.charAt(0).toUpperCase()}
                      </div>
                      <span className="text-white font-medium">{u.username}</span>
                    </div>
                  </td>
                  <td className="p-4 text-white/70 text-sm">{u.email}</td>
                  <td className="p-4">
                    <span className={`px-3 py-1 rounded-full text-xs font-medium border ${u.role === 'admin' ? 'bg-purple-500/20 text-purple-400 border-purple-500/30' : 'bg-white/10 text-white/70 border-white/20'}`}>
                      {u.role}
                    </span>
                  </td>
                  <td className="p-4 text-white/50 text-sm">{new Date(u.created_at).toLocaleDateString('id-ID')}</td>
                  <td className="p-4 text-right">
                    <button 
                      onClick={() => handleDeleteUser(u.id)}
                      disabled={u.role === 'admin'} // Protect admins
                      className="text-red-400 hover:text-red-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors bg-red-500/10 hover:bg-red-500/20 p-2 rounded-xl"
                      title={u.role === 'admin' ? "Tidak bisa menghapus admin" : "Hapus User & Semua Data"}
                    >
                      <Trash2 size={18} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </motion.div>
  );
}
