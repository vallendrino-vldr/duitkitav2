import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  SlidersHorizontal, Type, Hash, Coins,
  Fingerprint, KeyRound, ShieldCheck, BellRing, ImagePlus, Database,
  Download, Upload, Trash2, AlertTriangle, Loader2, User as UserIcon, X, Calendar, Plus,
} from 'lucide-react';
import Portal from '../components/Portal';
import { supabase } from '../lib/supabase';
import { safeMutate, pesanError } from '../lib/db';
import { unggahStruk, urlStruk } from '../lib/api';
import { compressImage, formatKB, TARGET_KB } from '../utils/imageCompressor';
import { useFinanceStore } from '../store/useFinanceStore';
import { useNavigate } from 'react-router-dom';

type Tema = 'dark' | 'light' | 'system';
type FormatAngka = 'id' | 'en';
type Bahasa = 'id' | 'en';
type CaraBuka = 'pin' | 'biometric' | 'both';

interface Preferensi {
  theme: Tema;
  font_scale: number;
  number_format: FormatAngka;
  language: Bahasa;
  currency: string;
  avatar_url: string | null;
  unlock_method: CaraBuka;
  reminder_days_before: number;
  tanggal_mulai_bulan: number;
}

/** Baris apa adanya dari database — semua kolom bisa null, jadi jangan dipercaya mentah-mentah. */
type BarisTabel = Record<string, unknown>;

const BAWAAN: Preferensi = {
  theme: 'dark',
  font_scale: 1,
  number_format: 'id',
  language: 'id',
  currency: 'IDR',
  avatar_url: null,
  unlock_method: 'pin',
  reminder_days_before: 3,
  tanggal_mulai_bulan: 1,
};

const KOLOM_PREFERENSI =
  'user_id, theme, font_scale, number_format, language, currency, avatar_url, unlock_method, reminder_days_before, tanggal_mulai_bulan';

const SKALA_MIN = 0.8;
const SKALA_MAX = 1.6;

/**
 * Tabel yang ikut dicadangkan dan dipulihkan, berurutan.
 * `wallets` harus lebih dulu: transaksi dan transaksi berulang menunjuk ke dompet,
 * kalau dompetnya belum ada seluruh baris ditolak foreign key.
 * `buang` = kolom yang TIDAK boleh ditulis balik (lihat catatan di bersihkanBaris).
 */
const TABEL_DATA: { tabel: string; label: string; buang?: string[] }[] = [
  { tabel: 'wallets', label: 'Dompet', buang: ['balance'] },
  { tabel: 'transactions', label: 'Transaksi' },
  { tabel: 'debts', label: 'Hutang & Piutang' },
  { tabel: 'saving_goals', label: 'Target Tabungan' },
  { tabel: 'budgets', label: 'Anggaran' },
  { tabel: 'recurring_transactions', label: 'Transaksi Berulang' },
];

/** Tabel yang dikosongkan saat reset. Dompet sengaja TIDAK ikut dihapus. */
const TABEL_RESET: { tabel: string; label: string }[] = [
  { tabel: 'transactions', label: 'Transaksi' },
  { tabel: 'debts', label: 'Hutang & Piutang' },
  { tabel: 'saving_goals', label: 'Target Tabungan' },
  { tabel: 'budgets', label: 'Anggaran' },
  { tabel: 'recurring_transactions', label: 'Transaksi Berulang' },
];

async function idPengguna(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user?.id ?? null;
}

function angkaAman(nilai: unknown, cadangan: number): number {
  const n = Number(nilai);
  return Number.isFinite(n) ? n : cadangan;
}

