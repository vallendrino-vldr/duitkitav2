import { ReactNode, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * Memindahkan isinya ke <body>, keluar dari pohon halaman.
 *
 * Kenapa perlu: setiap halaman dibungkus <motion.div> yang menganimasikan
 * posisi. Elemen yang punya `transform` menjadi "titik nol" baru bagi anak-anaknya,
 * sehingga `position: fixed` di dalamnya TIDAK lagi mengacu ke layar, melainkan
 * ke kotak halaman itu. Itulah sebabnya overlay kamera bisa melenceng, terpotong
 * oleh `overflow-hidden`, dan tertimpa navbar. Dengan dipindah ke <body>,
 * `fixed` kembali berarti "menempel ke layar".
 */
export default function Portal({ children }: { children: ReactNode }) {
  const [siap, setSiap] = useState(false);

  // Portal baru dipasang setelah komponen menempel, supaya aman saat render awal.
  useEffect(() => {
    setSiap(true);
    return () => setSiap(false);
  }, []);

  if (!siap || typeof document === 'undefined') return null;
  return createPortal(children, document.body);
}
