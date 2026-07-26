import { useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useFinanceStore } from '../store/useFinanceStore';
import { subDays, format, isSameDay } from 'date-fns';

export default function CashflowChart() {
  const { transactions } = useFinanceStore();
  const safeTransactions = transactions || [];

  const data = useMemo(() => {
    const last7Days = Array.from({ length: 7 }).map((_, i) => subDays(new Date(), 6 - i)).reverse();
    
    return last7Days.map(date => {
      const dayTransactions = safeTransactions.filter(t => 
        isSameDay(new Date(t.created_at), date)
      );

      const income = dayTransactions
        .filter(t => t.type === 'income')
        .reduce((sum, t) => sum + Number(t.amount), 0);
        
      const expense = dayTransactions
        .filter(t => t.type === 'expense')
        .reduce((sum, t) => sum + Number(t.amount), 0);

      return {
        date: format(date, 'EEE'), // e.g. Mon, Tue
        income,
        expense
      };
    });
  }, [safeTransactions]);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    // Ditelusuri, bukan diakses lewat payload[0]/payload[1]: pada hari yang cuma
    // punya satu jenis transaksi, payload[1] itu undefined dan membaca .value
    // darinya menjatuhkan seluruh halaman begitu kursor menyentuh grafik.
    return (
      <div className="glass-strong p-3 rounded-xl">
        <p className="text-white font-bold mb-2">{label}</p>
        <div className="space-y-1">
          {payload.map((p: any) => (
            <p
              key={p.dataKey}
              className={`text-sm ${p.dataKey === 'income' ? 'text-brand-300' : 'text-danger-400'}`}
            >
              {p.dataKey === 'income' ? 'Masuk' : 'Keluar'}: Rp{' '}
              {Number(p.value ?? 0).toLocaleString('id-ID')}
            </p>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="w-full h-64 bg-white/5 backdrop-blur-lg border border-white/10 rounded-3xl p-4 shadow-xl">
      <h3 className="text-white/80 font-medium mb-4 ml-2">Cashflow (7 Hari)</h3>
      <div className="w-full h-48">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="colorIncome" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#2dd4bf" stopOpacity={0.4} />
                <stop offset="95%" stopColor="#2dd4bf" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="colorExpense" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#f87171" stopOpacity={0.4} />
                <stop offset="95%" stopColor="#f87171" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" vertical={false} />
            <XAxis dataKey="date" stroke="rgba(255,255,255,0.5)" fontSize={12} tickLine={false} axisLine={false} />
            <YAxis stroke="rgba(255,255,255,0.5)" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(value) => `Rp ${value >= 1000 ? value/1000 + 'k' : value}`} />
            <Tooltip content={<CustomTooltip />} />
            <Area type="monotone" dataKey="income" stroke="#2dd4bf" strokeWidth={3} fillOpacity={1} fill="url(#colorIncome)" />
            <Area type="monotone" dataKey="expense" stroke="#f87171" strokeWidth={3} fillOpacity={1} fill="url(#colorExpense)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