function batasi(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** Baris database boleh punya kolom kosong; UI tidak boleh ikut kosong. */
function normalkan(baris: BarisTabel): Preferensi {
  const tema = baris.theme;
  const buka = baris.unlock_method;
  return {
    theme: tema === 'light' || tema === 'system' ? tema : 'dark',
    font_scale: batasi(angkaAman(baris.font_scale, 1), SKALA_MIN, SKALA_MAX),
    number_format: baris.number_format === 'en' ? 'en' : 'id',
    language: baris.language === 'en' ? 'en' : 'id',
    currency: typeof baris.currency === 'string' && baris.currency ? baris.currency : 'IDR',
    avatar_url: typeof baris.avatar_url === 'string' && baris.avatar_url ? baris.avatar_url : null,
    unlock_method: buka === 'biometric' || buka === 'both' ? buka : 'pin',
    reminder_days_before: batasi(Math.round(angkaAman(baris.reminder_days_before, 3)), 0, 30),
    tanggal_mulai_bulan: batasi(Math.round(angkaAman(baris.tanggal_mulai_bulan, 1)), 1, 31),
  };
}

/**
 * Menyiapkan baris cadangan sebelum ditulis balik.
 * user_id dipaksa ke pemilik sesi sekarang: berkas cadangan bisa saja berasal dari
 * akun lain, dan tanpa ini seluruh baris akan ditolak aturan keamanan tanpa penjelasan.
 * Kolom pada `buang` dilewati karena diisi otomatis oleh trigger database.
 */
function bersihkanBaris(rows: BarisTabel[], uid: string, buang: string[] = []): BarisTabel[] {
  return rows
    .filter((r) => r !== null && typeof r === 'object')
    .map((r) => {
      const salinan: BarisTabel = { ...r, user_id: uid };
      for (const kolom of buang) delete salinan[kolom];
      return salinan;
    });
}

/** Kiriman raksasa gampang kena batas ukuran permintaan, jadi dipecah per bagian. */
function potong<T>(daftar: T[], ukuran: number): T[][] {
  const hasil: T[][] = [];
  for (let i = 0; i < daftar.length; i += ukuran) hasil.push(daftar.slice(i, i + ukuran));
  return hasil;
}

export default function Preferences() {
  const { refreshAll } = useFinanceStore();
  const navigate = useNavigate();

  const [prefs, setPrefs] = useState<Preferensi>(BAWAAN);
  const [skala, setSkala] = useState<number>(BAWAAN.font_scale);
  const [memuat, setMemuat] = useState(true);
  const [menyimpan, setMenyimpan] = useState(false);

  const [dukungBiometrik, setDukungBiometrik] = useState<boolean | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [sedangUnggah, setSedangUnggah] = useState(false);

  const [sedangCadang, setSedangCadang] = useState(false);
  const [sedangPulih, setSedangPulih] = useState(false);
  const [modalReset, setModalReset] = useState(false);
  const [konfirmasi, setKonfirmasi] = useState('');
  const [sedangReset, setSedangReset] = useState(false);

  const inputAvatar = useRef<HTMLInputElement>(null);
  const inputPulih = useRef<HTMLInputElement>(null);

  // Ambil baris preferensi milik pengguna. Bila barisnya belum ada, pakai nilai
  // bawaan di layar — barisnya baru benar-benar dibuat saat pengguna menyimpan.
  useEffect(() => {
    let batal = false;
    (async () => {
      try {
        const uid = await idPengguna();
        if (!uid) throw new Error('Sesi kamu sudah berakhir. Silakan masuk ulang.');
        const rows = await safeMutate<BarisTabel[]>(
          supabase.from('user_preferences').select(KOLOM_PREFERENSI).eq('user_id', uid).limit(1),
          'Gagal memuat preferensi',
        );
        if (batal) return;
        const isi = rows?.[0] ? normalkan(rows[0]) : BAWAAN;
        setPrefs(isi);
        setSkala(isi.font_scale);
      } catch (e) {
        if (!batal) toast.error(pesanError(e, 'Gagal memuat preferensi'));
      } finally {
        if (!batal) setMemuat(false);
      }
    })();
    return () => {
      batal = true;
    };
  }, []);

  // Sidik jari hanya boleh ditawarkan kalau perangkatnya memang punya pemindai.
  // Menjanjikan fitur yang tidak ada bikin pengguna terkunci di luar aplikasinya sendiri.
  useEffect(() => {
    let batal = false;
    (async () => {
      try {
        if (typeof window === 'undefined' || !window.PublicKeyCredential) {
          if (!batal) setDukungBiometrik(false);
          return;
        }
        const ada = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
        if (!batal) setDukungBiometrik(ada === true);
      } catch (e) {
        console.error('[BIOMETRIK] gagal memeriksa dukungan perangkat', e);
        if (!batal) setDukungBiometrik(false);
      }
    })();
    return () => {
      batal = true;
    };
  }, []);

  // Tema dipasang sebagai penanda di elemen akar supaya seluruh halaman ikut,
  // bukan hanya halaman ini. Pilihan "ikut sistem" diterjemahkan dulu ke gelap/terang
  // karena CSS butuh nilai pasti, dan ikut berubah saat sistem berganti mode.
  useEffect(() => {
    const akar = document.documentElement;
    if (prefs.theme !== 'system') {
      akar.setAttribute('data-theme', prefs.theme);
      return;
    }
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const terapkan = () => akar.setAttribute('data-theme', media.matches ? 'dark' : 'light');
    terapkan();
    media.addEventListener('change', terapkan);
    return () => media.removeEventListener('change', terapkan);
  }, [prefs.theme]);

  // Persen, bukan piksel: ukuran huruf bawaan peramban pengguna (yang mungkin
  // sudah diperbesar sendiri untuk alasan penglihatan) tetap dihormati.
  useEffect(() => {
    document.documentElement.style.fontSize = `${Math.round(batasi(skala, SKALA_MIN, SKALA_MAX) * 100)}%`;
  }, [skala]);

  // Bucket 'receipts' bersifat privat, jadi foto tidak bisa dipasang langsung —
  // harus lewat tautan bertanda tangan yang masa berlakunya terbatas.
  useEffect(() => {
    let batal = false;
    const path = prefs.avatar_url;
    if (!path) {
      setAvatarUrl(null);
      return;
    }
    (async () => {
      const url = await urlStruk(path);
      if (!batal) setAvatarUrl(url);
    })();
    return () => {
      batal = true;
    };
  }, [prefs.avatar_url]);

  /**
   * Menyimpan perubahan ke database.
   * Tampilan diubah lebih dulu supaya terasa responsif, TAPI dikembalikan lagi
   * bila penyimpanan gagal — kalau tidak, layar akan berbohong soal apa yang tersimpan.
   */
  const simpan = useCallback(
    async (perubahan: Partial<Preferensi>, pesanSukses: string) => {
      const sebelum = prefs;
      const sesudah: Preferensi = { ...prefs, ...perubahan };
      setPrefs(sesudah);
      setSkala(sesudah.font_scale);
      setMenyimpan(true);
      try {
        const uid = await idPengguna();
        if (!uid) throw new Error('Sesi kamu sudah berakhir. Silakan masuk ulang.');
        await safeMutate(
          supabase.from('user_preferences').upsert(
            { user_id: uid, ...sesudah, updated_at: new Date().toISOString() },
            { onConflict: 'user_id' },
          ),
          'Gagal menyimpan preferensi',
        );
        toast.success(pesanSukses);
      } catch (e) {
        setPrefs(sebelum);
        setSkala(sebelum.font_scale);
        toast.error(pesanError(e, 'Gagal menyimpan preferensi'));
      } finally {
        setMenyimpan(false);
      }
    },
    [prefs],
  );

  const simpanSkala = useCallback(() => {
    const bulat = Math.round(batasi(skala, SKALA_MIN, SKALA_MAX) * 100) / 100;
    if (bulat === prefs.font_scale) return;
    void simpan({ font_scale: bulat }, 'Ukuran huruf disimpan');
  }, [skala, prefs.font_scale, simpan]);

  const handleAvatar = async (e: ChangeEvent<HTMLInputElement>) => {
    const berkas = e.target.files?.[0];
    // Nilai input dikosongkan lebih dulu supaya memilih foto yang sama dua kali tetap terbaca.
    e.target.value = '';
    if (!berkas) return;
    if (!berkas.type.startsWith('image/')) {
      toast.error('Berkas yang dipilih bukan gambar');
      return;
    }

    setSedangUnggah(true);
    const id = toast.loading('Memadatkan dan mengunggah foto…');
    try {
      const padat = await compressImage(berkas);
      const path = await unggahStruk(padat);
      if (!path) throw new Error('Foto gagal diunggah ke penyimpanan. Coba lagi.');

      const uid = await idPengguna();
      if (!uid) throw new Error('Sesi kamu sudah berakhir. Silakan masuk ulang.');
      await safeMutate(
        supabase.from('user_preferences').upsert(
          { user_id: uid, ...prefs, avatar_url: path, updated_at: new Date().toISOString() },
          { onConflict: 'user_id' },
        ),
        'Gagal menyimpan foto profil',
      );

      setPrefs((lama) => ({ ...lama, avatar_url: path }));
      toast.success(`Foto profil diperbarui (${formatKB(padat.size)})`, { id });
    } catch (err) {
      toast.error(pesanError(err, 'Gagal mengganti foto profil'), { id });
    } finally {
      setSedangUnggah(false);
    }
  };

  const handleCadangkan = async () => {
    setSedangCadang(true);
    const id = toast.loading('Menyiapkan berkas cadangan…');
    try {
      const uid = await idPengguna();
      if (!uid) throw new Error('Sesi kamu sudah berakhir. Silakan masuk ulang.');

      const isi: Record<string, BarisTabel[]> = {};
      let total = 0;
      for (const t of TABEL_DATA) {
        const rows = await safeMutate<BarisTabel[]>(
          supabase.from(t.tabel).select('*').eq('user_id', uid),
          `Gagal membaca ${t.label}`,
        );
        isi[t.tabel] = rows ?? [];
        total += rows?.length ?? 0;
      }

      const berkas = {
        aplikasi: 'DuitKita',
        versi: 2,
        dibuat_pada: new Date().toISOString(),
        user_id: uid,
        data: isi,
      };

      const blob = new Blob([JSON.stringify(berkas, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const tautan = document.createElement('a');
      tautan.href = url;
      tautan.download = `duitkita-cadangan-${new Date().toISOString().slice(0, 10)}.json`;
      tautan.click();
      // Pencabutan ditunda: sebagian peramban ponsel membatalkan unduhan bila
      // alamat sementara dicabut pada detik yang sama.
      setTimeout(() => URL.revokeObjectURL(url), 2000);

      toast.success(`Cadangan siap: ${total} baris data terunduh`, { id });
    } catch (e) {
      toast.error(pesanError(e, 'Gagal membuat cadangan'), { id });
    } finally {
      setSedangCadang(false);
    }
  };

  const handlePulihkan = async (e: ChangeEvent<HTMLInputElement>) => {
    const berkas = e.target.files?.[0];
    e.target.value = '';
    if (!berkas) return;

    setSedangPulih(true);
    const id = toast.loading('Memulihkan data dari berkas…');
    try {
      const uid = await idPengguna();
      if (!uid) throw new Error('Sesi kamu sudah berakhir. Silakan masuk ulang.');

      const teks = await berkas.text();
      let terurai: unknown;
      try {
        terurai = JSON.parse(teks);
      } catch {
        throw new Error('Berkas ini bukan JSON cadangan DuitKita yang sah.');
      }
      if (!terurai || typeof terurai !== 'object') {
        throw new Error('Isi berkas tidak dikenali.');
      }

      // Menerima dua bentuk: berkas resmi (punya kunci "data") dan berkas lama
      // yang tabelnya langsung di tingkat teratas.
      const akar = terurai as Record<string, unknown>;
      const sumberMentah = akar.data && typeof akar.data === 'object' ? akar.data : akar;
      const sumber = sumberMentah as Record<string, unknown>;

      const laporan: string[] = [];
      const gagal: string[] = [];
      let total = 0;

      for (const t of TABEL_DATA) {
        const mentah = sumber[t.tabel];
        if (!Array.isArray(mentah) || mentah.length === 0) continue;
        const baris = bersihkanBaris(mentah as BarisTabel[], uid, t.buang);
        if (baris.length === 0) continue;
        try {
          let masuk = 0;
          for (const bagian of potong(baris, 400)) {
            // upsert by id: aman diulang, memulihkan berkas yang sama dua kali
            // tidak menggandakan baris.
            const hasil = await safeMutate<{ id: string }[]>(
              supabase.from(t.tabel).upsert(bagian, { onConflict: 'id' }).select('id'),
              `Gagal memulihkan ${t.label}`,
            );
            masuk += hasil?.length ?? 0;
          }
          if (masuk > 0) laporan.push(`${t.label} ${masuk}`);
          total += masuk;
        } catch (err) {
          gagal.push(`${t.label}: ${pesanError(err, 'ditolak')}`);
        }
      }

      if (total > 0) {
        toast.success(`Masuk ${total} baris — ${laporan.join(', ')}`, { id, duration: 7000 });
      } else {
        toast.error(
          gagal.length > 0 ? 'Tidak ada satu baris pun yang masuk.' : 'Berkas tidak berisi data yang dikenali.',
          { id },
        );
      }
      if (gagal.length > 0) {
        toast.error(`Sebagian gagal — ${gagal.join(' · ')}`, { duration: 9000 });
      }

      await refreshAll();
    } catch (err) {
      toast.error(pesanError(err, 'Gagal memulihkan data'), { id });
    } finally {
      setSedangPulih(false);
    }
  };

  const handleReset = async () => {
    if (konfirmasi.trim() !== 'HAPUS') return;
    setSedangReset(true);
    const id = toast.loading('Menghapus data…');
    try {
      const uid = await idPengguna();
      if (!uid) throw new Error('Sesi kamu sudah berakhir. Silakan masuk ulang.');

      // Transaksi dihapus paling awal supaya saldo dompet dihitung ulang trigger
      // sebelum tabel lain menyusul.
      for (const t of TABEL_RESET) {
        await safeMutate(
          supabase.from(t.tabel).delete().eq('user_id', uid),
          `Gagal menghapus ${t.label}`,
        );
      }

      toast.success('Semua data keuangan sudah dihapus', { id });
      setModalReset(false);
      setKonfirmasi('');
      await refreshAll();
    } catch (e) {
      toast.error(pesanError(e, 'Gagal menghapus data'), { id });
    } finally {
      setSedangReset(false);
    }
  };

  const contohUang = useMemo(() => {
    const lokal = prefs.number_format === 'en' ? 'en-US' : 'id-ID';
    try {
      return new Intl.NumberFormat(lokal, {
        style: 'currency',
        currency: prefs.currency,
        maximumFractionDigits: 0,
      }).format(1234567);
    } catch {
      // Kode mata uang tak dikenal tidak boleh membuat halaman gagal render.
      return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        maximumFractionDigits: 0,
      }).format(1234567);
    }
  }, [prefs.number_format, prefs.currency]);

  const biometrikSiap = dukungBiometrik === true;
  const alasanBiometrik = biometrikSiap
    ? undefined
    : 'Perangkat atau peramban ini tidak menyediakan pemindai sidik jari/wajah.';
  const janjiPalsu = !biometrikSiap && prefs.unlock_method !== 'pin';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="page pb-24 relative z-10"
    >
      <header className="flex flex-col items-center mb-8">
        <div className="text-brand-300 mb-2 drop-shadow-[0_0_15px_rgba(45,212,191,0.45)]">
          <SlidersHorizontal size={56} />
        </div>
        <h1 className="text-2xl font-bold text-white text-center tracking-tight">Preferensi &amp; Data</h1>
        <p className="text-white/70 text-sm text-center mt-1">
          Atur tampilan, keamanan, dan cadangan data kamu.
        </p>
      </header>

      {memuat ? (
        <div className="space-y-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="skeleton h-32 rounded-4xl" />
          ))}
        </div>
      ) : (
        <div className="space-y-5">
          {/* ---------- Foto profil ---------- */}
          <Kartu ikon={<ImagePlus size={20} />} judul="Foto Profil" catatan="Gambar dipadatkan otomatis sebelum diunggah.">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 shrink-0 rounded-2xl overflow-hidden bg-white/10 flex items-center justify-center text-white/70">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="Foto profil kamu" className="w-full h-full object-cover" />
                ) : (
                  <UserIcon size={26} />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-white/70">
                  Ukuran maksimal {TARGET_KB} KB. Foto disimpan di penyimpanan pribadi kamu.
                </p>
              </div>
              <input
                ref={inputAvatar}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatar}
              />
              <button
                type="button"
                onClick={() => inputAvatar.current?.click()}
                disabled={sedangUnggah}
                className="btn-ghost shrink-0"
              >
                {sedangUnggah ? <Loader2 size={18} className="animate-spin" /> : <ImagePlus size={18} />}
                Ganti
              </button>
            </div>
          </Kartu>



          {/* ---------- Ukuran huruf ---------- */}
          <Kartu ikon={<Type size={20} />} judul="Ukuran Huruf" catatan="Geser lalu lepas — perubahan langsung terlihat dan otomatis tersimpan.">
            <div className="flex items-center gap-4">
              <span className="text-white/70 text-micro font-semibold">Kecil</span>
              <input
                type="range"
                min={SKALA_MIN}
                max={SKALA_MAX}
                step={0.05}
                value={skala}
                aria-label="Skala ukuran huruf"
                onChange={(e) => setSkala(Number(e.target.value))}
                onPointerUp={simpanSkala}
                onTouchEnd={simpanSkala}
                onKeyUp={simpanSkala}
                onBlur={simpanSkala}
                disabled={menyimpan}
                className="flex-1 h-11 accent-brand-400 cursor-pointer"
              />
              <span className="text-white/70 text-micro font-semibold">Besar</span>
            </div>
            <p className="text-white/70 text-sm">
              Skala sekarang: <span className="text-white font-bold">{skala.toFixed(2)}×</span>
              {Math.round(skala * 100) / 100 !== prefs.font_scale && (
                <span className="text-warn-400 ml-2">belum tersimpan</span>
              )}
            </p>
          </Kartu>

          {/* ---------- Format angka ---------- */}
          <Kartu ikon={<Hash size={20} />} judul="Format Angka" catatan={`Contoh tampilan: ${contohUang}`}>
            <Segmen<FormatAngka>
              nilai={prefs.number_format}
              sibuk={menyimpan}
              onPilih={(v) => void simpan({ number_format: v }, 'Format angka disimpan')}
              opsi={[
                { nilai: 'id', label: 'Indonesia', keterangan: '1.234,56' },
                { nilai: 'en', label: 'Internasional', keterangan: '1,234.56' },
              ]}
            />
          </Kartu>



          {/* ---------- Mata uang ---------- */}
          <Kartu ikon={<Coins size={20} />} judul="Mata Uang Bawaan" catatan="Dipakai saat menampilkan nominal di seluruh aplikasi.">
            <select
              value={prefs.currency}
              disabled={menyimpan}
              aria-label="Mata uang bawaan"
              onChange={(e) => void simpan({ currency: e.target.value }, 'Mata uang disimpan')}
              className="field appearance-none"
            >
              <option value="IDR" className="bg-ink-800">Rupiah (IDR)</option>
              <option value="USD" className="bg-ink-800">Dolar Amerika (USD)</option>
              <option value="EUR" className="bg-ink-800">Euro (EUR)</option>
              <option value="SGD" className="bg-ink-800">Dolar Singapura (SGD)</option>
              <option value="MYR" className="bg-ink-800">Ringgit Malaysia (MYR)</option>
              <option value="JPY" className="bg-ink-800">Yen Jepang (JPY)</option>
              <option value="AUD" className="bg-ink-800">Dolar Australia (AUD)</option>
            </select>
          </Kartu>

          {/* ---------- Cara membuka aplikasi ---------- */}
          <Kartu ikon={<ShieldCheck size={20} />} judul="Cara Membuka Aplikasi" catatan="Dipakai setiap kali aplikasi dibuka kembali.">
            <Segmen<CaraBuka>
              nilai={prefs.unlock_method}
              sibuk={menyimpan || dukungBiometrik === null}
              onPilih={(v) => void simpan({ unlock_method: v }, 'Cara membuka aplikasi disimpan')}
              opsi={[
                { nilai: 'pin', label: 'PIN', ikon: <KeyRound size={18} /> },
                {
                  nilai: 'biometric',
                  label: 'Sidik Jari',
                  ikon: <Fingerprint size={18} />,
                  nonaktif: !biometrikSiap,
                  alasan: alasanBiometrik,
                },
                {
                  nilai: 'both',
                  label: 'Keduanya',
                  ikon: <ShieldCheck size={18} />,
                  nonaktif: !biometrikSiap,
                  alasan: alasanBiometrik,
                },
              ]}
            />

            {dukungBiometrik === null && (
              <p className="text-white/70 text-sm flex items-center gap-2">
                <Loader2 size={16} className="animate-spin" />
                Memeriksa dukungan sidik jari di perangkat ini…
              </p>
            )}
            {dukungBiometrik === false && (
              <p className="text-white/70 text-sm">
                Sidik jari tidak bisa dipakai di sini. {alasanBiometrik} Aplikasi tetap dibuka dengan PIN.
              </p>
            )}
            {janjiPalsu && (
              <div className="glass rounded-2xl p-3 flex items-start gap-3 border-warn-400/40">
                <AlertTriangle size={18} className="text-warn-400 shrink-0 mt-0.5" />
                <p className="text-sm text-white/80">
                  Pilihan sidik jari memang tersimpan, tapi perangkat ini tidak mendukungnya —
                  jadi aplikasi tetap terbuka memakai PIN. Jangan mengandalkan sidik jari di perangkat ini.
                </p>
              </div>
            )}
          </Kartu>

          {/* ---------- Siklus Bulanan ---------- */}
          <Kartu ikon={<Calendar size={20} />} judul="Tanggal Mulai Bulan" catatan="Dipakai sebagai acuan perhitungan Anggaran dan Laporan bulanan.">
            <div className="flex items-center gap-3">
              <span className="text-white/70 text-sm">Tanggal</span>
              <select
                value={String(prefs.tanggal_mulai_bulan)}
                disabled={menyimpan}
                aria-label="Tanggal mulai bulan"
                onChange={(e) => void simpan({ tanggal_mulai_bulan: Number(e.target.value) }, 'Siklus bulanan disimpan')}
                className="field appearance-none flex-1"
              >
                {Array.from({ length: 31 }, (_, i) => i + 1).map((tgl) => (
                  <option key={tgl} value={tgl} className="bg-ink-800">
                    {tgl} {tgl === 1 ? '(Default)' : ''}
                  </option>
                ))}
              </select>
            </div>
          </Kartu>

          {/* ---------- Pengingat jatuh tempo ---------- */}
          <Kartu ikon={<BellRing size={20} />} judul="Pengingat Jatuh Tempo" catatan="Berlaku untuk hutang, piutang, dan tagihan berulang.">
            <select
              value={String(prefs.reminder_days_before)}
              disabled={menyimpan}
              aria-label="Berapa hari sebelum jatuh tempo diingatkan"
              onChange={(e) =>
                void simpan({ reminder_days_before: Number(e.target.value) }, 'Pengingat disimpan')
              }
              className="field appearance-none"
            >
              <option value="0" className="bg-ink-800">Tepat di hari jatuh tempo</option>
              <option value="1" className="bg-ink-800">1 hari sebelumnya</option>
              <option value="2" className="bg-ink-800">2 hari sebelumnya</option>
              <option value="3" className="bg-ink-800">3 hari sebelumnya</option>
              <option value="5" className="bg-ink-800">5 hari sebelumnya</option>
              <option value="7" className="bg-ink-800">7 hari sebelumnya</option>
              <option value="14" className="bg-ink-800">14 hari sebelumnya</option>
            </select>
          </Kartu>

          {/* ---------- Data ---------- */}
          <Kartu
            ikon={<Database size={20} />}
            judul="Cadangan &amp; Pemulihan"
            catatan="Berkas cadangan berisi dompet, transaksi, hutang, target tabungan, anggaran, dan transaksi berulang."
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <button type="button" onClick={handleCadangkan} disabled={sedangCadang} className="btn-ghost w-full">
                {sedangCadang ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
                Cadangkan (unduh JSON)
              </button>

              <input
                ref={inputPulih}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={handlePulihkan}
              />
              <button
                type="button"
                onClick={() => inputPulih.current?.click()}
                disabled={sedangPulih}
                className="btn-ghost w-full"
              >
                {sedangPulih ? <Loader2 size={18} className="animate-spin" /> : <Upload size={18} />}
                Pulihkan dari berkas
              </button>
            </div>
            
            <div className="pt-2 border-t border-white/10 mt-2">
              <button 
                type="button" 
                onClick={() => navigate('/import')} 
                className="btn-ghost w-full flex items-center justify-center gap-2 bg-brand-500/10 text-brand-400 hover:bg-brand-500/20 transition-colors border border-brand-500/30"
              >
                <Plus size={18} />
                Impor dari Aplikasi Kompetitor (Excel / PDF)
              </button>
            </div>
            <p className="text-white/70 text-sm mt-2">
              Saat memulihkan JSON, baris dengan nomor yang sama akan ditimpa, bukan digandakan.
              Saldo dompet dihitung ulang otomatis dari transaksinya.
            </p>
          </Kartu>

          {/* ---------- Reset ---------- */}
          <section className="glass rounded-4xl p-5 space-y-4 border-danger-500/40">
            <div className="flex items-start gap-3">
              <div className="bg-danger-500/15 text-danger-400 p-3 rounded-2xl shrink-0">
                <AlertTriangle size={20} />
              </div>
              <div className="min-w-0">
                <h2 className="text-white font-bold">Hapus Semua Data Keuangan</h2>
                <p className="text-white/70 text-sm mt-1">
                  Tindakan ini tidak bisa dibatalkan dan tidak ada tombol urungkan.
                </p>
              </div>
            </div>
            <button type="button" onClick={() => setModalReset(true)} className="btn-danger w-full">
              <Trash2 size={18} />
              Reset Data Saya
            </button>
          </section>
        </div>
      )}

      <Portal>
        <AnimatePresence>
          {modalReset && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => !sedangReset && setModalReset(false)}
                className="absolute inset-0 bg-ink-950/70 backdrop-blur-md"
              />
              <motion.div
                initial={{ scale: 0.94, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.94, opacity: 0 }}
                transition={{ type: 'spring', damping: 20, stiffness: 90 }}
                role="dialog"
                aria-modal="true"
                aria-labelledby="judul-reset"
                className="glass-strong rounded-4xl p-6 w-full max-w-md relative z-[61] max-h-[85dvh] overflow-y-auto thin-scrollbar"
              >
                <button
                  type="button"
                  onClick={() => !sedangReset && setModalReset(false)}
                  aria-label="Tutup"
                  className="icon-btn absolute top-4 right-4"
                >
                  <X size={20} />
                </button>

                <h2 id="judul-reset" className="text-xl font-bold text-white pr-10">
                  Hapus semua data keuangan?
                </h2>

                <p className="text-white/80 text-sm mt-3">Yang akan dihapus permanen:</p>
                <ul className="mt-2 space-y-1.5">
                  {TABEL_RESET.map((t) => (
                    <li key={t.tabel} className="text-white/80 text-sm flex items-center gap-2">
                      <Trash2 size={14} className="text-danger-400 shrink-0" />
                      {t.label}
                    </li>
                  ))}
                </ul>

                <div className="glass rounded-2xl p-3 mt-4 space-y-2">
                  <p className="text-white/80 text-sm">
                    Dompet, akun, PIN, dan preferensi di halaman ini <span className="font-bold">tidak</span> ikut terhapus.
                    Saldo tiap dompet akan kembali ke saldo awalnya karena seluruh transaksinya hilang.
                  </p>
                  <p className="text-white/80 text-sm">
                    Data yang sudah dihapus tidak bisa dikembalikan kecuali kamu punya berkas cadangan.
                    Sebaiknya tekan &quot;Cadangkan&quot; dulu sebelum lanjut.
                  </p>
                </div>

                <label className="label mt-4" htmlFor="ketik-hapus">
                  Ketik HAPUS untuk mengaktifkan tombolnya
                </label>
                <input
                  id="ketik-hapus"
                  type="text"
                  autoComplete="off"
                  value={konfirmasi}
                  onChange={(e) => setKonfirmasi(e.target.value)}
                  placeholder="HAPUS"
                  className="field text-center tracking-[0.3em] font-bold"
                />

                <div className="flex gap-3 mt-5">
                  <button
                    type="button"
                    onClick={() => setModalReset(false)}
                    disabled={sedangReset}
                    className="btn-ghost flex-1"
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    onClick={handleReset}
                    disabled={konfirmasi.trim() !== 'HAPUS' || sedangReset}
                    className="btn-danger flex-1"
                  >
                    {sedangReset ? <Loader2 size={18} className="animate-spin" /> : <Trash2 size={18} />}
                    Hapus Sekarang
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </Portal>
    </motion.div>
  );
}

