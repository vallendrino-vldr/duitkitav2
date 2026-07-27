import { useState, ReactNode } from 'react';
import {
  ChevronDown, Wallet, ArrowLeftRight, HandCoins, Target,
  PiggyBank, Repeat, HardDrive, ShieldCheck, User as UserIcon, Image as ImageIcon,
} from 'lucide-react';
import {
  adminApi, formatIDR, formatBytes, formatTanggal,
  type PenggunaAdmin, type DetailPengguna,
} from '../../lib/adminApi';
import { pesanApi } from '../../lib/api';

/**
 * Satu baris pengguna yang bisa dibuka untuk melihat SELURUH datanya, dengan
 * akordion bertingkat di dalamnya (dompet, transaksi, hutang, tabungan, dst).
 *
 * Memakai <details>/<summary> bawaan browser, bukan state + animasi tinggi:
 * elemen ini sudah bisa dioperasikan dengan papan ketik dan dibacakan pembaca
 * layar tanpa kode tambahan, dan menganimasikan tinggi elemen akan memaksa
 * browser menata ulang halaman tiap frame.
 *
 * Datanya diambil MALAS — baru dipanggil saat barisnya pertama kali dibuka,
 * supaya membuka daftar 50 pengguna tidak menembakkan 50 permintaan sekaligus.
 */

