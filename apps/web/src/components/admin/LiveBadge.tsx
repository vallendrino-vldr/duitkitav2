import { useEffect, useState } from 'react';

interface LiveBadgeProps {
  lastUpdated: Date | null;
  label?: string;
}

function selisih(dari: Date): string {
  const detik = Math.max(0, Math.floor((Date.now() - dari.getTime()) / 1000));
  if (detik < 5) return 'baru saja';
  if (detik < 60) return `${detik} detik lalu`;
  const menit = Math.floor(detik / 60);
  if (menit < 60) return `${menit} menit lalu`;
  return `${Math.floor(menit / 60)} jam lalu`;
}

/** Titik berdenyut + waktu pembaruan terakhir, supaya jelas datanya masih hidup. */
export default function LiveBadge({ lastUpdated, label }: LiveBadgeProps) {
  const [, paksaRender] = useState(0);

  // Teks "x detik lalu" harus ikut berjalan walau datanya belum berubah.
  useEffect(() => {
    const t = setInterval(() => paksaRender((n) => n + 1), 5000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="flex items-center gap-2 text-micro text-white/70" aria-live="polite">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full rounded-full bg-ok-400 opacity-75 animate-ping" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-ok-400" />
      </span>
      <span>{lastUpdated ? selisih(lastUpdated) : 'menyambung…'}</span>
      {label && <span className="text-white/70">· {label}</span>}
    </div>
  );
}
