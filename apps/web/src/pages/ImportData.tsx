import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { UploadCloud, FileType, CheckCircle2, X, Play } from 'lucide-react';
import { useFinanceStore } from '../store/useFinanceStore';
import { parseXLSX, parsePDFFile, DraftImport } from '../utils/importer';
import Portal from '../components/Portal';
import { supabase } from '../lib/supabase';
import { safeMutate } from '../lib/db';
import toast from 'react-hot-toast';
import { unggahStruk } from '../lib/api';

const ImportData: React.FC = () => {
  const [dragActive, setDragActive] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [drafts, setDrafts] = useState<DraftImport[]>([]);
  
  const { tabs, activeTabId } = useFinanceStore();
  const [targetTabId, setTargetTabId] = useState<string>(activeTabId || '');
  
  // Confirmation state
  const [isConfirming, setIsConfirming] = useState(false);
  
  // Progress state
  const [isImporting, setIsImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressText, setProgressText] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  const handleFile = async (selectedFile: File) => {
    setFile(selectedFile);
    setLoading(true);
    setDrafts([]);
    
    try {
      if (!targetTabId && tabs && tabs.length > 0) {
        setTargetTabId(tabs[0].id);
      }

      if (selectedFile.name.endsWith('.xlsx')) {
        const parsed = await parseXLSX(selectedFile);
        setDrafts(parsed);
        toast.success(`Berhasil memuat ${parsed.length} transaksi`);
      } else if (selectedFile.name.endsWith('.pdf')) {
        const parsed = await parsePDFFile(selectedFile);
        setDrafts(parsed);
        toast.success(`Berhasil memuat ${parsed.length} transaksi`);
      } else {
        toast.error('Format file tidak didukung. Gunakan .xlsx atau .pdf');
        setFile(null);
      }
    } catch (err: any) {
      toast.error(err.message || 'Gagal memproses file');
      setFile(null);
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setFile(null);
    setDrafts([]);
    setIsSuccess(false);
    setProgress(0);
    setIsConfirming(false);
  };

  const handleConfirm = () => {
    if (!targetTabId) {
      toast.error('Pilih Buku Keuangan (Tab) terlebih dahulu');
      return;
    }
    setIsConfirming(true);
  };

  const executeImport = async () => {
    setIsConfirming(false);
    if (!targetTabId) {
      return;
    }

    setIsImporting(true);
    setProgress(0);
    setProgressText('Menyiapkan dompet...');

    try {
      // 1. Identify unique wallets needed
      const uniqueWalletNames = Array.from(new Set(drafts.map(d => d.walletName)));
      const profile = useFinanceStore.getState().profile;
      if (!profile || !profile.id) throw new Error('Profil tidak ditemukan');

      const tabId = targetTabId;
      const existingWallets = (useFinanceStore.getState().wallets || []).filter(w => w.tab_id === tabId);
      const walletMap = new Map<string, string>(); // name -> id

      for (const wName of uniqueWalletNames) {
        const existing = existingWallets.find(w => w.name.toLowerCase() === wName.toLowerCase());
        if (existing) {
          walletMap.set(wName, existing.id);
        } else {
          // create new wallet
          setProgressText(`Membuat dompet baru: ${wName}...`);
          const res = await safeMutate<{ id: string }[]>(
            supabase.from('wallets').insert({
              user_id: profile.id,
              tab_id: tabId,
              name: wName,
              initial_balance: 0,
              balance: 0
            }).select('id'),
            'Gagal membuat dompet baru'
          );
          if (res && res[0]) {
            walletMap.set(wName, res[0].id);
          }
        }
      }

      // 2. Process transactions
      const total = drafts.length;
      let count = 0;

      const toInsert: any[] = [];

      for (const draft of drafts) {
        count++;
        setProgress(Math.round((count / total) * 100));
        setProgressText(`Memproses transaksi ${count} dari ${total}...`);

        let receiptPath = null;
        
        // If there's an image URL (from XLSX), we fetch it and upload
        if (draft.receiptUrl && draft.receiptUrl.startsWith('http')) {
          try {
            setProgressText(`Mengunduh struk ${count} dari ${total}...`);
            const response = await fetch(draft.receiptUrl);
            const blob = await response.blob();
            const fileObj = new File([blob], `import_${Date.now()}.webp`, { type: blob.type });
            receiptPath = await unggahStruk(fileObj);
          } catch (e) {
            console.error('Failed to process image for row', count, e);
          }
        }

        toInsert.push({
          user_id: profile.id,
          wallet_id: walletMap.get(draft.walletName),
          tab_id: tabId,
          type: draft.type,
          amount: draft.amount,
          title: draft.title,
          category: draft.category,
          created_at: draft.date.toISOString(),
          receipt_url: receiptPath
        });
      }

      setProgressText('Menyimpan ke database...');
      
      // Chunk insert to avoid request too large
      const chunkSize = 50;
      for (let i = 0; i < toInsert.length; i += chunkSize) {
        const chunk = toInsert.slice(i, i + chunkSize);
        await safeMutate(
          supabase.from('transactions').insert(chunk),
          'Gagal menyimpan transaksi'
        );
      }

      setIsSuccess(true);
      
      // refresh global state
      const { fetchWallets, fetchTransactions } = useFinanceStore.getState();
      await fetchWallets();
      await fetchTransactions();

    } catch (err: any) {
      toast.error(err.message || 'Gagal menyimpan transaksi');
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="page pb-24">
      <div className="flex flex-col mb-6">
        <h1 className="text-2xl font-bold text-ink-900 dark:text-white mb-2">Impor Data</h1>
        <p className="text-ink-500 dark:text-ink-400 text-sm">
          Pindahkan data dari aplikasi kompetitor. Unggah file XLSX atau PDF.
        </p>
      </div>

      {!file && (
        <div 
          className={`border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center text-center transition-colors
            ${dragActive ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20' : 'border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-900/50'}
          `}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
        >
          <div className="w-16 h-16 rounded-full bg-brand-50 dark:bg-brand-900/30 flex items-center justify-center text-brand-600 mb-4">
            <UploadCloud size={32} />
          </div>
          <h3 className="font-semibold text-lg text-ink-900 dark:text-white mb-1">
            Tarik & Lepas File Di Sini
          </h3>
          <p className="text-ink-500 dark:text-ink-400 text-sm mb-6 max-w-xs">
            Mendukung file Excel (.xlsx) dan Laporan PDF (.pdf). File Excel lebih direkomendasikan.
          </p>
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="btn btn-primary"
            disabled={loading}
          >
            {loading ? 'Memproses...' : 'Pilih File'}
          </button>
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleChange}
            accept=".xlsx,.pdf"
            className="hidden" 
          />
        </div>
      )}

      {file && !isSuccess && drafts.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          <div className="glass p-4 rounded-2xl flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-brand-50 dark:bg-brand-900/30 text-brand-600">
                <FileType size={24} />
              </div>
              <div>
                <h3 className="font-semibold text-ink-900 dark:text-white line-clamp-1">{file.name}</h3>
                <p className="text-xs text-ink-500">{drafts.length} baris data ditemukan</p>
              </div>
            </div>
            <button onClick={reset} className="p-2 text-ink-400 hover:text-danger-500 transition-colors">
              <X size={20} />
            </button>
          </div>

          <div className="bg-white/5 border border-white/10 p-4 rounded-2xl mb-4">
            <label className="block text-sm font-medium text-white/70 mb-2">Pilih Buku Keuangan Tujuan:</label>
            <div className="relative">
              <select
                value={targetTabId}
                onChange={(e) => setTargetTabId(e.target.value)}
                className="w-full appearance-none bg-black/40 border border-white/15 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-brand-400 focus:ring-1 focus:ring-brand-400"
              >
                {tabs?.map(tab => (
                  <option key={tab.id} value={tab.id} className="bg-slate-900 text-white">
                    {tab.name}
                  </option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-white/50">
                <svg className="h-4 w-4 fill-current" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-ink-900 rounded-2xl shadow-sm border border-ink-200 dark:border-ink-800 overflow-hidden">
            <div className="p-4 border-b border-ink-100 dark:border-ink-800 flex justify-between items-center bg-ink-50 dark:bg-ink-900/50">
              <h3 className="font-medium text-ink-900 dark:text-white flex items-center gap-2">
                Pratinjau Data (Tabel Smart)
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-ink-50/50 dark:bg-ink-800/50 text-ink-500 dark:text-ink-400">
                  <tr>
                    <th className="px-4 py-3 font-medium whitespace-nowrap">Tgl</th>
                    <th className="px-4 py-3 font-medium whitespace-nowrap">Kategori & Judul</th>
                    <th className="px-4 py-3 font-medium whitespace-nowrap">Tipe</th>
                    <th className="px-4 py-3 font-medium whitespace-nowrap text-right">Jumlah</th>
                    <th className="px-4 py-3 font-medium whitespace-nowrap">Dompet</th>
                    <th className="px-4 py-3 font-medium whitespace-nowrap">Foto</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100 dark:divide-ink-800">
                  {drafts.slice(0, 100).map((d) => (
                    <tr key={d.id} className="hover:bg-ink-50 dark:hover:bg-ink-800/50 transition-colors">
                      <td className="px-4 py-3 whitespace-nowrap text-ink-600 dark:text-ink-300">
                        {d.date.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' })}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-ink-900 dark:text-white">{d.category}</div>
                        <div className="text-xs text-ink-500 truncate max-w-[150px]">{d.title}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                          d.type === 'income' ? 'bg-ok-100 text-ok-700 dark:bg-ok-900/30 dark:text-ok-400' : 
                          'bg-danger-100 text-danger-700 dark:bg-danger-900/30 dark:text-danger-400'
                        }`}>
                          {d.type === 'income' ? 'Masuk' : 'Keluar'}
                        </span>
                      </td>
                      <td className={`px-4 py-3 text-right font-bold whitespace-nowrap ${
                        d.type === 'income' ? 'text-ok-400' : 'text-danger-400'
                      }`}>
                        {d.type === 'income' ? '+' : '-'} {d.amount.toLocaleString('id-ID')}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <span className="text-ink-700 dark:text-ink-300">{d.walletName}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-brand-100 text-brand-700 dark:bg-brand-900/30 dark:text-brand-400">
                            Auto
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {d.receiptUrl ? (
                          <div className="w-8 h-8 rounded bg-ink-100 dark:bg-ink-800 overflow-hidden">
                            <img src={d.receiptUrl} alt="receipt" className="w-full h-full object-cover" />
                          </div>
                        ) : (
                          <span className="text-ink-300">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {drafts.length > 100 && (
                <div className="p-4 text-center text-sm text-ink-500 bg-ink-50/50 dark:bg-ink-800/50">
                  Dan {drafts.length - 100} baris lainnya...
                </div>
              )}
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button onClick={reset} className="btn bg-ink-200 text-ink-700 hover:bg-ink-300 dark:bg-ink-800 dark:text-ink-300 flex-1">
              Batal
            </button>
            <button onClick={handleConfirm} className="btn btn-primary flex-[2] flex justify-center items-center gap-2">
              <Play size={18} />
              Lanjutkan Migrasi
            </button>
          </div>
        </motion.div>
      )}

      {/* Confirmation Modal */}
      <AnimatePresence>
        {isConfirming && (
          <Portal>
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="absolute inset-0 bg-black/80 backdrop-blur-sm"
                onClick={() => setIsConfirming(false)}
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="relative w-full max-w-sm bg-slate-900 border border-white/15 rounded-3xl overflow-hidden shadow-2xl p-6"
              >
                <div className="flex flex-col items-center text-center">
                  <div className="w-16 h-16 bg-brand-500/20 text-brand-400 rounded-full flex items-center justify-center mb-4">
                    <CheckCircle2 size={32} />
                  </div>
                  <h3 className="text-xl font-bold text-white mb-2">Konfirmasi Impor</h3>
                  <p className="text-white/70 text-sm mb-6">
                    Kamu akan mengimpor <b>{drafts.length} transaksi</b> ke Buku Keuangan <b>"{tabs?.find(t => t.id === targetTabId)?.name || 'Terpilih'}"</b>. 
                    Data tidak dapat dibatalkan otomatis setelah diimpor. Lanjutkan?
                  </p>
                  <div className="flex gap-3 w-full">
                    <button onClick={() => setIsConfirming(false)} className="flex-1 btn bg-white/10 text-white hover:bg-white/20">
                      Batal
                    </button>
                    <button onClick={executeImport} className="flex-1 btn bg-brand-500 hover:bg-brand-400 text-white font-bold">
                      Ya, Impor
                    </button>
                  </div>
                </div>
              </motion.div>
            </div>
          </Portal>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {(isImporting || isSuccess) && (
          <Portal>
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[70] bg-ink-900/80 backdrop-blur-sm flex items-center justify-center p-6"
            >
              <motion.div 
                initial={{ scale: 0.9, opacity: 0 }} 
                animate={{ scale: 1, opacity: 1 }}
                className="bg-white dark:bg-ink-900 rounded-3xl p-8 max-w-sm w-full shadow-2xl flex flex-col items-center text-center"
              >
                {!isSuccess ? (
                  <>
                    <div className="relative w-24 h-24 mb-6">
                      <svg className="animate-spin w-full h-full text-ink-200 dark:text-ink-800" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      <div className="absolute inset-0 flex items-center justify-center text-brand-600 font-bold text-xl">
                        {progress}%
                      </div>
                    </div>
                    <h3 className="text-xl font-bold text-ink-900 dark:text-white mb-2">Mengimpor Data...</h3>
                    <p className="text-sm text-ink-500 dark:text-ink-400 mb-6">{progressText}</p>
                    <div className="w-full h-2 bg-ink-100 dark:bg-ink-800 rounded-full overflow-hidden">
                      <motion.div 
                        className="h-full bg-brand-500" 
                        initial={{ width: 0 }} 
                        animate={{ width: `${progress}%` }} 
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <div className="w-24 h-24 rounded-full bg-ok-100 dark:bg-ok-900/30 text-ok-500 flex items-center justify-center mb-6">
                      <CheckCircle2 size={48} />
                    </div>
                    <h3 className="text-2xl font-bold text-ink-900 dark:text-white mb-2">Selesai!</h3>
                    <p className="text-sm text-ink-500 dark:text-ink-400 mb-8">
                      Berhasil memigrasikan {drafts.length} transaksi ke DuitKita.
                    </p>
                    <button onClick={reset} className="btn btn-primary w-full">
                      Tutup
                    </button>
                  </>
                )}
              </motion.div>
            </motion.div>
          </Portal>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ImportData;
