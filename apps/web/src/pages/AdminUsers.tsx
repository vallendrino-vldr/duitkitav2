import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  Search, UserPlus, Pencil, Trash2, KeyRound, ShieldCheck, User as UserIcon,
  X, RefreshCw, AlertTriangle,
} from 'lucide-react';
import { adminApi, formatIDR, formatTanggal, type PenggunaAdmin } from '../lib/adminApi';
import { useLiveData } from '../lib/useLiveData';
import { pesanApi } from '../lib/api';
import { useAuth } from '../lib/AuthProvider';
import LiveBadge from '../components/admin/LiveBadge';
import Portal from '../components/Portal';

type Modal =
  | { jenis: 'buat' }
  | { jenis: 'ubah'; user: PenggunaAdmin }
  | { jenis: 'pin'; user: PenggunaAdmin }
  | { jenis: 'hapus'; user: PenggunaAdmin }
  | null;

export default function AdminUsers() {
  const { profile } = useAuth();
  const [cari, setCari] = useState('');
  const [modal, setModal] = useState<Modal>(null);
  const [sibuk, setSibuk] = useState(false);

  const { data, loading, error, refresh, lastUpdated } = useLiveData<PenggunaAdmin[]>(
    adminApi.users,
    { tables: ['profiles', 'wallets'], channel: 'admin-users', intervalMs: 60_000 },
  );

  const daftar = useMemo(() => {
    const semua = data ?? [];
    const q = cari.trim().toLowerCase();
    if (!q) return semua;
    return semua.filter((u) =>
      [u.username, u.email, u.display_name].some((v) => (v ?? '').toLowerCase().includes(q)),
    );
  }, [data, cari]);

  const jalankan = async (fn: () => Promise<unknown>, sukses: string) => {
    setSibuk(true);
    const id = toast.loading('Memproses…');
    try {
      await fn();
      toast.success(sukses, { id });
      setModal(null);
      await refresh(true);
    } catch (e) {
      toast.error(pesanApi(e, 'Operasi gagal'), { id });
    } finally {
      setSibuk(false);
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">Kelola Pengguna</h1>
          <p className="text-white/70 text-sm mt-1">
            {daftar.length} dari {data?.length ?? 0} akun ditampilkan.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <LiveBadge lastUpdated={lastUpdated} />
          <button onClick={() => void refresh()} className="icon-btn" aria-label="Muat ulang">
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          </button>
          <button onClick={() => setModal({ jenis: 'buat' })} className="btn-primary">
            <UserPlus size={18} />
            Akun Baru
          </button>
        </div>
      </header>

      <div className="relative">
        <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/60 pointer-events-none" />
        <input
          value={cari}
          onChange={(e) => setCari(e.target.value)}
          placeholder="Cari nama, username, atau email…"
          aria-label="Cari pengguna"
          className="field pl-11"
        />
      </div>

      {error && (
        <div className="glass rounded-2xl p-4 flex items-center gap-3 border-danger-500/40">
          <AlertTriangle size={20} className="text-danger-400 shrink-0" />
          <p className="text-sm text-danger-400">{error}</p>
        </div>
      )}

      {loading && !data ? (
        <div className="space-y-3">
          {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-24 rounded-3xl" />)}
        </div>
      ) : daftar.length === 0 ? (
        <div className="glass rounded-3xl p-10 text-center">
          <p className="text-white/70">Tidak ada akun yang cocok.</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {daftar.map((u) => {
            const diriSendiri = u.id === profile?.id;
            return (
              <div key={u.id} className="glass rounded-3xl p-4 flex flex-wrap items-center gap-4">
                <div
                  className={`w-12 h-12 shrink-0 rounded-2xl flex items-center justify-center font-bold ${
                    u.role === 'admin'
                      ? 'bg-gradient-to-br from-brand-400 to-accent-600 text-white'
                      : 'bg-white/10 text-white/80'
                  }`}
                >
                  {u.role === 'admin' ? <ShieldCheck size={22} /> : <UserIcon size={22} />}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-bold truncate">{u.display_name || u.username}</p>
                    {u.role === 'admin' && (
                      <span className="text-micro font-bold px-2 py-0.5 rounded-full bg-brand-400/20 text-brand-300">
                        ADMIN
                      </span>
                    )}
                    {diriSendiri && (
                      <span className="text-micro font-bold px-2 py-0.5 rounded-full bg-white/15 text-white/80">
                        KAMU
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-white/70 truncate" data-selectable>
                    @{u.username} · {u.email}
                  </p>
                  <p className="text-micro text-white/60 mt-0.5">
                    Bergabung {formatTanggal(u.created_at)} · {u.jumlahTransaksi} transaksi ·{' '}
                    <span className="tabular-nums">{formatIDR(u.totalSaldo)}</span>
                  </p>
                </div>

                <div className="flex items-center gap-1 ml-auto">
                  <button onClick={() => setModal({ jenis: 'ubah', user: u })} className="icon-btn" aria-label={`Ubah ${u.username}`}>
                    <Pencil size={18} />
                  </button>
                  <button onClick={() => setModal({ jenis: 'pin', user: u })} className="icon-btn" aria-label={`Atur ulang PIN ${u.username}`}>
                    <KeyRound size={18} />
                  </button>
                  <button
                    onClick={() => setModal({ jenis: 'hapus', user: u })}
                    disabled={diriSendiri}
                    aria-label={`Hapus ${u.username}`}
                    title={diriSendiri ? 'Tidak bisa menghapus akun sendiri' : undefined}
                    className="icon-btn hover:text-danger-400 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Portal>
        <AnimatePresence>
          {modal && (
            <ModalWrapper onClose={() => !sibuk && setModal(null)}>
              {modal.jenis === 'buat' && (
                <FormBuat sibuk={sibuk} onSubmit={(p) => jalankan(() => adminApi.buatUser(p), 'Akun berhasil dibuat')} />
              )}
              {modal.jenis === 'ubah' && (
                <FormUbah
                  user={modal.user}
                  diriSendiri={modal.user.id === profile?.id}
                  sibuk={sibuk}
                  onSubmit={(p) => jalankan(() => adminApi.ubahUser(modal.user.id, p), 'Akun diperbarui')}
                />
              )}
              {modal.jenis === 'pin' && (
                <FormPin
                  user={modal.user}
                  sibuk={sibuk}
                  onSubmit={(pin) => jalankan(() => adminApi.resetPin(modal.user.id, pin), 'PIN berhasil diatur ulang')}
                />
              )}
              {modal.jenis === 'hapus' && (
                <KonfirmasiHapus
                  user={modal.user}
                  sibuk={sibuk}
                  onBatal={() => setModal(null)}
                  onHapus={() => jalankan(() => adminApi.hapusUser(modal.user.id), 'Akun dihapus')}
                />
              )}
            </ModalWrapper>
          )}
        </AnimatePresence>
      </Portal>
    </div>
  );
}

/* ---------- bagian modal ---------- */

function ModalWrapper({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-ink-950/70 backdrop-blur-md"
      />
      <motion.div
        initial={{ scale: 0.94, opacity: 0, y: 16 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.94, opacity: 0, y: 16 }}
        transition={{ type: 'spring', damping: 20, stiffness: 90 }}
        role="dialog"
        aria-modal="true"
        className="glass-strong rounded-4xl p-6 w-full max-w-md relative z-10 max-h-[85dvh] overflow-y-auto thin-scrollbar"
      >
        <button onClick={onClose} aria-label="Tutup" className="icon-btn absolute top-4 right-4">
          <X size={20} />
        </button>
        {children}
      </motion.div>
    </div>
  );
}

function FormBuat({ sibuk, onSubmit }: {
  sibuk: boolean;
  onSubmit: (p: { email: string; password: string; username: string; display_name: string; role: 'user' | 'admin'; security_pin: string }) => void;
}) {
  const [f, setF] = useState({
    email: '', password: '', username: '', display_name: '',
    role: 'user' as 'user' | 'admin', security_pin: '',
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!/^\d{6}$/.test(f.security_pin)) return toast.error('PIN harus 6 digit angka');
        if (f.password.length < 6) return toast.error('Kata sandi minimal 6 karakter');
        onSubmit(f);
      }}
      className="space-y-4"
    >
      <h2 className="text-xl font-bold mb-1 pr-10">Buat Akun Baru</h2>
      <p className="text-sm text-white/70 -mt-2 mb-4">
        Akun langsung aktif tanpa perlu konfirmasi email.
      </p>

      <div>
        <label className="label" htmlFor="b-email">Email</label>
        <input id="b-email" type="email" required autoComplete="off" className="field"
          value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} placeholder="nama@email.com" />
      </div>
      <div>
        <label className="label" htmlFor="b-pass">Kata Sandi</label>
        <input id="b-pass" type="password" required minLength={6} autoComplete="new-password" className="field"
          value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} placeholder="Minimal 6 karakter" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="b-user">Username</label>
          <input id="b-user" type="text" className="field"
            value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} placeholder="otomatis" />
        </div>
        <div>
          <label className="label" htmlFor="b-nama">Nama Tampilan</label>
          <input id="b-nama" type="text" className="field"
            value={f.display_name} onChange={(e) => setF({ ...f, display_name: e.target.value })} placeholder="Pengguna Baru" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="b-pin">PIN (6 digit)</label>
          <input id="b-pin" type="text" inputMode="numeric" maxLength={6} required className="field tracking-[0.4em] text-center"
            value={f.security_pin}
            onChange={(e) => setF({ ...f, security_pin: e.target.value.replace(/\D/g, '') })}
            placeholder="000000" />
        </div>
        <div>
          <label className="label" htmlFor="b-role">Peran</label>
          <select id="b-role" className="field appearance-none"
            value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as 'user' | 'admin' })}>
            <option value="user" className="bg-ink-800">Pengguna</option>
            <option value="admin" className="bg-ink-800">Admin</option>
          </select>
        </div>
      </div>

      <button type="submit" disabled={sibuk} className="btn-primary w-full mt-2">
        <UserPlus size={18} /> Buat Akun
      </button>
    </form>
  );
}

function FormUbah({ user, diriSendiri, sibuk, onSubmit }: {
  user: PenggunaAdmin; diriSendiri: boolean; sibuk: boolean;
  onSubmit: (p: { display_name: string; username: string; role: 'user' | 'admin' }) => void;
}) {
  const [f, setF] = useState({
    display_name: user.display_name ?? '',
    username: user.username,
    role: user.role,
  });

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(f); }} className="space-y-4">
      <h2 className="text-xl font-bold mb-1 pr-10">Ubah Akun</h2>
      <p className="text-sm text-white/70 -mt-2 mb-4" data-selectable>{user.email}</p>

      <div>
        <label className="label" htmlFor="u-nama">Nama Tampilan</label>
        <input id="u-nama" type="text" className="field"
          value={f.display_name} onChange={(e) => setF({ ...f, display_name: e.target.value })} />
      </div>
      <div>
        <label className="label" htmlFor="u-user">Username</label>
        <input id="u-user" type="text" required className="field"
          value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} />
      </div>
      <div>
        <label className="label" htmlFor="u-role">Peran</label>
        <select id="u-role" className="field appearance-none" disabled={diriSendiri}
          value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as 'user' | 'admin' })}>
          <option value="user" className="bg-ink-800">Pengguna</option>
          <option value="admin" className="bg-ink-800">Admin</option>
        </select>
        {diriSendiri && (
          <p className="text-micro text-white/60 mt-1.5 ml-1">
            Peran akun sendiri dikunci, supaya kamu tidak mengurung diri di luar panel admin.
          </p>
        )}
      </div>

      <button type="submit" disabled={sibuk} className="btn-primary w-full mt-2">
        <Pencil size={18} /> Simpan Perubahan
      </button>
    </form>
  );
}

