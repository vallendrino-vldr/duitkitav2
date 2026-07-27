import { useEffect } from 'react';

/**
 * Membekukan hiasan latar selagi pengguna menggulir atau menyentuh layar.
 *
 * Inilah perbedaan terbesar antara aplikasi yang terasa "web" dan yang terasa
 * "native". Hiasan latar berjalan tanpa henti, dan pada ponsel GPU-nya tidak
 * punya sisa tenaga untuk mengikuti jari — hasilnya gulir tersendat dan
 * sentuhan terasa telat. Dengan menjeda hiasan hanya selama interaksi,
 * seluruh tenaga dialihkan ke gerakan jari, lalu hiasannya kembali begitu
 * pengguna berhenti. Tampilannya tidak berkurang sedikit pun saat diam.
 *
 * Kelas dipasang di <html> supaya satu aturan CSS bisa menjangkau semua
 * hiasan sekaligus, termasuk yang di-portal ke luar pohon React.
 */
const KELAS = 'sedang-sibuk';
/** Jeda sebelum hiasan dinyalakan lagi; cukup untuk menutupi gulir momentum. */
const TENGGANG = 220;

export function useJedaSaatSibuk() {
  useEffect(() => {
    const akar = document.documentElement;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let sibuk = false;

    const mulai = () => {
      if (!sibuk) {
        sibuk = true;
        akar.classList.add(KELAS);
      }
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        sibuk = false;
        akar.classList.remove(KELAS);
      }, TENGGANG);
    };

    // passive: true — memberi tahu browser kita tidak akan membatalkan gulir,
    // sehingga gulir tidak perlu menunggu kode ini selesai dijalankan.
    const opsi = { passive: true } as AddEventListenerOptions;

    window.addEventListener('scroll', mulai, opsi);
    window.addEventListener('touchmove', mulai, opsi);
    window.addEventListener('touchstart', mulai, opsi);
    window.addEventListener('wheel', mulai, opsi);
    // Gulir terjadi di dalam wadah, bukan di jendela; tangkap pada fase capture.
    document.addEventListener('scroll', mulai, { passive: true, capture: true });

    // Tab tersembunyi: hentikan hiasan sepenuhnya agar tidak membuang baterai.
    const onVisibilitas = () => {
      if (document.hidden) akar.classList.add(KELAS);
      else akar.classList.remove(KELAS);
    };
    document.addEventListener('visibilitychange', onVisibilitas);

    return () => {
      if (timer) clearTimeout(timer);
      akar.classList.remove(KELAS);
      window.removeEventListener('scroll', mulai);
      window.removeEventListener('touchmove', mulai);
      window.removeEventListener('touchstart', mulai);
      window.removeEventListener('wheel', mulai);
      document.removeEventListener('scroll', mulai, true);
      document.removeEventListener('visibilitychange', onVisibilitas);
    };
  }, []);
}
