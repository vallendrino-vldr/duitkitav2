import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeftRight,
  ArrowDownUp,
  ArrowRight,
  Wallet as IkonDompet,
  Coins,
  History,
  Pencil,
  X,
  AlertTriangle,
  Send,
  Loader2,
  Save,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '../lib/supabase';
import { useFinanceStore, type Wallet } from '../store/useFinanceStore';
import { safeMutate, pesanError } from '../lib/db';
import Portal from '../components/Portal';

/** Rupiah tanpa sen: uang harian tidak pernah ditulis sampai desimal. */
const formatIDR = (nilai: number) =>
  new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(Number.isFinite(nilai) ? nilai : 0);

/** Tanggal bisa null atau berisi teks rusak dari data lama, jadi jangan langsung dirender. */
const formatTanggal = (iso?: string | null) => {
  if (!iso) return '-';
  const tanggal = new Date(iso);
  if (Number.isNaN(tanggal.getTime())) return '-';
  return tanggal.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
};

const JUMLAH_RIWAYAT = 6;

export default function Transfer() {
  const { wallets, activeTabId, transactions, fetchWallets, fetchTransactions } = useFinanceStore();

  const [form, setForm] = useState({ dari: '', ke: '', nominal: '', catatan: '' });
  const [sibuk, setSibuk] = useState(false);

  const [dompetDiubah, setDompetDiubah] = useState<Wallet | null>(null);
  const [saldoAwalInput, setSaldoAwalInput] = useState('');
  const [sibukSaldo, setSibukSaldo] = useState(false);

  // Halaman ini bisa dibuka langsung dari tautan tanpa mampir ke dasbor lebih dulu,
  // jadi jangan berasumsi store sudah terisi. `null` = belum pernah dimuat sama sekali;
  // setelah gagal pun store mengisi array kosong, jadi ini tidak berputar tanpa henti.
  useEffect(() => {
    if (wallets === null) fetchWallets();
    if (transactions === null) fetchTransactions();
  }, [wallets, transactions, fetchWallets, fetchTransactions]);

  const daftarDompet = useMemo(() => wallets ?? [], [wallets]);

  // Isi pilihan awal secara otomatis supaya pengguna tidak disambut dua dropdown kosong.
  // Pilihan lama tetap dihormati selama dompetnya masih ada — kalau dompet dihapus di
  // tab lain, id yatim harus diganti atau tombol simpan akan menolak terus tanpa sebab jelas.
  useEffect(() => {
    if (daftarDompet.length === 0) return;
    setForm((prev) => {
      const dariValid = daftarDompet.some((w) => w.id === prev.dari);
      const keValid = daftarDompet.some((w) => w.id === prev.ke);
      const dari = dariValid ? prev.dari : daftarDompet[0].id;
      const ke = keValid && prev.ke !== dari ? prev.ke : (daftarDompet.find((w) => w.id !== dari)?.id ?? '');
      if (dari === prev.dari && ke === prev.ke) return prev;
      return { ...prev, dari, ke };
    });
  }, [daftarDompet]);

  const dompetAsal = useMemo(
    () => daftarDompet.find((w) => w.id === form.dari) ?? null,
    [daftarDompet, form.dari],
  );

  const dompetTujuan = useMemo(
    () => daftarDompet.find((w) => w.id === form.ke) ?? null,
    [daftarDompet, form.ke],
  );

  const riwayatTransfer = useMemo(
    () => (transactions ?? []).filter((t) => t.type === 'transfer').slice(0, JUMLAH_RIWAYAT),
    [transactions],
  );

  const nominal = Number(form.nominal);
  const nominalValid = Number.isFinite(nominal) && nominal > 0;
  const dompetSama = Boolean(form.dari) && form.dari === form.ke;
  const saldoAsal = Number(dompetAsal?.balance ?? 0);
  // Sekadar peringatan, bukan penghalang: orang sering mencatat transfer yang sudah
  // terjadi di dunia nyata sebelum saldo di aplikasi sempat dibetulkan.
  const saldoKurang = nominalValid && dompetAsal !== null && nominal > saldoAsal;
  const kurangDompet = wallets !== null && daftarDompet.length < 2;

  const namaDompet = (id?: string | null) =>
    daftarDompet.find((w) => w.id === id)?.name ?? 'Dompet terhapus';

  const tukarDompet = () => {
    setForm((prev) => ({ ...prev, dari: prev.ke, ke: prev.dari }));
  };

  const bukaPengaturanSaldo = (dompet: Wallet) => {
    setDompetDiubah(dompet);
    setSaldoAwalInput(String(Number(dompet.initial_balance ?? 0)));
  };

  const kirimTransfer = async (e: FormEvent) => {
    e.preventDefault();
    if (sibuk) return;

    if (!form.dari || !form.ke) {
      toast.error('Pilih dompet asal dan dompet tujuan dulu');
      return;
    }
    if (form.dari === form.ke) {
      toast.error('Dompet asal dan tujuan tidak boleh sama');
      return;
    }
    if (!nominalValid) {
      toast.error('Nominal harus lebih besar dari nol');
      return;
    }

    setSibuk(true);
    const idToast = toast.loading('Memproses transfer...');
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Sesi berakhir. Silakan masuk ulang.');

      // Satu baris saja, bukan sepasang keluar-masuk. Trigger database yang
      // mengurangi saldo asal sekaligus menambah saldo tujuan; menulis dua baris
      // membuat mutasi tercatat dobel dan total kekayaan ikut melenceng.
      await safeMutate(
        supabase.from('transactions').insert({
          id: crypto.randomUUID(),
          user_id: user.id,
          tab_id: activeTabId,
          wallet_id: form.dari,
          to_wallet_id: form.ke,
          type: 'transfer',
          amount: nominal,
          category: 'Transfer',
          title:
            form.catatan.trim() ||
            `Transfer ${namaDompet(form.dari)} ke ${namaDompet(form.ke)}`,
          created_at: new Date().toISOString(),
        }),
        'Gagal menyimpan transfer',
      );

      // Saldo dihitung ulang di database, bukan di browser, jadi wajib ambil ulang.
      await Promise.allSettled([fetchWallets(), fetchTransactions()]);

      toast.success('Transfer berhasil dicatat', { id: idToast });
      setForm((prev) => ({ ...prev, nominal: '', catatan: '' }));
    } catch (error) {
      toast.error(pesanError(error, 'Gagal melakukan transfer'), { id: idToast });
    } finally {
      setSibuk(false);
    }
  };

  const simpanSaldoAwal = async (e: FormEvent) => {
    e.preventDefault();
    if (!dompetDiubah || sibukSaldo) return;

    const nilai = Number(saldoAwalInput);
    if (!Number.isFinite(nilai) || nilai < 0) {
      toast.error('Saldo awal harus angka dan tidak boleh minus');
      return;
    }

    setSibukSaldo(true);
    const idToast = toast.loading('Menyimpan saldo awal...');
    try {
      // Yang ditulis HANYA initial_balance. Kolom balance dihitung trigger dari
      // saldo awal + seluruh transaksi; menimpanya langsung akan ditindas trigger
      // pada transaksi berikutnya dan bikin angka melompat sendiri.
      await safeMutate(
        supabase.from('wallets').update({ initial_balance: nilai }).eq('id', dompetDiubah.id),
        'Gagal menyimpan saldo awal',
      );

      await fetchWallets();
      toast.success('Saldo awal diperbarui', { id: idToast });
      setDompetDiubah(null);
    } catch (error) {
      toast.error(pesanError(error, 'Gagal menyimpan saldo awal'), { id: idToast });
    } finally {
      setSibukSaldo(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="page pb-dock relative z-10"
    >
      <div className="flex flex-col items-center mb-8">
        <motion.div
          animate={{ y: [0, -10, 0] }}
          transition={{ repeat: Infinity, duration: 2.4, ease: 'easeInOut' }}
          className="text-brand-300 mb-2 drop-shadow-[0_0_15px_rgba(45,212,191,0.45)]"
        >
          <ArrowLeftRight size={56} />
        </motion.div>
        <h2 className="text-2xl font-bold text-white text-center">Transfer Antar Dompet</h2>
        <p className="text-white/70 text-sm text-center mt-1 max-w-sm">
          Memindahkan uang antar dompet. Total kekayaanmu tidak berubah, hanya tempatnya yang pindah.
        </p>
      </div>

      {/* ---------- ringkasan saldo tiap dompet ---------- */}
      <section className="mb-8">
        <div className="flex items-center gap-2 mb-3">
          <IkonDompet size={18} className="text-brand-300" />
          <h3 className="text-white font-bold">Dompet Kamu</h3>
        </div>

        {wallets === null ? (
          <div className="flex gap-3">
            <div className="skeleton h-24 flex-1 rounded-3xl" />
            <div className="skeleton h-24 flex-1 rounded-3xl" />
          </div>
        ) : daftarDompet.length === 0 ? (
          <div className="glass rounded-4xl p-6 text-center">
            <IkonDompet size={28} className="mx-auto text-white/70 mb-2" />
            <p className="text-white/70 text-sm">
              Belum ada dompet. Tambahkan dulu lewat menu Pengaturan, bagian Manajemen Dompet.
            </p>
          </div>
        ) : (
          <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1">
            {daftarDompet.map((w) => (
              <div key={w.id} className="glass rounded-3xl p-4 min-w-[11rem] flex-shrink-0">
                <p className="text-white font-semibold truncate">{w.name}</p>
                <p className="text-brand-300 font-bold text-lg mt-1" data-selectable>
                  {formatIDR(Number(w.balance ?? 0))}
                </p>
                <p className="text-white/70 text-micro mt-1">
                  Saldo awal {formatIDR(Number(w.initial_balance ?? 0))}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ---------- formulir transfer ---------- */}
      <form onSubmit={kirimTransfer} className="glass rounded-4xl p-5 mb-8 space-y-4">
        <div>
          <label className="label" htmlFor="dompet-asal">Dari Dompet</label>
          <select
            id="dompet-asal"
            value={form.dari}
            onChange={(e) => setForm({ ...form, dari: e.target.value })}
            className="field appearance-none"
          >
            <option value="" className="bg-ink-900">Pilih dompet asal</option>
            {daftarDompet.map((w) => (
              <option key={w.id} value={w.id} className="bg-ink-900">
                {w.name} — {formatIDR(Number(w.balance ?? 0))}
              </option>
            ))}
          </select>
        </div>

        <div className="flex justify-center">
          <button
            type="button"
            onClick={tukarDompet}
            aria-label="Tukar dompet asal dan tujuan"
            className="icon-btn bg-white/10 border border-white/15"
          >
            <ArrowDownUp size={18} />
          </button>
        </div>

        <div>
          <label className="label" htmlFor="dompet-tujuan">Ke Dompet</label>
          <select
            id="dompet-tujuan"
            value={form.ke}
            onChange={(e) => setForm({ ...form, ke: e.target.value })}
            className="field appearance-none"
          >
            <option value="" className="bg-ink-900">Pilih dompet tujuan</option>
            {daftarDompet.map((w) => (
              <option key={w.id} value={w.id} disabled={w.id === form.dari} className="bg-ink-900">
                {w.name} — {formatIDR(Number(w.balance ?? 0))}
              </option>
            ))}
          </select>
        </div>

        {dompetAsal && dompetTujuan && !dompetSama && (
          <div className="flex items-center justify-center gap-2 rounded-2xl bg-white/5 border border-white/10 px-3 py-2">
            <span className="text-white/70 text-sm truncate max-w-[8rem]">{dompetAsal.name}</span>
            <ArrowRight size={16} className="text-brand-300 flex-shrink-0" />
            <span className="text-white/70 text-sm truncate max-w-[8rem]">{dompetTujuan.name}</span>
          </div>
        )}

        <div>
          <label className="label" htmlFor="nominal-transfer">Nominal</label>
          <input
            id="nominal-transfer"
            type="number"
            inputMode="numeric"
            min={0}
            step={1000}
            placeholder="Contoh: 250000"
            value={form.nominal}
            onChange={(e) => setForm({ ...form, nominal: e.target.value })}
            className="field text-lg font-semibold"
          />
          {nominalValid && (
            <p className="text-white/70 text-micro mt-1.5 ml-1">{formatIDR(nominal)}</p>
          )}
        </div>

        <div>
          <label className="label" htmlFor="catatan-transfer">Catatan (boleh dikosongkan)</label>
          <input
            id="catatan-transfer"
            type="text"
            maxLength={80}
            placeholder="Contoh: Isi ulang dompet harian"
            value={form.catatan}
            onChange={(e) => setForm({ ...form, catatan: e.target.value })}
            className="field"
          />
        </div>

        <AnimatePresence>
          {dompetSama && (
            <motion.div
              key="peringatan-sama"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="flex items-start gap-2 rounded-2xl border border-danger-500/40 bg-danger-500/10 p-3"
            >
              <AlertTriangle size={18} className="text-danger-400 flex-shrink-0 mt-0.5" />
              <p className="text-danger-400 text-sm">
                Dompet asal dan tujuan sama. Pilih dompet yang berbeda.
              </p>
            </motion.div>
          )}

          {saldoKurang && (
            <motion.div
              key="peringatan-saldo"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="flex items-start gap-2 rounded-2xl border border-warn-400/40 bg-warn-400/10 p-3"
            >
              <AlertTriangle size={18} className="text-warn-400 flex-shrink-0 mt-0.5" />
              <p className="text-warn-400 text-sm">
                Saldo {dompetAsal?.name} cuma {formatIDR(saldoAsal)}. Transfer tetap bisa dilanjutkan,
                tapi saldonya akan jadi minus. Kalau uangmu sebenarnya ada, isi dulu Saldo Awal di bawah.
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        <button type="submit" disabled={sibuk || kurangDompet} className="btn-primary w-full">
          {sibuk ? (
            <>
              <Loader2 size={18} className="animate-spin" />
              Memproses...
            </>
          ) : (
            <>
              <Send size={18} />
              Kirim Transfer
            </>
          )}
        </button>

        {kurangDompet && (
          <p className="text-white/70 text-micro text-center">
            Transfer butuh minimal dua dompet. Tambah dompet dulu di menu Pengaturan.
          </p>
        )}
      </form>

      {/* ---------- saldo awal: tanpa ini saldo pengguna langsung minus ---------- */}
      <section className="mb-8">
        <div className="flex items-center gap-2 mb-2">
          <Coins size={18} className="text-warn-400" />
          <h3 className="text-white font-bold">Saldo Awal Dompet</h3>
        </div>
        <p className="text-white/70 text-sm mb-4">
          Isi jumlah uang yang sudah kamu punya sebelum memakai aplikasi ini. Tanpa saldo awal,
          setiap pengeluaran membuat dompet terlihat minus padahal uangnya memang ada.
        </p>

        {wallets === null ? (
          <div className="space-y-3">
            <div className="skeleton h-20 rounded-3xl" />
            <div className="skeleton h-20 rounded-3xl" />
          </div>
        ) : daftarDompet.length === 0 ? (
          <p className="text-white/70 text-sm text-center py-4">Belum ada dompet untuk diatur.</p>
        ) : (
          <div className="space-y-3">
            {daftarDompet.map((w) => (
              <div key={w.id} className="glass rounded-3xl p-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-white font-semibold truncate">{w.name}</p>
                  <p className="text-white/70 text-micro mt-1">
                    Saldo awal {formatIDR(Number(w.initial_balance ?? 0))}
                  </p>
                  <p className="text-brand-300 text-sm font-semibold mt-0.5" data-selectable>
                    Sekarang {formatIDR(Number(w.balance ?? 0))}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => bukaPengaturanSaldo(w)}
                  className="btn-ghost px-4 flex-shrink-0"
                >
                  <Pencil size={16} />
                  Atur
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ---------- riwayat transfer ---------- */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <History size={18} className="text-accent-300" />
          <h3 className="text-white font-bold">Transfer Terakhir</h3>
        </div>

        {transactions === null ? (
          <div className="space-y-3">
            <div className="skeleton h-16 rounded-3xl" />
            <div className="skeleton h-16 rounded-3xl" />
          </div>
        ) : riwayatTransfer.length === 0 ? (
          <p className="text-white/70 text-sm text-center py-6">
            Belum ada transfer yang tercatat.
          </p>
        ) : (
          <div className="space-y-3">
            {riwayatTransfer.map((t) => (
              <div key={t.id} className="glass rounded-3xl p-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-white font-semibold truncate">{t.title || 'Transfer'}</p>
                  <div className="flex items-center gap-1.5 mt-1 text-white/70 text-micro">
                    <span className="truncate max-w-[7rem]">{namaDompet(t.wallet_id)}</span>
                    <ArrowRight size={12} className="flex-shrink-0" />
                    <span className="truncate max-w-[7rem]">{namaDompet(t.to_wallet_id)}</span>
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-brand-300 font-bold" data-selectable>
                    {formatIDR(Number(t.amount ?? 0))}
                  </p>
                  <p className="text-white/70 text-micro mt-0.5">{formatTanggal(t.created_at)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Modal wajib lewat Portal: halaman dibungkus motion.div ber-transform,
          sehingga `fixed` di dalamnya akan mengacu ke kotak halaman, bukan layar. */}
      <Portal>
        <AnimatePresence>
          {dompetDiubah && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
              <motion.div
                key="latar-saldo"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => { if (!sibukSaldo) setDompetDiubah(null); }}
                className="absolute inset-0 bg-ink-950/70 backdrop-blur-md"
              />

              <motion.form
                key="panel-saldo"
                initial={{ opacity: 0, scale: 0.94, y: 16 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.94, y: 16 }}
                transition={{ type: 'spring', damping: 20, stiffness: 90 }}
                onSubmit={simpanSaldoAwal}
                role="dialog"
                aria-modal="true"
                aria-label="Atur saldo awal dompet"
                className="glass-strong rounded-4xl p-6 w-full max-w-sm relative z-[61] space-y-4"
              >
                <button
                  type="button"
                  onClick={() => { if (!sibukSaldo) setDompetDiubah(null); }}
                  aria-label="Tutup"
                  className="icon-btn absolute top-3 right-3"
                >
                  <X size={20} />
                </button>

                <div className="pr-12">
                  <h3 className="text-white font-bold text-lg">Saldo Awal</h3>
                  <p className="text-white/70 text-sm mt-0.5 truncate">{dompetDiubah.name}</p>
                </div>

                <div>
                  <label className="label" htmlFor="saldo-awal">Uang yang sudah ada di dompet ini</label>
                  <input
                    id="saldo-awal"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    step={1000}
                    placeholder="Contoh: 1500000"
                    value={saldoAwalInput}
                    onChange={(e) => setSaldoAwalInput(e.target.value)}
                    className="field text-lg font-semibold"
                  />
                  <p className="text-white/70 text-micro mt-1.5 ml-1">
                    {formatIDR(Number(saldoAwalInput))}
                  </p>
                </div>

                <div className="rounded-2xl bg-white/5 border border-white/10 p-3">
                  <p className="text-white/70 text-micro">
                    Saldo berjalan dihitung ulang otomatis dari saldo awal ditambah seluruh
                    transaksi, jadi angka di dompet akan menyesuaikan sendiri setelah disimpan.
                  </p>
                  <p className="text-white/70 text-micro mt-2">
                    Saldo sekarang {formatIDR(Number(dompetDiubah.balance ?? 0))}
                  </p>
                </div>

                <div className="flex gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => setDompetDiubah(null)}
                    disabled={sibukSaldo}
                    className="btn-ghost flex-1"
                  >
                    Batal
                  </button>
                  <button type="submit" disabled={sibukSaldo} className="btn-primary flex-1">
                    {sibukSaldo ? (
                      <>
                        <Loader2 size={18} className="animate-spin" />
                        Menyimpan...
                      </>
                    ) : (
                      <>
                        <Save size={18} />
                        Simpan
                      </>
                    )}
                  </button>
                </div>
              </motion.form>
            </div>
          )}
        </AnimatePresence>
      </Portal>
    </motion.div>
  );
}