function FormPin({ user, sibuk, onSubmit }: {
  user: PenggunaAdmin; sibuk: boolean; onSubmit: (pin: string) => void;
}) {
  const [pin, setPin] = useState('');

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!/^\d{6}$/.test(pin)) return toast.error('PIN harus 6 digit angka');
        onSubmit(pin);
      }}
      className="space-y-4"
    >
      <h2 className="text-xl font-bold mb-1 pr-10">Atur Ulang PIN</h2>
      <p className="text-sm text-white/70 -mt-2 mb-4">
        PIN baru untuk <strong className="text-white">@{user.username}</strong>. Sampaikan langsung
        ke pemilik akun dan minta dia menggantinya lewat Pengaturan.
      </p>

      <div>
        <label className="label" htmlFor="p-pin">PIN Baru (6 digit)</label>
        <input id="p-pin" type="text" inputMode="numeric" maxLength={6} required autoFocus
          className="field tracking-[0.5em] text-center text-lg"
          value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} placeholder="000000" />
      </div>

      <button type="submit" disabled={sibuk} className="btn-primary w-full mt-2">
        <KeyRound size={18} /> Simpan PIN Baru
      </button>
    </form>
  );
}

function KonfirmasiHapus({ user, sibuk, onBatal, onHapus }: {
  user: PenggunaAdmin; sibuk: boolean; onBatal: () => void; onHapus: () => void;
}) {
  const [ketik, setKetik] = useState('');
  const cocok = ketik.trim() === user.username;

  return (
    <div className="space-y-4">
      <div className="w-12 h-12 rounded-2xl bg-danger-500/20 text-danger-400 flex items-center justify-center">
        <AlertTriangle size={24} />
      </div>
      <h2 className="text-xl font-bold">Hapus Akun Permanen</h2>
      <p className="text-sm text-white/80">
        Seluruh dompet, transaksi, hutang, target nabung, dan foto struk milik{' '}
        <strong className="text-white">@{user.username}</strong> akan ikut terhapus.
        Tindakan ini <strong className="text-danger-400">tidak bisa dibatalkan</strong>.
      </p>

      <div>
        {/* Ketik-ulang username: penghalang sengaja supaya penghapusan permanen
            tidak terjadi hanya karena salah pencet. */}
        <label className="label" htmlFor="h-konfirm">
          Ketik <span className="text-danger-400">{user.username}</span> untuk melanjutkan
        </label>
        <input id="h-konfirm" type="text" autoFocus autoComplete="off" className="field"
          value={ketik} onChange={(e) => setKetik(e.target.value)} placeholder={user.username} />
      </div>

      <div className="flex gap-3 pt-2">
        <button type="button" onClick={onBatal} className="btn-ghost flex-1">Batal</button>
        <button
          type="button" onClick={onHapus} disabled={!cocok || sibuk}
          className="btn flex-1 bg-danger-500 text-white px-5 disabled:opacity-40"
        >
          <Trash2 size={18} /> Hapus
        </button>
      </div>
    </div>
  );
}