function Bagian({
  judul, ikon: Ikon, jumlah, children, nada = 'brand',
}: {
  judul: string;
  ikon: typeof Wallet;
  jumlah: number;
  children: ReactNode;
  nada?: 'brand' | 'accent' | 'warn' | 'danger';
}) {
  const warna = {
    brand: 'text-brand-300 bg-brand-400/15',
    accent: 'text-accent-300 bg-accent-500/15',
    warn: 'text-warn-400 bg-warn-400/15',
    danger: 'text-danger-400 bg-danger-500/15',
  }[nada];

  return (
    <details className="group/sub bg-white/5 rounded-2xl border border-white/10 overflow-hidden">
      <summary className="flex items-center gap-3 p-3 cursor-pointer select-none min-h-[48px] hover:bg-white/5">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${warna}`}>
          <Ikon size={16} />
        </div>
        <span className="font-semibold text-sm flex-1">{judul}</span>
        <span className="text-micro text-white/70 tabular-nums">{jumlah}</span>
        <ChevronDown size={16} className="text-white/70 transition-transform duration-200 group-open/sub:rotate-180" />
      </summary>
      <div className="px-3 pb-3">
        {jumlah === 0 ? (
          <p className="text-white/60 text-micro py-3 text-center">Belum ada data.</p>
        ) : (
          children
        )}
      </div>
    </details>
  );
}

function Baris({ kiri, kanan, sub }: { kiri: string; kanan: string; sub?: string }) {
  return (
    <div className="flex justify-between items-start gap-3 py-2 border-t border-white/5 first:border-0">
      <div className="min-w-0">
        <p className="text-sm truncate">{kiri}</p>
        {sub && <p className="text-micro text-white/60 mt-0.5">{sub}</p>}
      </div>
      <span className="text-sm font-semibold tabular-nums shrink-0">{kanan}</span>
    </div>
  );
}

export default function UserAccordion({ user }: { user: PenggunaAdmin }) {
  const [detail, setDetail] = useState<DetailPengguna | null>(null);
  const [memuat, setMemuat] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  const muat = async () => {
    if (detail || memuat) return;
    setMemuat(true);
    setGalat(null);
    try {
      setDetail(await adminApi.detailPengguna(user.id));
    } catch (e) {
      setGalat(pesanApi(e, 'Gagal memuat detail pengguna'));
    } finally {
      setMemuat(false);
    }
  };

  const r = detail?.ringkasan;
  const namaDompet = new Map((detail?.dompet ?? []).map((w) => [w.id, w.name]));

  return (
    <details
      className="group glass rounded-3xl overflow-hidden"
      // onToggle dipakai supaya pengambilan data ikut terpicu saat dibuka
      // dengan papan ketik (Enter/Spasi), bukan hanya lewat klik tetikus.
      onToggle={(e) => { if ((e.currentTarget as HTMLDetailsElement).open) void muat(); }}
    >
      <summary className="flex items-center gap-3 p-4 cursor-pointer select-none min-h-[56px] hover:bg-white/5">
        <div
          className={`w-11 h-11 shrink-0 rounded-2xl flex items-center justify-center ${
            user.role === 'admin'
              ? 'bg-gradient-to-br from-brand-400 to-accent-600 text-white'
              : 'bg-white/10 text-white/80'
          }`}
        >
          {user.role === 'admin' ? <ShieldCheck size={20} /> : <UserIcon size={20} />}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-bold truncate">{user.display_name || user.username}</p>
            {user.role === 'admin' && (
              <span className="text-micro font-bold px-2 py-0.5 rounded-full bg-brand-400/20 text-brand-300">
                ADMIN
              </span>
            )}
          </div>
          <p className="text-micro text-white/70 truncate">
            @{user.username} · {user.jumlahTransaksi} transaksi ·{' '}
            <span className="tabular-nums">{formatIDR(user.totalSaldo)}</span>
          </p>
        </div>

        <ChevronDown size={20} className="text-white/70 shrink-0 transition-transform duration-200 group-open:rotate-180" />
      </summary>

      <div className="px-4 pb-4 space-y-3">
        {memuat && (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => <div key={i} className="skeleton h-12 rounded-2xl" />)}
          </div>
        )}

        {galat && <p className="text-danger-400 text-sm py-2">{galat}</p>}

        {detail && r && (
          <>
            {/* Ringkasan angka milik pengguna INI saja */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="bg-white/5 rounded-2xl p-3">
                <p className="text-micro text-white/70">Total Saldo</p>
                <p className={`font-bold tabular-nums text-sm mt-0.5 ${r.totalSaldo < 0 ? 'text-danger-400' : ''}`}>
                  {formatIDR(r.totalSaldo)}
                </p>
              </div>
              <div className="bg-white/5 rounded-2xl p-3">
                <p className="text-micro text-white/70">Pemasukan</p>
                <p className="font-bold tabular-nums text-sm mt-0.5 text-ok-400">{formatIDR(r.masuk)}</p>
              </div>
              <div className="bg-white/5 rounded-2xl p-3">
                <p className="text-micro text-white/70">Pengeluaran</p>
                <p className="font-bold tabular-nums text-sm mt-0.5 text-danger-400">{formatIDR(r.keluar)}</p>
              </div>
              <div className="bg-white/5 rounded-2xl p-3">
                <p className="text-micro text-white/70">Selisih</p>
                <p className={`font-bold tabular-nums text-sm mt-0.5 ${r.selisih >= 0 ? 'text-ok-400' : 'text-danger-400'}`}>
                  {formatIDR(r.selisih)}
                </p>
              </div>
            </div>

            <p className="text-micro text-white/60" data-selectable>
              {detail.profil.email} · bergabung {formatTanggal(detail.profil.created_at)}
            </p>

            {/* Akordion tingkat kedua */}
            <Bagian judul="Dompet" ikon={Wallet} jumlah={detail.dompet.length}>
              {detail.dompet.map((w) => (
                <Baris
                  key={w.id}
                  kiri={w.name}
                  sub={`Saldo awal ${formatIDR(Number(w.initial_balance))}`}
                  kanan={formatIDR(Number(w.balance))}
                />
              ))}
            </Bagian>

            <Bagian judul="Transaksi" ikon={ArrowLeftRight} jumlah={detail.transaksi.length} nada="accent">
              <div className="max-h-72 overflow-y-auto thin-scrollbar pr-1">
                {detail.transaksi.map((t) => (
                  <Baris
                    key={t.id}
                    kiri={t.title}
                    sub={`${formatTanggal(t.created_at)} · ${t.category || t.type} · ${
                      namaDompet.get(t.wallet_id) ?? 'dompet terhapus'
                    }${t.receipt_url ? ' · ada struk' : ''}`}
                    kanan={`${t.type === 'income' ? '+' : t.type === 'expense' ? '-' : '↔'} ${formatIDR(Number(t.amount))}`}
                  />
                ))}
              </div>
            </Bagian>

            <Bagian judul="Pengeluaran per Kategori" ikon={PiggyBank} jumlah={r.perKategori.length} nada="warn">
              {r.perKategori.map((k) => {
                const persen = r.keluar > 0 ? (k.total / r.keluar) * 100 : 0;
                return (
                  <div key={k.kategori} className="py-2 border-t border-white/5 first:border-0">
                    <div className="flex justify-between items-baseline gap-2 mb-1">
                      <span className="text-sm truncate">{k.kategori}</span>
                      <span className="text-sm font-semibold tabular-nums shrink-0">
                        {formatIDR(k.total)} <span className="text-white/60 text-micro">({persen.toFixed(0)}%)</span>
                      </span>
                    </div>
                    <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-warn-400 to-danger-400 transition-all duration-500"
                        style={{ width: `${persen}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </Bagian>

            <Bagian judul="Hutang & Piutang" ikon={HandCoins} jumlah={detail.hutang.length} nada="danger">
              {detail.hutang.map((d) => (
                <Baris
                  key={d.id}
                  kiri={d.title}
                  sub={`${d.type} · ${d.status === 'paid' ? 'Lunas' : 'Belum lunas'} · jatuh tempo ${formatTanggal(d.due_date)}`}
                  kanan={formatIDR(Number(d.amount))}
                />
              ))}
            </Bagian>

            <Bagian judul="Target Tabungan" ikon={Target} jumlah={detail.target.length}>
              {detail.target.map((g) => {
                const persen = Number(g.target_amount) > 0
                  ? Math.min((Number(g.current_amount) / Number(g.target_amount)) * 100, 100)
                  : 0;
                return (
                  <Baris
                    key={g.id}
                    kiri={g.title}
                    sub={`${persen.toFixed(0)}% tercapai · target ${formatTanggal(g.target_date)}`}
                    kanan={`${formatIDR(Number(g.current_amount))} / ${formatIDR(Number(g.target_amount))}`}
                  />
                );
              })}
            </Bagian>

            <Bagian judul="Anggaran" ikon={PiggyBank} jumlah={detail.anggaran.length} nada="warn">
              {detail.anggaran.map((b) => (
                <Baris
                  key={b.id}
                  kiri={b.category}
                  sub={`Periode ${formatTanggal(b.period_month)}`}
                  kanan={formatIDR(Number(b.amount_limit))}
                />
              ))}
            </Bagian>

            <Bagian judul="Transaksi Berulang" ikon={Repeat} jumlah={detail.berulang.length} nada="accent">
              {detail.berulang.map((rt) => (
                <Baris
                  key={rt.id}
                  kiri={rt.title}
                  sub={`Tiap ${rt.interval_count} ${rt.interval_unit} · berikutnya ${formatTanggal(rt.next_run)} · ${
                    rt.is_active ? 'aktif' : 'nonaktif'
                  }`}
                  kanan={formatIDR(Number(rt.amount))}
                />
              ))}
            </Bagian>

            <div className="bg-white/5 rounded-2xl p-3 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-brand-400/15 text-brand-300 flex items-center justify-center shrink-0">
                <HardDrive size={16} />
              </div>
              <span className="text-sm flex-1">Penyimpanan Struk</span>
              <span className="text-micro text-white/70 tabular-nums flex items-center gap-1">
                <ImageIcon size={12} /> {r.penyimpanan.jumlah} · {formatBytes(r.penyimpanan.bytes)}
              </span>
            </div>
          </>
        )}
      </div>
    </details>
  );
}
