import { motion } from 'framer-motion';
import {
  Users, Wallet, ArrowLeftRight, HandCoins, Target,
  TrendingUp, TrendingDown, HardDrive, RefreshCw, AlertTriangle,
} from 'lucide-react';
import { adminApi, formatIDR, formatBytes, type StatsAdmin, type StorageAdmin } from '../lib/adminApi';
import { useLiveData } from '../lib/useLiveData';
import LiveBadge from '../components/admin/LiveBadge';
import StatCard from '../components/admin/StatCard';

export default function AdminDashboard() {
  const stats = useLiveData<StatsAdmin>(adminApi.stats, {
    tables: ['profiles', 'transactions', 'wallets'],
    channel: 'admin-stats',
    intervalMs: 60_000,
  });

  const storage = useLiveData<StorageAdmin>(adminApi.storage, {
    // Ukuran berkas hidup di Storage, bukan di tabel database — tidak ada event
    // realtime untuk itu, jadi satu-satunya cara tetap segar adalah polling.
    intervalMs: 20_000,
    channel: 'admin-storage-ringkas',
  });

  const s = stats.data;
  const st = storage.data;
  const bersih = (s?.totalMasuk ?? 0) - (s?.totalKeluar ?? 0);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">Ringkasan Sistem</h1>
          <p className="text-white/70 text-sm mt-1">Pantauan seluruh aplikasi DuitKita secara langsung.</p>
        </div>
        <div className="flex items-center gap-3">
          <LiveBadge lastUpdated={stats.lastUpdated} />
          <button
            onClick={() => { void stats.refresh(); void storage.refresh(); }}
            className="btn-ghost"
            aria-label="Muat ulang data"
          >
            <RefreshCw size={18} className={stats.loading ? 'animate-spin' : ''} />
            Muat ulang
          </button>
        </div>
      </header>

      {stats.error && (
        <div className="glass rounded-2xl p-4 flex items-center gap-3 border-danger-500/40">
          <AlertTriangle size={20} className="text-danger-400 shrink-0" />
          <p className="text-sm text-danger-400">{stats.error}</p>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard icon={Users} label="Pengguna" value={s?.pengguna} loading={stats.loading} tone="brand" />
        <StatCard icon={Wallet} label="Dompet" value={s?.dompet} loading={stats.loading} tone="accent" />
        <StatCard icon={ArrowLeftRight} label="Transaksi" value={s?.transaksi} loading={stats.loading} tone="brand" />
        <StatCard icon={HandCoins} label="Hutang/Piutang" value={s?.hutang} loading={stats.loading} tone="warn" />
        <StatCard icon={Target} label="Target Nabung" value={s?.target} loading={stats.loading} tone="accent" />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="glass rounded-3xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp size={18} className="text-ok-400" />
            <h2 className="font-semibold text-sm text-white/80">Total Pemasukan</h2>
          </div>
          <p className="text-2xl font-extrabold text-ok-400 tabular-nums" data-selectable>
            {stats.loading ? '…' : formatIDR(s?.totalMasuk ?? 0)}
          </p>
        </div>

        <div className="glass rounded-3xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <TrendingDown size={18} className="text-danger-400" />
            <h2 className="font-semibold text-sm text-white/80">Total Pengeluaran</h2>
          </div>
          <p className="text-2xl font-extrabold text-danger-400 tabular-nums" data-selectable>
            {stats.loading ? '…' : formatIDR(s?.totalKeluar ?? 0)}
          </p>
        </div>

        <div className="glass rounded-3xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <ArrowLeftRight size={18} className="text-brand-300" />
            <h2 className="font-semibold text-sm text-white/80">Arus Bersih</h2>
          </div>
          <p
            className={`text-2xl font-extrabold tabular-nums ${bersih >= 0 ? 'text-ok-400' : 'text-danger-400'}`}
            data-selectable
          >
            {stats.loading ? '…' : formatIDR(bersih)}
          </p>
        </div>
      </div>

      {/* Monitor penyimpanan ringkas */}
      <div className="glass rounded-3xl p-5">
        <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <HardDrive size={20} className="text-brand-300" />
            <h2 className="font-bold">Penyimpanan Supabase</h2>
          </div>
          <LiveBadge lastUpdated={storage.lastUpdated} label="tiap 20 detik" />
        </div>

        {storage.error ? (
          <p className="text-danger-400 text-sm">{storage.error}</p>
        ) : (
          <>
            <div className="flex items-end justify-between mb-2 gap-4 flex-wrap">
              <p className="text-3xl font-extrabold tabular-nums">
                {st ? formatBytes(st.totalBytes) : '…'}
                <span className="text-base font-medium text-white/70"> / {st?.limitMB ?? 1024} MB</span>
              </p>
              <p className="text-sm text-white/70">
                {st?.totalFiles ?? 0} berkas · rata-rata {st ? st.rataRataKB.toFixed(0) : 0} KB
              </p>
            </div>

            <div
              className="h-3 w-full bg-white/10 rounded-full overflow-hidden"
              role="progressbar"
              aria-valuenow={Math.round(st?.persen ?? 0)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Pemakaian penyimpanan"
            >
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${st?.persen ?? 0}%` }}
                transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                className={`h-full rounded-full ${
                  (st?.persen ?? 0) > 85
                    ? 'bg-gradient-to-r from-danger-500 to-danger-400'
                    : (st?.persen ?? 0) > 60
                      ? 'bg-gradient-to-r from-warn-400 to-brand-400'
                      : 'bg-gradient-to-r from-brand-500 to-brand-300'
                }`}
              />
            </div>
            <p className="text-micro text-white/70 mt-2">
              Terpakai {(st?.persen ?? 0).toFixed(2)}% dari kuota gratis.
              Semua foto ditekan otomatis ke maksimal 75 KB.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