/* ---------- bagian kecil yang dipakai ulang ---------- */

function Kartu({
  ikon,
  judul,
  catatan,
  children,
}: {
  ikon: ReactNode;
  judul: string;
  catatan?: string;
  children: ReactNode;
}) {
  return (
    <section className="glass rounded-4xl p-5 space-y-4">
      <div className="flex items-start gap-3">
        <div className="bg-brand-500/15 text-brand-300 p-3 rounded-2xl shrink-0">{ikon}</div>
        <div className="min-w-0">
          <h2 className="text-white font-bold">{judul}</h2>
          {catatan && <p className="text-white/70 text-sm mt-1">{catatan}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

interface OpsiSegmen<T extends string> {
  nilai: T;
  label: string;
  ikon?: ReactNode;
  keterangan?: string;
  nonaktif?: boolean;
  alasan?: string;
}

function Segmen<T extends string>({
  nilai,
  opsi,
  sibuk,
  onPilih,
}: {
  nilai: T;
  opsi: OpsiSegmen<T>[];
  sibuk: boolean;
  onPilih: (v: T) => void;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      {opsi.map((o) => {
        const aktif = o.nilai === nilai;
        return (
          <button
            key={o.nilai}
            type="button"
            onClick={() => !o.nonaktif && onPilih(o.nilai)}
            disabled={sibuk || o.nonaktif}
            aria-pressed={aktif}
            title={o.nonaktif ? o.alasan : undefined}
            className={`btn flex-col gap-1 px-4 py-3 border text-sm ${
              aktif
                ? 'bg-brand-500/20 border-brand-400/60 text-white shadow-glow-brand'
                : 'bg-white/5 border-white/15 text-white/70 hover:bg-white/10'
            }`}
          >
            <span className="flex items-center gap-2">
              {o.ikon}
              {o.label}
            </span>
            {o.keterangan && <span className="text-micro font-normal text-white/70">{o.keterangan}</span>}
          </button>
        );
      })}
    </div>
  );
}
