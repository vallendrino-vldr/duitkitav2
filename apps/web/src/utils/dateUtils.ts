/**
 * Mengembalikan rentang tanggal untuk suatu siklus bulan kustom.
 *
 * Logika "Maju" (Option A):
 * Laporan/Anggaran untuk suatu bulan (misal Agustus) dimulai pada `startDay` di bulan tersebut,
 * hingga `startDay` di bulan berikutnya.
 * Contoh: Agustus, startDay = 25 -> 25 Agustus 00:00 s.d 25 September 00:00 (eksklusif)
 *
 * @param year Tahun (contoh: 2026)
 * @param month Bulan (0-indexed: 0 = Januari, 11 = Desember)
 * @param startDay Tanggal mulai (1-31)
 */
export function rentangSiklus(year: number, month: number, startDay: number): { mulai: Date; selesai: Date } {
  // JavaScript Date otomatis memperbaiki tanggal yang melebihi jumlah hari di suatu bulan.
  // Misalnya: new Date(2026, 1, 31) -> 3 Maret 2026 (jika Februari ada 28 hari).
  const mulai = new Date(year, month, startDay);
  const selesai = new Date(year, month + 1, startDay);

  return { mulai, selesai };
}
