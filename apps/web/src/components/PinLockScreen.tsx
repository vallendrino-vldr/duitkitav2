import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Delete } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface PinLockScreenProps {
  isLocked: boolean;
  onUnlock: () => void;
}

const PANJANG_PIN = 6;

export default function PinLockScreen({ isLocked, onUnlock }: PinLockScreenProps) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [pesan, setPesan] = useState<string | null>(null);

  // Reset setiap kali layar dikunci ulang.
  useEffect(() => {
    if (isLocked) {
      setPin('');
      setError(false);
      setPesan(null);
    }
  }, [isLocked]);

  const verifikasi = useCallback(
    async (kandidat: string) => {
      setIsVerifying(true);
      setPesan(null);
      try {
        // PIN TIDAK PERNAH dikirim ke browser. Perbandingan bcrypt terjadi di
        // database lewat RPC verify_pin() yang hanya mengembalikan boolean.
        const { data, error: rpcError } = await supabase.rpc('verify_pin', { p_pin: kandidat });
        if (rpcError) throw rpcError;

        if (data === true) {
          sessionStorage.setItem('duitkita_unlocked', 'true');
          setPin('');
          onUnlock();
          return;
        }

        setError(true);
        setPesan('PIN salah. Coba lagi.');
        setTimeout(() => {
          setPin('');
          setError(false);
        }, 500);
      } catch (e) {
        console.error('[PIN] verifikasi gagal', e);
        setError(true);
        // Gagal aman: tanpa jawaban tegas dari server, layar tetap terkunci.
        setPesan('Tidak dapat memverifikasi PIN. Periksa koneksi kamu.');
        setTimeout(() => {
          setPin('');
          setError(false);
        }, 500);
      } finally {
        setIsVerifying(false);
      }
    },
    [onUnlock],
  );

  useEffect(() => {
    if (pin.length === PANJANG_PIN && !isVerifying) {
      void verifikasi(pin);
    }
  }, [pin, isVerifying, verifikasi]);

  const handleKeyPress = (num: string) => {
    if (isVerifying) return;
    setPin((prev) => (prev.length < PANJANG_PIN ? prev + num : prev));
  };

  const handleDelete = () => {
    if (isVerifying) return;
    setPin((prev) => prev.slice(0, -1));
  };

  const keypad = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '<'];

  return (
    <AnimatePresence>
      {isLocked && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.35 } }}
          className="fixed inset-0 z-[80] flex flex-col items-center justify-center bg-slate-950/95 backdrop-blur-2xl"
        >
          <div className="mb-10 text-center">
            <h2 className="text-3xl font-semibold text-white tracking-tight mb-2">Masukkan PIN</h2>
            <p className="text-teal-300 text-sm font-medium tracking-wide">Keamanan DuitKita</p>
          </div>

          <div className="mb-4">
            <motion.div
              animate={error ? { x: [-10, 10, -10, 10, 0] } : {}}
              transition={{ duration: 0.4 }}
              className="flex justify-center gap-4"
            >
              {Array.from({ length: PANJANG_PIN }).map((_, i) => (
                <div
                  key={i}
                  className={`w-4 h-4 rounded-full border-2 transition-all duration-300 ${
                    error
                      ? 'bg-red-500 border-red-500 shadow-[0_0_15px_rgba(239,68,68,0.6)]'
                      : i < pin.length
                        ? 'bg-teal-400 border-teal-400 shadow-[0_0_15px_rgba(45,212,191,0.6)]'
                        : 'border-white/30 bg-transparent'
                  }`}
                />
              ))}
            </motion.div>
          </div>

          {/* Tinggi dikunci agar keypad tidak bergeser saat pesan muncul (CLS). */}
          <div className="h-10 flex items-center justify-center px-6" aria-live="polite">
            {isVerifying && <span className="text-white/70 text-sm">Memverifikasi…</span>}
            {!isVerifying && pesan && (
              <span className="text-red-300 text-sm text-center">{pesan}</span>
            )}
          </div>

          <div className="grid grid-cols-3 gap-6 max-w-[280px] w-full px-4">
            {keypad.map((key) => (
              <motion.button
                key={key}
                type="button"
                disabled={isVerifying}
                whileTap={{ scale: 0.85 }}
                aria-label={key === '<' ? 'Hapus' : key === 'C' ? 'Bersihkan' : `Angka ${key}`}
                onClick={() => {
                  if (key === 'C') setPin('');
                  else if (key === '<') handleDelete();
                  else handleKeyPress(key);
                }}
                className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center text-2xl text-white font-light shadow-lg border border-white/15 mx-auto backdrop-blur-md disabled:opacity-40"
              >
                {key === '<' ? <Delete size={22} /> : key}
              </motion.button>
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
