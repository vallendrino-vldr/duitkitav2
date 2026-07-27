import { useEffect, useState } from 'react';

export type Kualitas = 'penuh' | 'hemat';

/**
 * Menentukan seberapa berat efek visual boleh dijalankan pada perangkat ini.
 *
 * Ponsel kelas menengah punya GPU yang jauh lebih lemah daripada laptop, dan
 * efek seperti blur besar atau mode pencampuran warna harus dihitung ulang
 * setiap frame. Di layar sentuh, hasilnya terasa patah-patah persis saat
 * pengguna menggulir — momen yang paling ketara.
 *
 * Yang diperiksa:
 * - jumlah inti prosesor dan perkiraan memori perangkat
 * - apakah layarnya sentuh dan sempit (ciri ponsel)
 * - mode hemat data yang dinyalakan pengguna
 *
 * Catatan: ini soal KEHALUSAN, bukan selera. Tampilan tetap sama-sama mewah —
 * yang berubah hanya cara menggambarnya, bukan hasil akhirnya.
 */
function ukur(): Kualitas {
  if (typeof window === 'undefined') return 'penuh';

  const nav = navigator as Navigate & {
    deviceMemory?: number;
    connection?: { saveData?: boolean };
  };

  if (nav.connection?.saveData) return 'hemat';

  const inti = nav.hardwareConcurrency ?? 8;
  const memori = nav.deviceMemory ?? 8;
  const sempit = window.matchMedia('(max-width: 900px)').matches;
  const sentuh = window.matchMedia('(hover: none) and (pointer: coarse)').matches;

  if (inti <= 4 || memori <= 4) return 'hemat';
  if (sentuh && sempit) return 'hemat';

  return 'penuh';
}

type Navigate = Navigator;

export function useKualitasVisual(): Kualitas {
  // Dihitung sekali saat inisialisasi supaya render pertama sudah tepat dan
  // tidak ada kedipan dari kualitas tinggi ke rendah.
  const [kualitas, setKualitas] = useState<Kualitas>(ukur);

  useEffect(() => {
    // Memutar layar atau memindahkan jendela bisa mengubah lebar; ikuti.
    const mq = window.matchMedia('(max-width: 900px)');
    const onUbah = () => setKualitas(ukur());
    mq.addEventListener('change', onUbah);
    return () => mq.removeEventListener('change', onUbah);
  }, []);

  return kualitas;
}
