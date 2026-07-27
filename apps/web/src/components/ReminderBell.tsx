import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, Check, X, CreditCard, CalendarDays } from 'lucide-react';
import { useReminders } from '../lib/useReminders';
import Portal from './Portal';

export default function ReminderBell() {
  const { activeReminders, markCompleted, requestPermission } = useReminders();
  const [isOpen, setIsOpen] = useState(false);

  const handleOpen = () => {
    requestPermission();
    setIsOpen(true);
  };

  const pendingCount = activeReminders.length;

  return (
    <>
      <button
        onClick={handleOpen}
        className="relative p-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 transition-all text-white/90"
      >
        <Bell size={20} />
        {pendingCount > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-danger-500 rounded-full text-[10px] font-bold flex items-center justify-center shadow-lg border-2 border-slate-900">
            {pendingCount > 9 ? '9+' : pendingCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {isOpen && (
          <Portal>
            <div className="fixed inset-0 z-[100] flex items-start justify-center p-4 pt-16 sm:p-6 pointer-events-none">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-black/60 backdrop-blur-sm pointer-events-auto"
                onClick={() => setIsOpen(false)}
              />
              
              <motion.div
                initial={{ opacity: 0, y: -20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -20, scale: 0.95 }}
                className="relative w-full max-w-sm bg-slate-900 border border-white/15 rounded-3xl overflow-hidden shadow-2xl pointer-events-auto flex flex-col max-h-[75vh]"
              >
                <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
                  <h3 className="font-bold text-lg flex items-center gap-2">
                    <Bell size={18} className="text-brand-300" />
                    Pengingat
                  </h3>
                  <button onClick={() => setIsOpen(false)} className="p-2 rounded-full hover:bg-white/10 text-white/50 hover:text-white transition-colors">
                    <X size={20} />
                  </button>
                </div>

                <div className="overflow-y-auto thin-scrollbar p-3 space-y-2">
                  {activeReminders.length === 0 ? (
                    <div className="py-8 text-center text-white/50 flex flex-col items-center gap-3">
                      <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center">
                        <Check size={32} className="text-brand-400" />
                      </div>
                      <p className="text-sm">Semua aman. Tidak ada tagihan jatuh tempo.</p>
                    </div>
                  ) : (
                    activeReminders.map(reminder => {
                      const isDebt = reminder.related_entity_type === 'debt';
                      const Icon = isDebt ? CreditCard : CalendarDays;
                      const dueDate = new Date(reminder.due_date);
                      const formattedDate = new Intl.DateTimeFormat('id-ID', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric'
                      }).format(dueDate);

                      return (
                        <div key={reminder.id} className="w-full flex items-start gap-4 p-4 rounded-2xl bg-white/5 border border-white/10 relative overflow-hidden">
                          <div className={`w-10 h-10 shrink-0 rounded-full flex items-center justify-center ${isDebt ? 'bg-warn-500/20 text-warn-400' : 'bg-brand-500/20 text-brand-400'}`}>
                            <Icon size={20} />
                          </div>
                          
                          <div className="flex-1 min-w-0 pr-10">
                            <h4 className="font-semibold text-sm truncate">{reminder.title}</h4>
                            <p className="text-xs text-white/50 mt-1">{reminder.description}</p>
                            <div className="inline-block mt-2 px-2 py-1 rounded bg-white/10 text-xs font-medium text-white/80">
                              Jatuh tempo: {formattedDate}
                            </div>
                          </div>

                          <button
                            onClick={() => markCompleted(reminder.id)}
                            title="Tandai Selesai"
                            className="absolute top-4 right-4 p-2 rounded-full bg-brand-500/10 text-brand-300 hover:bg-brand-500 hover:text-white transition-all"
                          >
                            <Check size={16} />
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              </motion.div>
            </div>
          </Portal>
        )}
      </AnimatePresence>
    </>
  );
}
