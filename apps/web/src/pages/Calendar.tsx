import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, ArrowUpRight, ArrowDownRight, RefreshCw } from 'lucide-react';
import { useFinanceStore, Transaction } from '../store/useFinanceStore';
import TransactionEditor from '../components/TransactionEditor';

export default function Calendar() {
  const { transactions, wallets, refreshAll } = useFinanceStore();
  const safeTransactions = transactions || [];
  const safeWallets = wallets || [];

  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [trxDiedit, setTrxDiedit] = useState<Transaction | null>(null);

  const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
  const getFirstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();

  const prevMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));

  const formatIDR = (num: number) => new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0
  }).format(num);

  const monthName = currentDate.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
  const daysInMonth = getDaysInMonth(currentDate.getFullYear(), currentDate.getMonth());
  const firstDay = getFirstDayOfMonth(currentDate.getFullYear(), currentDate.getMonth());

  // Aggregate transactions by date string (YYYY-MM-DD)
  const transactionsByDate = useMemo(() => {
    const map = new Map<string, { income: number, expense: number, list: Transaction[] }>();
    safeTransactions.forEach(t => {
      if (!t.created_at) return;
      const d = new Date(t.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (!map.has(key)) map.set(key, { income: 0, expense: 0, list: [] });
      const record = map.get(key)!;
      record.list.push(t);
      if (t.type === 'income') record.income += t.amount;
      if (t.type === 'expense') record.expense += t.amount;
    });
    return map;
  }, [safeTransactions]);

  const selectedDateStr = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}`;
  const selectedDayData = transactionsByDate.get(selectedDateStr) || { income: 0, expense: 0, list: [] };

  const renderCalendar = () => {
    const blanks = Array.from({ length: firstDay }, (_, i) => <div key={`blank-${i}`} className="p-2"></div>);
    const days = Array.from({ length: daysInMonth }, (_, i) => {
      const dayNum = i + 1;
      const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
      const hasData = transactionsByDate.has(dateStr);
      const data = transactionsByDate.get(dateStr);
      const isSelected = selectedDate.getDate() === dayNum && selectedDate.getMonth() === currentDate.getMonth() && selectedDate.getFullYear() === currentDate.getFullYear();
      const isToday = new Date().getDate() === dayNum && new Date().getMonth() === currentDate.getMonth() && new Date().getFullYear() === currentDate.getFullYear();

      return (
        <button
          key={`day-${dayNum}`}
          onClick={() => setSelectedDate(new Date(currentDate.getFullYear(), currentDate.getMonth(), dayNum))}
          className={`relative p-2 min-h-[4rem] rounded-xl border flex flex-col items-center justify-start transition-all
            ${isSelected ? 'border-brand-400 bg-brand-500/20' : 'border-white/5 bg-white/5 hover:bg-white/10'}
            ${isToday && !isSelected ? 'border-white/30' : ''}
          `}
        >
          <span className={`text-sm font-bold ${isToday ? 'text-brand-300' : 'text-white'}`}>{dayNum}</span>
          {hasData && data && (
            <div className="mt-auto w-full flex flex-col gap-0.5">
              {data.expense > 0 && <span className="text-[9px] text-danger-400 font-bold truncate block w-full text-center">-{formatIDR(data.expense).replace('Rp', '')}</span>}
              {data.income > 0 && <span className="text-[9px] text-ok-400 font-bold truncate block w-full text-center">+{formatIDR(data.income).replace('Rp', '')}</span>}
            </div>
          )}
        </button>
      );
    });

    return [...blanks, ...days];
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="page pb-32 space-y-6"
    >
      <div className="flex justify-between items-center bg-white/5 backdrop-blur-lg border border-white/10 p-4 rounded-3xl shadow-xl">
        <button onClick={prevMonth} className="p-2 rounded-full hover:bg-white/10 text-white transition-colors">
          <ChevronLeft size={24} />
        </button>
        <h2 className="text-white font-bold text-lg flex items-center gap-2">
          <CalendarIcon size={20} className="text-brand-400" />
          {monthName}
        </h2>
        <button onClick={nextMonth} className="p-2 rounded-full hover:bg-white/10 text-white transition-colors">
          <ChevronRight size={24} />
        </button>
      </div>

      <div className="bg-white/5 backdrop-blur-lg border border-white/10 p-4 rounded-3xl shadow-xl">
        <div className="grid grid-cols-7 gap-1 mb-2">
          {['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'].map(d => (
            <div key={d} className="text-center text-xs font-semibold text-white/50">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-2">
          {renderCalendar()}
        </div>
      </div>

      <div className="bg-white/5 backdrop-blur-lg border border-white/10 p-5 rounded-3xl shadow-xl">
        <h3 className="text-white font-bold text-lg mb-4">
          Transaksi {selectedDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
        </h3>
        
        {selectedDayData.list.length > 0 ? (
          <div className="space-y-3">
            {selectedDayData.list.map(trx => (
              <button
                key={trx.id}
                type="button"
                onClick={() => setTrxDiedit(trx)}
                aria-label={`Ubah transaksi ${trx.title}`}
                className="w-full min-h-[56px] flex justify-between items-center gap-3 p-3 bg-white/5 border border-white/5 rounded-xl active:bg-white/10 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-10 h-10 shrink-0 rounded-xl flex items-center justify-center ${
                    trx.type === 'income' ? 'bg-ok-500/20 text-ok-400' :
                    trx.type === 'expense' ? 'bg-danger-500/20 text-danger-400' :
                    'bg-brand-500/20 text-brand-300'
                  }`}>
                    {trx.type === 'income' ? <ArrowDownRight size={20} /> :
                     trx.type === 'expense' ? <ArrowUpRight size={20} /> :
                     <RefreshCw size={20} />}
                  </div>
                  <div className="min-w-0 text-left">
                    <p className="text-white font-medium truncate">{trx.title}</p>
                    <p className="text-white/70 text-xs truncate">{trx.category || trx.type}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <p className={`font-bold tabular-nums ${
                    trx.type === 'income' ? 'text-ok-400' :
                    trx.type === 'expense' ? 'text-danger-400' : 'text-brand-300'
                  }`}>
                    {trx.type === 'income' ? '+' : trx.type === 'expense' ? '-' : ''}
                    {formatIDR(trx.amount)}
                  </p>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <p className="text-white/50 text-sm text-center py-4">Tidak ada transaksi pada tanggal ini.</p>
        )}
      </div>

      <TransactionEditor
        transaksi={trxDiedit}
        wallets={safeWallets}
        onTutup={() => setTrxDiedit(null)}
        onSelesai={() => {
          setTrxDiedit(null);
          void refreshAll();
        }}
      />
    </motion.div>
  );
}
