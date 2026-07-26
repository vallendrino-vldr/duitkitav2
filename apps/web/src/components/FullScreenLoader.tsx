interface FullScreenLoaderProps {
  label?: string;
}

/**
 * Layar tunggu bersama. Selalu merender sesuatu yang kelihatan — dipakai di
 * setiap cabang "sedang memuat" supaya tidak pernah ada layar kosong.
 */
export default function FullScreenLoader({ label = 'Menyiapkan…' }: FullScreenLoaderProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex-1 min-h-[60vh] flex flex-col items-center justify-center gap-4 bg-transparent"
    >
      <div className="w-10 h-10 border-4 border-teal-400 border-t-transparent rounded-full animate-spin" />
      <p className="text-teal-300 text-sm font-medium">{label}</p>
    </div>
  );
}
