/**
 * Titik masuk API untuk Vercel.
 *
 * KENAPA BUKAN `api/[...slug].ts`:
 * Nama berkas tangkap-semua itu ternyata dibaca Vercel sebagai SATU segmen saja
 * pada proyek ini. Terbukti dari perilaku produksi: /api/health dan /api/scan
 * sampai ke Express (membalas JSON kita), sementara /api/scan/roast dan
 * /api/auth/lookup dijawab halaman 404 milik Vercel dan TIDAK PERNAH menyentuh
 * kode kita. Itulah sebabnya seluruh fitur AI mati di produksi.
 *
 * Sekarang seluruh /api/* diarahkan ke berkas ini lewat rewrite di vercel.json,
 * dengan jalur asli dititipkan pada parameter `__jalur`.
 *
 * Penyusunan ulang jalur dibuat berlapis karena perilaku rewrite bisa berbeda
 * antar konfigurasi: kalau satu lapis gagal, lapis berikutnya masih menyelamatkan.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { buatApp } from '../apps/api/src/app';

const app = buatApp();

/** Menolak nilai yang jelas bukan jalur sungguhan (mis. token yang gagal diisi). */
function jalurMasukAkal(nilai: string | null): nilai is string {
  if (!nilai) return false;
  if (nilai.includes(':')) return false;   // token rewrite tidak terinterpolasi
  if (nilai.startsWith('[')) return false; // sisa pola nama berkas
  return true;
}

export default function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    const asal = req.url || '/';
    const url = new URL(asal, 'http://internal');

    // Lapis 1 — jalur dititipkan oleh rewrite di vercel.json.
    const dariQuery = url.searchParams.get('__jalur');
    if (jalurMasukAkal(dariQuery)) {
      url.searchParams.delete('__jalur');
      const sisa = url.searchParams.toString();
      req.url = `/api/${dariQuery.replace(/^\/+/, '')}${sisa ? `?${sisa}` : ''}`;
    } else {
      // Lapis 2 — sebagian penyiapan meneruskan jalur asli lewat header.
      const dariHeader =
        (req.headers['x-vercel-original-path'] as string | undefined) ??
        (req.headers['x-forwarded-uri'] as string | undefined) ??
        (req.headers['x-original-uri'] as string | undefined);

      if (dariHeader && dariHeader.startsWith('/api/')) {
        req.url = dariHeader;
      } else if (dariQuery !== null) {
        // Lapis 3 — parameter ada tapi tidak terpakai: buang supaya tidak
        // ikut terbaca sebagai data oleh handler di bawah.
        url.searchParams.delete('__jalur');
        const sisa = url.searchParams.toString();
        req.url = `${url.pathname}${sisa ? `?${sisa}` : ''}`;
      }
    }
  } catch (e) {
    // Kegagalan mengurai URL tidak boleh menjatuhkan seluruh fungsi;
    // biarkan Express menangani permintaan apa adanya.
    console.error('[API] gagal menormalkan url:', e);
  }

  return (app as unknown as (q: IncomingMessage, s: ServerResponse) => void)(req, res);
}
