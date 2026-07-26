import type { LucideIcon } from 'lucide-react';

interface StatCardProps {
  icon: LucideIcon;
  label: string;
  value: number | undefined;
  loading?: boolean;
  tone?: 'brand' | 'accent' | 'warn';
}

const warna = {
  brand: 'text-brand-300 bg-brand-400/15',
  accent: 'text-accent-300 bg-accent-500/15',
  warn: 'text-warn-400 bg-warn-400/15',
} as const;

export default function StatCard({ icon: Icon, label, value, loading, tone = 'brand' }: StatCardProps) {
  return (
    <div className="glass rounded-3xl p-4 flex flex-col gap-3">
      <div className={`w-10 h-10 rounded-xl inline-flex items-center justify-center ${warna[tone]}`}>
        <Icon size={20} />
      </div>
      <div>
        {/* Rangka pemuatan setinggi angka aslinya, supaya tata letak tidak
            melompat saat data datang. */}
        {loading && value === undefined ? (
          <div className="skeleton h-8 w-16 mb-1" />
        ) : (
          <p className="text-2xl font-extrabold tabular-nums leading-none mb-1">
            {(value ?? 0).toLocaleString('id-ID')}
          </p>
        )}
        <p className="text-micro font-medium text-white/70">{label}</p>
      </div>
    </div>
  );
}
