import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Flame, Sparkles } from 'lucide-react';
import { api, pesanApi } from '../lib/api';

interface AiRoastBoxProps {
  income: number;
  expense: number;
  topCategory: string;
}

export default function AiRoastBox({ income, expense, topCategory }: AiRoastBoxProps) {
  const [roast, setRoast] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleRoast = async () => {
    setIsLoading(true);
    setRoast(null);
    
    try {
      const { data } = await api.post('/api/scan/roast', { income, expense, topCategory });
      setRoast(data.roast);
    } catch (error) {
      console.error('Failed to get roast:', error);
      setRoast(pesanApi(error, 'Gagal koneksi ke Gemini AI. Coba lagi nanti bro.'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-xl border border-white/20 rounded-3xl p-5 shadow-2xl relative overflow-hidden">
      <div className="absolute -right-4 -top-4 opacity-10">
        <Flame size={100} className="text-orange-500" />
      </div>

      <div className="flex justify-between items-center mb-4 relative z-10">
        <div className="flex items-center gap-2">
          <div className="bg-orange-500/20 p-2 rounded-xl text-orange-400">
            <Sparkles size={20} />
          </div>
          <h3 className="text-white font-bold text-lg">AI Financial Roast</h3>
        </div>
        
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={handleRoast}
          disabled={isLoading}
          className="bg-gradient-to-r from-orange-500 to-red-600 text-white font-black text-xs px-4 py-2 rounded-full shadow-[0_0_15px_rgba(239,68,68,0.5)] flex items-center gap-2"
        >
          <Flame size={14} />
          ROAST GUE!
        </motion.button>
      </div>

      <AnimatePresence mode="wait">
        {isLoading && (
          <motion.div 
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-2 relative z-10"
          >
            <div className="h-4 bg-white/20 rounded-full w-3/4 animate-pulse"></div>
            <div className="h-4 bg-white/20 rounded-full w-full animate-pulse"></div>
            <div className="h-4 bg-white/20 rounded-full w-5/6 animate-pulse"></div>
          </motion.div>
        )}

        {!isLoading && roast && (
          <motion.div
            key="content"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-black/20 p-4 rounded-2xl border border-white/5 relative z-10"
          >
            <p className="text-white/90 italic text-sm leading-relaxed">
              "{roast}"
            </p>
          </motion.div>
        )}

        {!isLoading && !roast && (
          <motion.div
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-white/65 text-sm text-center py-2 relative z-10"
          >
            Berani denger kenyataan pahit soal keuangan lo? 
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
