import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Camera, Mic, Save, Calculator, X, Aperture, ImagePlus } from 'lucide-react';
import Portal from '../components/Portal';
import toast from 'react-hot-toast';
import { api, pesanApi, unggahStruk } from '../lib/api';
import { supabase } from '../lib/supabase';
import { useFinanceStore } from '../store/useFinanceStore';
import { safeMutate, pesanError } from '../lib/db';
import { hitungEkspresi } from '../lib/calc';
import { compressImage } from '../utils/imageCompressor';
import { useNavigate } from 'react-router-dom';

/** Tinggi batang visualiser suara. Tetap, bukan acak tiap render. */
const BAR_SUARA = [0.9, 1.5, 0.7, 1.8, 0.8, 1.4, 1.0];

export default function Add() {
  const navigate = useNavigate();
  const { wallets, enqueueOffline, fetchWallets, fetchTransactions } = useFinanceStore();
  
  const [isLoading, setIsLoading] = useState(false);
  const [showCalculator, setShowCalculator] = useState(false);
  const [calcValue, setCalcValue] = useState('');
  
  // Camera State
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);

  // Gambar struk yang menunggu disimpan. Diunggah ke storage hanya saat
  // transaksi benar-benar disimpan, supaya scan yang dibatalkan tidak
  // meninggalkan sampah file.
  const [pendingReceipt, setPendingReceipt] = useState<File | null>(null);

  // Mic State
  const [isMicOpen, setIsMicOpen] = useState(false);
  // Kunci lewat ref, bukan state: state bersifat asinkron, jadi ketukan beruntun
  // bisa lolos sebelum re-render dan memicu beberapa sesi pengenalan sekaligus.
  const isListeningRef = useRef(false);
  const recognitionRef = useRef<any>(null);
  
  const [formData, setFormData] = useState({
    wallet_id: wallets?.[0]?.id || '',
    type: 'expense' as 'income' | 'expense' | 'transfer',
    amount: '',
    category: '',
    title: '',
    customCategory: ''
  });

  useEffect(() => {
    if ((wallets || []).length > 0 && !formData.wallet_id) {
      setFormData(prev => ({ ...prev, wallet_id: wallets![0].id }));
    }
  }, [wallets]);

  // Clean up media streams
  useEffect(() => {
    return () => {
      if (stream) stream.getTracks().forEach(track => track.stop());
      // Hentikan pengenalan suara saat halaman ditinggalkan, kalau tidak
      // mikrofon tetap menyala di latar belakang.
      try { recognitionRef.current?.abort?.(); } catch { /* abaikan */ }
      isListeningRef.current = false;
    };
  }, [stream]);

  // Menyambungkan aliran kamera ke elemen video LEWAT EFEK, bukan setTimeout.
  // Versi lama menunggu 100ms lalu berharap elemennya sudah ada; sejak overlay
  // dipindah ke <body>, waktu pemasangannya bergeser dan sering meleset —
  // hasilnya kamera menyala tapi layarnya hitam.
  useEffect(() => {
    const video = videoRef.current;
    if (!isCameraOpen || !stream || !video) return;
    video.srcObject = stream;
    // Sebagian browser tidak memutar otomatis walau ada atribut autoPlay.
    video.play().catch((e) => console.warn('[KAMERA] autoplay ditolak', e));
  }, [isCameraOpen, stream]);

  const openCamera = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      toast.error('Browser ini tidak mendukung kamera. Pakai tombol galeri untuk pilih foto.');
      return;
    }

    // Dicoba berurutan. Laptop TIDAK punya kamera belakang, jadi permintaan
    // 'environment' saja bisa langsung gagal di sana — itu sebabnya scan tidak
    // pernah jalan di laptop. Sekarang turun otomatis ke kamera depan / apa saja.
    const pilihan: MediaStreamConstraints[] = [
      { video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } } },
      { video: { facingMode: 'user' } },
      { video: true },
    ];

    let terakhir: any = null;
    for (const constraint of pilihan) {
      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia(constraint);
        setStream(mediaStream);
        setIsCameraOpen(true);
        return;
      } catch (err) {
        terakhir = err;
      }
    }

    // Pesan spesifik sesuai penyebabnya, bukan "Gagal mengakses kamera" untuk semua.
    const nama = terakhir?.name;
    if (nama === 'NotAllowedError' || nama === 'SecurityError') {
      toast.error('Izin kamera ditolak. Klik ikon gembok di bilah alamat lalu izinkan kamera.');
    } else if (nama === 'NotFoundError' || nama === 'OverconstrainedError') {
      toast.error('Kamera tidak ditemukan di perangkat ini. Pakai tombol galeri untuk pilih foto.');
    } else if (nama === 'NotReadableError') {
      toast.error('Kamera sedang dipakai aplikasi lain (Zoom/Meet?). Tutup dulu, lalu coba lagi.');
    } else {
      toast.error(`Gagal mengakses kamera: ${terakhir?.message || nama || 'penyebab tidak diketahui'}`);
    }
    console.error('[KAMERA] semua percobaan gagal:', terakhir);
  };

  const handleManualUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    const toastId = toast.loading('Memindai struk dengan AI...');
    try {
      const compressedFile = await compressImage(file);
      const formDataUpload = new FormData();
      formDataUpload.append('receipt', compressedFile);

      const { data } = await api.post('/api/scan/receipt', formDataUpload);

      setPendingReceipt(compressedFile);
      setFormData(prev => ({
        ...prev,
        title: data.title || prev.title,
        amount: data.amount ? data.amount.toString() : prev.amount,
        type: data.type || prev.type,
        category: data.category || prev.category
      }));
      toast.success('Berhasil memindai struk!', { id: toastId });
    } catch (error) {
      console.error(error);
      toast.error(pesanApi(error, 'Gagal membaca struk'), { id: toastId });
    } finally {
      setIsLoading(false);
    }
  };

  const capturePhoto = async () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    // Stop camera
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    setIsCameraOpen(false);

    setIsLoading(true);
    const toastId = toast.loading('Memindai struk dengan AI...');

    canvas.toBlob(async (blob) => {
      if (!blob) {
        toast.error('Gagal memproses gambar', { id: toastId });
        setIsLoading(false);
        return;
      }

      try {
        const file = new File([blob], "receipt.jpg", { type: "image/jpeg" });
        const compressedFile = await compressImage(file);
        const formDataUpload = new FormData();
        formDataUpload.append('receipt', compressedFile);

        const { data } = await api.post('/api/scan/receipt', formDataUpload);

        setPendingReceipt(compressedFile);
        setFormData(prev => ({
          ...prev,
          title: data.title || prev.title,
          amount: data.amount ? data.amount.toString() : prev.amount,
          type: data.type || prev.type,
          category: data.category || prev.category
        }));
        toast.success('Berhasil memindai struk!', { id: toastId });
      } catch (error) {
        console.error(error);
        toast.error(pesanApi(error, 'Gagal membaca struk'), { id: toastId });
      } finally {
        setIsLoading(false);
      }
    }, 'image/jpeg', 0.8);
  };

  const closeCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    setIsCameraOpen(false);
  };

  const handleVoice = async () => {
    // Kunci: ketukan kedua saat masih mendengarkan akan menutup sesi, bukan
    // menumpuk sesi baru. Dulu tanpa penjaga ini, ketukan beruntun membuat
    // Web Speech API melempar InvalidStateError bertubi-tubi.
    if (isListeningRef.current) {
      try { recognitionRef.current?.stop?.(); } catch { /* abaikan */ }
      isListeningRef.current = false;
      setIsMicOpen(false);
      return;
    }

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      // Jujur saja kalau tidak didukung. Versi lama malah mengisi form dengan
      // data karangan ("Beli Makan Siang / 45000") seolah-olah berhasil.
      // Firefox memang belum mendukung Web Speech API sama sekali.
      toast.error('Browser ini tidak mendukung input suara. Coba pakai Chrome atau Edge.');
      return;
    }

    // Minta izin mikrofon LEBIH DULU. Kalau langsung memanggil recognition.start(),
    // penolakan izin hanya muncul sebagai kode error samar 'not-allowed' tanpa
    // petunjuk apa pun — pengguna cuma melihat "gagal" tanpa tahu sebabnya.
    try {
      const izin = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Jalur mic-nya langsung ditutup; Web Speech API membuka sendiri miliknya.
      izin.getTracks().forEach((t) => t.stop());
    } catch (err: any) {
      if (err?.name === 'NotAllowedError') {
        toast.error('Izin mikrofon ditolak. Klik ikon gembok di bilah alamat lalu izinkan mikrofon.');
      } else if (err?.name === 'NotFoundError') {
        toast.error('Mikrofon tidak ditemukan di perangkat ini.');
      } else {
        toast.error(`Mikrofon tidak bisa dipakai: ${err?.message || err?.name || 'penyebab tidak diketahui'}`);
      }
      console.error('[SUARA] izin mikrofon gagal:', err);
      return;
    }

    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;
    recognition.lang = 'id-ID';
    recognition.continuous = false;
    recognition.interimResults = false;

    const selesai = () => {
      isListeningRef.current = false;
      setIsMicOpen(false);
    };

    recognition.onresult = (event: any) => {
      const transcript = String(event?.results?.[0]?.[0]?.transcript ?? '').trim();
      selesai();
      if (!transcript) {
        toast.error('Tidak ada suara yang terdengar. Coba lagi.');
        return;
      }

      const numberMatch = transcript.match(/\d+/g);
      const amount = numberMatch ? numberMatch.join('') : '';
      const title = transcript.replace(/\d+/g, '').replace(/\s+/g, ' ').trim() || transcript;

      setFormData(prev => ({
        ...prev,
        title,
        amount: amount || prev.amount,
        type: 'expense',
      }));
      toast.success(`Dikenali: "${transcript}"`, { icon: '🎙️' });
    };

    recognition.onerror = (event: any) => {
      console.error('[SUARA] error:', event?.error);
      selesai();
      // Tiap kode punya penyebab berbeda; menyamakan semuanya jadi "coba lagi"
      // membuat masalah izin dan masalah jaringan mustahil dibedakan.
      const pesan: Record<string, string> = {
        'not-allowed': 'Akses mikrofon ditolak. Izinkan dulu lewat ikon gembok di bilah alamat.',
        'service-not-allowed': 'Layanan pengenalan suara diblokir browser.',
        'no-speech': 'Tidak ada suara terdengar. Coba bicara lebih dekat ke mikrofon.',
        'audio-capture': 'Mikrofon tidak terbaca. Pastikan tidak dipakai aplikasi lain.',
        'network': 'Pengenalan suara butuh internet. Periksa koneksi kamu.',
        'aborted': '',
      };
      const p = pesan[event?.error] ?? 'Gagal mengenali suara. Coba lagi.';
      if (p) toast.error(p);
    };

    recognition.onend = selesai;

    try {
      isListeningRef.current = true;
      setIsMicOpen(true);
      recognition.start();
    } catch (err) {
      selesai();
      toast.error('Gagal memulai pengenalan suara');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalCategory = formData.category === 'custom' ? formData.customCategory : formData.category;
    
    if (!formData.wallet_id || !formData.amount || !formData.title || !finalCategory) {
      toast.error('Lengkapi form terlebih dahulu');
      return;
    }

    const nominal = Number(formData.amount);
    if (!Number.isFinite(nominal) || nominal <= 0) {
      toast.error('Nominal harus lebih besar dari nol');
      return;
    }

    setIsLoading(true);
    const toastId = toast.loading('Menyimpan transaksi...');

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Sesi berakhir. Silakan masuk ulang.');

      const offline = typeof navigator !== 'undefined' && navigator.onLine === false;

      // Simpan gambar struknya. Sebelumnya foto hasil scan langsung dibuang
      // setelah dibaca AI, sehingga kolom receipt_url selalu kosong dan bucket
      // 'receipts' tidak pernah terpakai sama sekali.
      let receiptPath: string | null = null;
      if (pendingReceipt && !offline) {
        receiptPath = await unggahStruk(pendingReceipt);
      }

      const transactionData = {
        id: crypto.randomUUID(),
        user_id: user.id,
        wallet_id: formData.wallet_id,
        type: formData.type,
        amount: nominal,
        category: finalCategory,
        title: formData.title,
        receipt_url: receiptPath,
        created_at: new Date().toISOString()
      };

      if (offline) {
        // Benar-benar offline: antrikan untuk disinkronkan nanti.
        enqueueOffline(transactionData as any);
        toast.success('Tersimpan offline, akan disinkronkan otomatis', { id: toastId });
      } else {
        // safeMutate melempar bila gagal, jadi toast sukses di bawah TIDAK PERNAH
        // muncul untuk penyimpanan yang sebenarnya gagal. Dulu error sama sekali
        // tidak diperiksa dan pengguna selalu melihat "berhasil disimpan".
        await safeMutate(
          supabase.from('transactions').insert(transactionData),
          'Gagal menyimpan transaksi',
        );
        // Saldo dompet dihitung ulang oleh trigger database, jadi ambil ulang.
        await Promise.allSettled([fetchWallets(), fetchTransactions()]);
        toast.success('Transaksi berhasil disimpan', { id: toastId });
      }

      setPendingReceipt(null);
      setFormData({
        wallet_id: wallets?.[0]?.id || '',
        type: 'expense',
        amount: '',
        category: '',
        title: '',
        customCategory: ''
      });

      navigate('/dashboard');
    } catch (error) {
      toast.error(pesanError(error, 'Gagal menyimpan transaksi'), { id: toastId });
    } finally {
      setIsLoading(false);
    }
  };

  const evalCalc = () => {
    try {
      // Parser aman, bukan eval(). Lihat lib/calc.ts.
      const result = hitungEkspresi(calcValue);
      if (result < 0) {
        toast.error('Nominal tidak boleh negatif');
        return;
      }
      setFormData(prev => ({ ...prev, amount: String(Math.round(result)) }));
      setShowCalculator(false);
      setCalcValue('');
    } catch (e) {
      toast.error(pesanError(e, 'Ekspresi tidak valid'));
    }
  };

  const predefinedCategories = ['Makanan', 'Transportasi', 'Hiburan', 'Tagihan', 'Belanja', 'Kesehatan'];

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="page pb-32 relative z-10"
    >
      <h2 className="text-2xl font-bold text-white mb-6 text-center">Tambah Transaksi</h2>

      {/* Overlay kamera — di-portal ke <body> supaya benar-benar menutupi layar. */}
      <Portal>
      <AnimatePresence>
        {isCameraOpen && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] bg-ink-950"
          >
            <video 
              ref={videoRef} 
              autoPlay 
              playsInline 
              className="absolute inset-0 w-full h-full object-cover z-10"
            />
            <canvas ref={canvasRef} className="hidden" />
            
            {/* 3D Scanner Overlay */}
            <div className="absolute inset-0 flex items-center justify-center z-20">
            <div className="relative w-64 h-80">
              <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-teal-400"></div>
              <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-teal-400"></div>
              <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-teal-400"></div>
              <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-teal-400"></div>
              <motion.div 
                animate={{ top: ['0%', '100%', '0%'] }} 
                transition={{ repeat: Infinity, duration: 2.5, ease: "linear" }}
                className="absolute left-0 right-0 h-1 bg-teal-400 shadow-[0_0_20px_#2dd4bf] opacity-80"
              />
              <p className="absolute -bottom-12 w-full text-center text-teal-400 font-medium animate-pulse drop-shadow-md bg-black/30 rounded-full py-1">Arahkan struk ke kotak</p>
            </div>
            </div>

            {/* Kontrol diangkat ke bottom-40 (160px) + ruang aman ponsel.
                Dulu posisinya bottom-0 dengan z-index sama persis dengan navbar,
                dan karena navbar digambar belakangan, tombol rana tertimbun
                di bawah tombol "+". Sekarang navbar ada di z-40, overlay ini
                z-[70], jadi mustahil bertabrakan lagi. */}
            <div className="absolute bottom-40 left-0 right-0 z-[75] flex justify-center items-center gap-6 pb-[env(safe-area-inset-bottom,0px)]">
              <button
                type="button" onClick={closeCamera} aria-label="Tutup kamera"
                className="w-14 h-14 inline-flex items-center justify-center bg-danger-500/20 rounded-full text-danger-400 border border-danger-500/40 backdrop-blur-md active:scale-95 transition-transform"
              >
                <X size={24} />
              </button>
              <button
                type="button" onClick={capturePhoto} aria-label="Ambil foto struk"
                className="w-20 h-20 inline-flex items-center justify-center bg-brand-400 rounded-full text-ink-900 border-4 border-white/60 hover:bg-brand-300 active:scale-95 transition-all shadow-glow-brand"
              >
                <Aperture size={32} />
              </button>
              <label
                className="w-14 h-14 inline-flex items-center justify-center bg-white/20 rounded-full text-white backdrop-blur-md cursor-pointer border border-white/20 active:scale-95 transition-transform"
                aria-label="Pilih gambar dari galeri"
              >
                <input type="file" accept="image/*" className="hidden" onChange={handleManualUpload} />
                <ImagePlus size={24} />
              </label>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      </Portal>

      {/* Overlay mendengarkan suara */}
      <Portal>
      <AnimatePresence>
        {isMicOpen && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] bg-ink-950/95 flex flex-col items-center justify-center backdrop-blur-md px-8"
          >
            <div className="flex gap-3 mb-8 items-center h-24">
              {BAR_SUARA.map((tinggi, i) => (
                <motion.div
                  key={i}
                  // scaleY, bukan height: mengubah tinggi memaksa browser
                  // menata ulang halaman 60x per detik. Nilai acaknya juga
                  // sekarang tetap (dihitung sekali di luar render) — dulu
                  // Math.random() dipanggil saat render sehingga targetnya
                  // berubah-ubah tiap kali komponen digambar ulang.
                  animate={{ scaleY: [0.25, tinggi, 0.25] }}
                  transition={{ repeat: Infinity, duration: 0.7, delay: i * 0.09, ease: 'easeInOut' }}
                  className="w-3 h-20 origin-center bg-gradient-to-t from-accent-600 to-accent-400 rounded-full shadow-glow-accent"
                />
              ))}
            </div>
            <h3 className="text-accent-300 font-semibold text-xl">Mendengarkan…</h3>
            <p className="text-white/70 text-sm mt-2 text-center">Contoh: "Beli kopi lima puluh ribu"</p>
            <button type="button" onClick={handleVoice} className="btn-ghost mt-8">
              Batal
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      </Portal>

      {/* AI Hub Actions */}
      <div className="grid grid-cols-2 gap-4 mb-8">
        <motion.button 
          whileTap={{ scale: 0.95 }}
          onClick={openCamera}
          className="bg-gradient-to-br from-teal-500/10 to-teal-600/5 border border-teal-400/20 p-6 rounded-3xl flex flex-col items-center justify-center gap-3 backdrop-blur-md"
        >
          <div className="bg-teal-400/20 p-3 rounded-2xl text-teal-400 shadow-[0_0_15px_rgba(45,212,191,0.2)]">
            <Camera size={28} />
          </div>
          <span className="text-white font-medium text-sm">Scan Struk</span>
        </motion.button>

        <motion.button 
          whileTap={{ scale: 0.95 }}
          onClick={handleVoice}
          className="bg-gradient-to-br from-purple-500/10 to-purple-600/5 border border-purple-400/20 p-6 rounded-3xl flex flex-col items-center justify-center gap-3 backdrop-blur-md"
        >
          <div className="bg-purple-400/20 p-3 rounded-2xl text-purple-400 shadow-[0_0_15px_rgba(168,85,247,0.2)]">
            <Mic size={28} />
          </div>
          <span className="text-white font-medium text-sm">Catat Suara</span>
        </motion.button>
      </div>

      {/* Manual Form */}
      <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-6 shadow-2xl relative">
        <h3 className="text-white/80 font-medium mb-4 text-sm uppercase tracking-wider">Input Manual</h3>
        
        {/* Loading Overlay for Manual Submission/AI Processing */}
        <AnimatePresence>
          {isLoading && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-[#0F172A]/80 backdrop-blur-sm z-20 flex flex-col items-center justify-center rounded-3xl"
            >
              <div className="w-12 h-12 border-4 border-teal-400 border-t-transparent rounded-full animate-spin mb-4"></div>
              <p className="text-white font-medium animate-pulse">Memproses...</p>
            </motion.div>
          )}
        </AnimatePresence>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-white/70 text-[10px] font-bold uppercase tracking-widest ml-1 block mb-1">Dompet</label>
            <select 
              value={formData.wallet_id}
              onChange={(e) => setFormData({...formData, wallet_id: e.target.value})}
              className="w-full bg-black/20 border border-white/10 rounded-2xl px-4 py-3 text-white focus:outline-none focus:ring-1 focus:ring-teal-400 appearance-none font-light"
            >
              <option value="" disabled className="bg-slate-900">Pilih Dompet</option>
              {(wallets || []).map(w => (
                <option key={w.id} value={w.id} className="bg-slate-900">{w.name}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-white/70 text-[10px] font-bold uppercase tracking-widest ml-1 block mb-1">Tipe</label>
              <select 
                value={formData.type}
                onChange={(e) => setFormData({...formData, type: e.target.value as any})}
                className="w-full bg-black/20 border border-white/10 rounded-2xl px-4 py-3 text-white focus:outline-none focus:ring-1 focus:ring-teal-400 appearance-none font-light"
              >
                <option value="expense" className="bg-slate-900 text-red-400">Pengeluaran</option>
                <option value="income" className="bg-slate-900 text-teal-400">Pemasukan</option>
                <option value="transfer" className="bg-slate-900 text-blue-400">Transfer</option>
              </select>
            </div>
            <div className="relative">
              <label className="text-white/70 text-[10px] font-bold uppercase tracking-widest ml-1 block mb-1">Nominal</label>
              <input 
                type="number"
                placeholder="0"
                value={formData.amount}
                onChange={(e) => setFormData({...formData, amount: e.target.value})}
                className="w-full bg-black/20 border border-white/10 rounded-2xl px-4 py-3 text-white placeholder-white/45 focus:outline-none focus:ring-1 focus:ring-teal-400 font-light"
              />
              <button 
                type="button" 
                onClick={() => setShowCalculator(true)}
                className="absolute right-3 top-7 text-teal-400 hover:text-teal-300"
              >
                <Calculator size={18} />
              </button>
            </div>
          </div>

          <div>
            <label className="text-white/70 text-[10px] font-bold uppercase tracking-widest ml-1 block mb-1">Judul / Keterangan</label>
            <input 
              type="text"
              placeholder="Contoh: Beli Kopi"
              value={formData.title}
              onChange={(e) => setFormData({...formData, title: e.target.value})}
              className="w-full bg-black/20 border border-white/10 rounded-2xl px-4 py-3 text-white placeholder-white/45 focus:outline-none focus:ring-1 focus:ring-teal-400 font-light"
            />
          </div>

          <div>
            <label className="text-white/70 text-[10px] font-bold uppercase tracking-widest ml-1 block mb-1">Kategori</label>
            <select 
              value={formData.category}
              onChange={(e) => setFormData({...formData, category: e.target.value})}
              className="w-full bg-black/20 border border-white/10 rounded-2xl px-4 py-3 text-white focus:outline-none focus:ring-1 focus:ring-teal-400 appearance-none font-light mb-2"
            >
              <option value="" disabled className="bg-slate-900">Pilih Kategori</option>
              {predefinedCategories.map(cat => (
                <option key={cat} value={cat} className="bg-slate-900">{cat}</option>
              ))}
              <option value="custom" className="bg-slate-900 italic">Tambah Kategori Lain...</option>
            </select>
            {formData.category === 'custom' && (
              <input 
                type="text"
                placeholder="Kategori baru"
                value={formData.customCategory}
                onChange={(e) => setFormData({...formData, customCategory: e.target.value})}
                className="w-full bg-black/20 border border-white/10 rounded-2xl px-4 py-3 text-white placeholder-white/45 focus:outline-none focus:ring-1 focus:ring-teal-400 font-light mt-2"
              />
            )}
          </div>

          <motion.button 
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            type="submit"
            disabled={isLoading}
            className="w-full bg-white text-black font-semibold rounded-2xl px-4 py-4 shadow-[0_0_20px_rgba(255,255,255,0.2)] flex justify-center items-center mt-6"
          >
            {isLoading ? <div className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin"></div> : <><Save size={18} className="mr-2" /> SIMPAN TRANSAKSI</>}
          </motion.button>
        </form>
      </div>

      {/* Kalkulator */}
      <Portal>
      <AnimatePresence>
        {showCalculator && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setShowCalculator(false)}
              className="fixed inset-0 z-[60] bg-ink-950/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 20, stiffness: 90 }}
              className="fixed inset-x-0 bottom-0 z-[61] mx-auto max-w-md glass-strong border-t border-white/15 p-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] rounded-t-4xl"
            >
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-white font-semibold">Kalkulator</h3>
                <button type="button" onClick={() => setShowCalculator(false)} aria-label="Tutup kalkulator" className="icon-btn">
                  <X size={20} />
                </button>
              </div>
              <input
                type="text" inputMode="text" value={calcValue} onChange={(e) => setCalcValue(e.target.value)}
                className="field text-right text-xl font-mono mb-4"
                placeholder="10000+5000"
                aria-label="Ekspresi hitung"
              />
              <div className="grid grid-cols-4 gap-2">
                {['7','8','9','/','4','5','6','*','1','2','3','-','C','0','.','+'].map(btn => (
                  <button
                    key={btn}
                    type="button"
                    onClick={() => btn === 'C' ? setCalcValue('') : setCalcValue(prev => prev + btn)}
                    className="min-h-[52px] bg-white/10 border border-white/15 rounded-xl text-white text-lg font-medium hover:bg-white/15 active:scale-95 transition-all"
                  >{btn}</button>
                ))}
                <button type="button" onClick={evalCalc} className="col-span-4 btn-primary mt-2 min-h-[52px]">=</button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
      </Portal>
    </motion.div>
  );
}
