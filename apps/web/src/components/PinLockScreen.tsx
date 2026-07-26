import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface PinLockScreenProps {
  isLocked: boolean;
  onUnlock: () => void;
  correctPin?: string; // Assume '123456' for now or from user settings
}

export default function PinLockScreen({ isLocked, onUnlock, correctPin = '123456' }: PinLockScreenProps) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);

  useEffect(() => {
    if (pin.length === 6) {
      if (pin === correctPin) {
        onUnlock();
        setPin('');
      } else {
        setError(true);
        setTimeout(() => {
          setPin('');
          setError(false);
        }, 500);
      }
    }
  }, [pin, correctPin, onUnlock]);

  const handleKeyPress = (num: string) => {
    if (pin.length < 6) {
      setPin((prev) => prev + num);
    }
  };

  const handleDelete = () => {
    setPin((prev) => prev.slice(0, -1));
  };

  const keypad = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '<'];

  return (
    <AnimatePresence>
      {isLocked && (
        <motion.div
          initial={{ opacity: 0, backdropFilter: 'blur(0px)' }}
          animate={{ opacity: 1, backdropFilter: 'blur(20px)' }}
          exit={{ opacity: 0, backdropFilter: 'blur(0px)', transition: { duration: 0.5 } }}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-900/60"
        >
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-white mb-6 text-center">Enter PIN</h2>
            
            {/* PIN Dots */}
            <motion.div 
              animate={error ? { x: [-10, 10, -10, 10, 0] } : {}}
              transition={{ duration: 0.4 }}
              className="flex justify-center gap-4"
            >
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className={`w-4 h-4 rounded-full border-2 transition-colors duration-300 ${
                    i < pin.length ? 'bg-teal-400 border-teal-400 shadow-[0_0_10px_rgba(13,148,136,0.8)]' : 'border-white/30'
                  } ${error ? 'bg-red-500 border-red-500 shadow-[0_0_10px_rgba(239,68,68,0.8)]' : ''}`}
                />
              ))}
            </motion.div>
          </div>

          {/* Keypad */}
          <div className="grid grid-cols-3 gap-6 max-w-xs w-full px-6">
            {keypad.map((key) => (
              <motion.button
                key={key}
                whileTap={{ scale: 0.9 }}
                onClick={() => {
                  if (key === 'C') setPin('');
                  else if (key === '<') handleDelete();
                  else handleKeyPress(key);
                }}
                className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center text-2xl text-white font-medium shadow-lg border border-white/5 mx-auto"
              >
                {key === '<' ? '⌫' : key}
              </motion.button>
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
