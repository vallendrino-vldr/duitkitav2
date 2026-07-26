import imageCompression from 'browser-image-compression';

/** Batas keras: 75 KB per gambar, demi kuota Supabase gratisan. */
export const TARGET_KB = 75;
const TARGET_BYTES = TARGET_KB * 1024;

/** Dukungan WebP dicek sekali, bukan tiap kali kompres. */
let dukungWebp: boolean | null = null;
function browserDukungWebp(): boolean {
  if (dukungWebp !== null) return dukungWebp;
  try {
    const c = document.createElement('canvas');
    c.width = c.height = 1;
    dukungWebp = c.toDataURL('image/webp').startsWith('data:image/webp');
  } catch {
    dukungWebp = false;
  }
  return dukungWebp;
}

export interface HasilKompresi {
  file: File;
  bytesAsli: number;
  bytesAkhir: number;
  /** true bila setelah semua percobaan masih melebihi 75 KB. */
  masihBesar: boolean;
}

/**
 * Menekan gambar sampai <= 75 KB.
 *
 * Versi lama hanya sekali jalan dengan target 0.075 MB lalu menerima apa pun
 * hasilnya — untuk foto struk yang panjang dan penuh teks, hasilnya sering
 * masih di atas 200 KB tanpa ada yang memberi tahu. Sekarang ukurannya
 * diperiksa dan dicoba ulang dengan mutu/dimensi menurun sampai benar-benar muat.
 *
 * WebP dicoba lebih dulu karena pada mutu setara ukurannya jauh lebih kecil
 * daripada JPEG, jadi struk tetap terbaca di ukuran yang sama.
 */
export async function compressImageDetail(file: File): Promise<HasilKompresi> {
  const bytesAsli = file.size;
  const pakaiWebp = browserDukungWebp();
  const tipe = pakaiWebp ? 'image/webp' : 'image/jpeg';

  // Tiap langkah makin agresif. Berhenti begitu sudah muat.
  const langkah = [
    { maxWidthOrHeight: 1600, initialQuality: 0.72 },
    { maxWidthOrHeight: 1280, initialQuality: 0.62 },
    { maxWidthOrHeight: 1024, initialQuality: 0.5 },
    { maxWidthOrHeight: 860,  initialQuality: 0.4 },
    { maxWidthOrHeight: 720,  initialQuality: 0.3 },
  ];

  let terbaik: File = file;

  for (const opsi of langkah) {
    try {
      const blob = await imageCompression(file, {
        maxSizeMB: TARGET_BYTES / (1024 * 1024),
        useWebWorker: true,
        fileType: tipe,
        ...opsi,
      });

      const namaDasar = file.name.replace(/\.[^.]+$/, '');
      const ext = pakaiWebp ? 'webp' : 'jpg';
      const hasil = new File([blob], `${namaDasar}.${ext}`, {
        type: tipe,
        lastModified: Date.now(),
      });

      if (hasil.size < terbaik.size || terbaik === file) terbaik = hasil;
      if (hasil.size <= TARGET_BYTES) {
        return { file: hasil, bytesAsli, bytesAkhir: hasil.size, masihBesar: false };
      }
    } catch (error) {
      console.error('[KOMPRES] satu langkah gagal, lanjut ke langkah berikutnya', error);
    }
  }

  return {
    file: terbaik,
    bytesAsli,
    bytesAkhir: terbaik.size,
    masihBesar: terbaik.size > TARGET_BYTES,
  };
}

/** Bentuk sederhana: langsung kembalikan file-nya saja. */
export async function compressImage(file: File): Promise<File> {
  const { file: hasil } = await compressImageDetail(file);
  return hasil;
}

export function formatKB(bytes: number): string {
  return `${(bytes / 1024).toFixed(0)} KB`;
}
