import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { supabase } from '../lib/supabase';
import { useFinanceStore } from '../store/useFinanceStore';
import toast from 'react-hot-toast';
import { ArrowUpRight, ArrowDownRight, RefreshCw } from 'lucide-react';

import AtmCard from '../components/AtmCard';
import CashflowChart from '../components/CashflowChart';
import AiRoastBox from '../components/AiRoastBox';

export default function Dashboard() {
  const { transactions, setWallets, setTransactions } = useFinanceStore();
  const [profile, setProfile] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();
      
      setProfile(profileData);

      const [walletsRes, transRes] = await Promise.all([
        supabase.from('wallets').select('*').eq('user_id', user.id),
        supabase.from('transactions').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(50)
      ]);

      if (walletsRes.data) setWallets(walletsRes.data);
      if (transRes.data) setTransactions(transRes.data);

    } catch (error: any) {
      console.error(error);
      toast.error('Gagal mengambil data');
    } finally {
      setIsLoading(false);
    }
  };

  const recentTransactions = transactions.slice(0, 5); // Take top 5

  const formatIDR = (num: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(num);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-teal-400 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="p-4 pt-10 space-y-6 max-w-lg mx-auto relative z-10"
    >
      {/* Header */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-gradient-to-tr from-teal-400 to-purple-500 rounded-full shadow-[0_0_15px_rgba(45,212,191,0.5)] flex items-center justify-center text-white font-bold text-lg">
            {profile?.display_name?.charAt(0)?.toUpperCase() || 'U'}
          </div>
          <div>
            <p className="text-white/60 text-sm font-medium">Halo,</p>
            <h1 className="text-white font-bold text-lg">{profile?.display_name || 'Pengguna'}</h1>
          </div>
        </div>
        <button className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center text-white/70 backdrop-blur-md border border-white/20 shadow-lg">
          {/* Using refresh icon as a placeholder for settings/lock */}
          <RefreshCw size={20} />
        </button>
      </div>

      {/* 1. ATM Card */}
      <AtmCard />

      {/* 2. AI Roast */}
      <AiRoastBox />

      {/* 3. Cashflow Chart */}
      <CashflowChart />

      {/* 4. Recent Transactions */}
      <div className="bg-white/5 backdrop-blur-lg border border-white/10 rounded-3xl p-5 shadow-xl pb-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-white font-bold text-lg">Transaksi Terakhir</h3>
          <button className="text-teal-400 text-sm font-medium">Lihat Semua</button>
        </div>
        
        <div className="space-y-4">
          {recentTransactions.length > 0 ? (
            recentTransactions.map(trx => (
              <div key={trx.id} className="flex justify-between items-center p-3 bg-white/5 rounded-2xl border border-white/5">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                    trx.type === 'income' ? 'bg-teal-500/20 text-teal-400' : 
                    trx.type === 'expense' ? 'bg-red-500/20 text-red-400' : 
                    'bg-blue-500/20 text-blue-400'
                  }`}>
                    {trx.type === 'income' ? <ArrowDownRight size={20} /> : 
                     trx.type === 'expense' ? <ArrowUpRight size={20} /> : 
                     <RefreshCw size={20} />}
                  </div>
                  <div>
                    <p className="text-white font-medium">{trx.title}</p>
                    <p className="text-white/50 text-xs">{trx.category || trx.type}</p>
                  </div>
                </div>
                <p className={`font-bold ${
                  trx.type === 'income' ? 'text-teal-400' : 
                  trx.type === 'expense' ? 'text-red-400' : 'text-blue-400'
                }`}>
                  {trx.type === 'income' ? '+' : trx.type === 'expense' ? '-' : ''}
                  {formatIDR(trx.amount)}
                </p>
              </div>
            ))
          ) : (
            <p className="text-center text-white/50 text-sm py-4">Belum ada transaksi</p>
          )}
        </div>
      </div>
      
      {/* Spacer for bottom nav */}
      <div className="h-6"></div>
    </motion.div>
  );
}
