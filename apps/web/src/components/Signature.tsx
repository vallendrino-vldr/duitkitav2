interface SignatureProps {
  /** `inline` untuk footer halaman, `float` untuk sudut layar. */
  variant?: 'inline' | 'float';
  className?: string;
}

/**
 * Tanda tangan pembuat aplikasi.
 *
 * Dibuat mencolok tapi tidak norak: teks gradien dengan kilau yang menyapu
 * pelan, bukan tulisan datar. `aria-label` memastikan pembaca layar
 * membacanya sebagai satu kalimat utuh, bukan potongan huruf.
 */
export default function Signature({ variant = 'inline', className = '' }: SignatureProps) {
  const isi = (
    <span className="relative inline-flex items-center gap-1.5">
      <span className="text-white/60 text-micro font-medium">made by</span>
      {/* overflow-hidden dipasang DI SINI, bukan di baris luar, supaya kilaunya
          terpotong rapi mengikuti lebar nama saja. */}
      <span className="relative inline-block overflow-hidden font-extrabold text-sm tracking-tight bg-gradient-to-r from-brand-300 via-white to-accent-300 bg-clip-text text-transparent">
        vadlyvldr
        {/* Kilau menyapu melintasi nama. */}
        <span
          aria-hidden="true"
          className="ambient absolute inset-0 animate-sheen pointer-events-none"
          style={{
            background:
              'linear-gradient(100deg, transparent 20%, rgba(255,255,255,0.55) 50%, transparent 80%)',
          }}
        />
      </span>
    </span>
  );

  if (variant === 'float') {
    return (
      <div
        aria-label="Dibuat oleh vadlyvldr"
        className={`fixed bottom-3 right-4 z-30 pointer-events-none select-none opacity-80 ${className}`}
      >
        {isi}
      </div>
    );
  }

  return (
    <div
      aria-label="Dibuat oleh vadlyvldr"
      className={`flex justify-center items-center py-3 select-none ${className}`}
    >
      {isi}
    </div>
  );
}
