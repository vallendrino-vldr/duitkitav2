import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { HardDrive, Files, Gauge, Infinity as InfinityIcon, RefreshCw, AlertTriangle } from 'lucide-react';
import { adminApi, formatBytes, type StorageAdmin, type PenggunaAdmin } from '../lib/adminApi';
import { useLiveData } from '../lib/useLiveData';
import LiveBadge from '../components/admin/LiveBadge';
import { TARGET_KB } from '../utils/imageCompressor';

export default function AdminStorage() {
  // 10 detik: cukup terasa "langsung" tanpa membanjiri Storage API.
  const { data, loading, error, refresh, lastUpdated } = useLiveData<StorageAdmin>(
    adminApi.storage,
    { intervalMs: 10_000, channel: 'admin-storage-detail' },
  );

  const users = useLiveData<PenggunaAdmin[]>(adminApi.users, {
    tables: ['profiles'], channel: 'admin-storage-users', intervalMs: 120_000,
  });

  const namaPengguna = useMemo(() => {
    const m = new Map<string, string>();
    for (const u of users.data ?? []) m.set(u.id, u.display_name || u.username);
    return m;
  }, [users.data]);

  const persen = data?.persen ?? 0;
  const sisaBytes = Math.max(0, (data?.limitMB ?? 1024) * 1024 * 1024 - (data?.totalBytes ?? 0));
  // Perkiraan sisa kapasitas memakai batas kompresi (75 KB), bukan rata-rata
  // saat ini — supaya angkanya tetap masuk akal ketika bucket masih kosong.
  const perkiraanFoto = Math.floor(sisaBytes / (TARGET_KB * 1024));

  const maxBytes = Math.max(1, ...(data?.perPengguna ?? []).map((p) => p.bytes));

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">Monitor Penyimpanan</h1>
          <p className="text-white/70 text-sm mt-1">Pemakaian bucket <code className="text-brand-300">receipts</code>, diperbarui otomatis.</p>
        </div>
        <div className="flex items-center gap-3">
          <LiveBadge lastUpdated={lastUpdated} label="tiap 10 detik" />
          <button onClick={() => void refresh()} className="btn-ghost" aria-label="Muat ulang">
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
            Muat ulang
          </button>
        </div>
      </header>

      {error && (
        <div className="glass rounded-2xl p-4 flex items-center gap-3 border-danger-500/40">
          <AlertTriangle size={20} className="text-danger-400 shrink-0" />
          <p className="text-sm text-danger-400">{error}</p>
        </div>
      )}

      <div className="glass rounded-3xl p-6">
        <div className="flex items-center gap-2 mb-5">
          <HardDrive size={20} className="text-brand-300" />
          <h2 className="font-bold">Kapasitas Terpakai</h2>
        </div>

        <div className="flex items-end justify-between flex-wrap gap-4 mb-3">
          <p className="text-4xl font-extrabold tabular-nums">
            {data ? formatBytes(data.totalBytes) : '…'}
            <span className="text-lg font-medium text-white/70"> / {data?.limitMB ?? 1024} MB</span>
          </p>
          <p className={`text-3xl font-extrabold tabular-nums ${
            persen > 85 ? 'text-danger-400' : persen > 60 ? 'text-warn-400' : 'text-ok-400'
          }`}>
            {persen.toFixed(2)}%
          </p>
        </div>

        <div
          className="h-4 w-full bg-white/10 rounded-full overflow-hidden"
          role="progressbar" aria-valuenow={Math.round(persen)} aria-valuemin={0} aria-valuemax={100}
          aria-label="Pemakaian penyimpanan"
        >
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${persen}%` }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className={`h-full rounded-full ${
              persen > 85
                ? 'bg-gradient-to-r from-danger-500 to-danger-400'
                : persen > 60
                  ? 'bg-gradient-to-r from-warn-400 to-brand-400'
                  : 'bg-gradient-to-r from-brand-500 to-brand-300'
            }`}
          />
        </div>

        {persen > 85 && (
          <p className="text-sm text-danger-400 mt-3 flex items-center gap-2">
            <AlertTriangle size={16} /> Penyimpanan hampir penuh. Pertimbangkan menghapus struk lama.
          </p>
        )}
      </div>

      <div className="grid sm:grid-cols-3 gap-4">
        <div className="glass rounded-3xl p-5">
          <Files size={20} className="text-brand-300 mb-3" />
          <p className="text-2xl font-extrabold tabular-nums">{(data?.totalFiles ?? 0).toLocaleString('id-ID')}</p>
          <p className="text-micro text-white/70 mt-1">Total berkas struk</p>
        </div>
        <div className="glass rounded-3xl p-5">
          <Gauge size={20} className="text-accent-300 mb-3" />
          <p className="text-2xl font-extrabold tabular-nums">{(data?.rataRataKB ?? 0).toFixed(0)} KB</p>
          <p className="text-micro text-white/70 mt-1">Rata-rata per berkas (batas {TARGET_KB} KB)</p>
        </div>
        <div className="glass rounded-3xl p-5">
          <InfinityIcon size={20} className="text-ok-400 mb-3" />
          <p className="text-2xl font-extrabold tabular-nums">≈ {perkiraanFoto.toLocaleString('id-ID')}</p>
          <p className="text-micro text-white/70 mt-1">Perkiraan foto yang masih muat</p>
        </div>
      </div>

      <div className="glass rounded-3xl p-5">
        <h2 className="font-bold mb-4">Pemakaian per Pengguna</h2>

        {loading && !data ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => <div key={i} className="skeleton h-12 rounded-xl" />)}
          </div>
        ) : (data?.perPengguna.length ?? 0) === 0 ? (
          <p className="text-white/70 text-sm py-6 text-center">
            Belum ada struk yang diunggah.
          </p>
        ) : (
          <div className="space-y-4">
            {data!.perPengguna.map((p) => (
              <div key={p.userId}>
                <div className="flex justify-between items-baseline mb-1.5 gap-3">
                  <span className="text-sm font-semibold truncate">
                    {namaPengguna.get(p.userId) ?? (
                      <span className="text-white/60 font-mono text-micro">{p.userId.slice(0, 8)}…</span>
                    )}
                  </span>
                  <span className="text-micro text-white/70 tabular-nums shrink-0">
                    {formatBytes(p.bytes)} · {p.jumlah} berkas
                  </span>
                </div>
                <div className="h-2 w-full bg-white/10 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${(p.bytes / maxBytes) * 100}%` }}
                    transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                    className="h-full rounded-full bg-gradient-to-r from-accent-500 to-brand-400"
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
