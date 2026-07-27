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
  // Jalur cadangan untuk Safari iOS yang tidak punya Web Speech API.
  const perekamRef = useRef<MediaRecorder | null>(null);
  
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

  /**
   * Jalur suara untuk browser tanpa Web Speech API (terutama Safari iPhone/iPad).
   * Suaranya direkam lalu dikirim ke server; Gemini yang mendengar sekaligus
   * menyusun datanya, jadi kalimat utuh seperti "beli kopi tiga puluh lima ribu"
   * dipahami sebagai satu kesatuan, bukan angka yang dicomot terpisah.
   */
  const rekamSuara = async () => {
    if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      toast.error('Perangkat ini tidak bisa merekam suara. Silakan isi manual.');
      return;
    }

    let aliran: MediaStream;
    try {
      aliran = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err: any) {
      toast.error(
        err?.name === 'NotAllowedError'
          ? 'Izin mikrofon ditolak. Izinkan lewat pengaturan Safari, lalu coba lagi.'
          : 'Mikrofon tidak bisa dipakai. Silakan isi manual.',
      );
      return;
    }

    // Safari menghasilkan mp4/aac, Chrome menghasilkan webm/opus. Dipilih yang
    // didukung perangkatnya, dan tipenya ikut dikirim supaya server tahu.
    const kandidat = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'];
    const tipe = kandidat.find((t) => MediaRecorder.isTypeSupported(t)) || '';

    const perekam = new MediaRecorder(aliran, tipe ? { mimeType: tipe } : undefined);
    perekamRef.current = perekam;
    const potongan: BlobPart[] = [];

    perekam.ondataavailable = (e) => { if (e.data.size > 0) potongan.push(e.data); };

    perekam.onstop = async () => {
      aliran.getTracks().forEach((t) => t.stop());
      perekamRef.current = null;
      isListeningRef.current = false;
      setIsMicOpen(false);

      const blob = new Blob(potongan, { type: tipe || 'audio/webm' });
      if (blob.size < 1200) {
        toast.error('Rekamannya terlalu pendek. Tahan sebentar sambil bicara.');
        return;
      }

      setIsLoading(true);
      const toastId = toast.loading('Mendengarkan ucapanmu...');
      try {
        const fd = new FormData();
        fd.append('audio', blob, `suara.${tipe.includes('mp4') ? 'm4a' : 'webm'}`);
        const { data } = await api.post('/api/scan/voice', fd);

        setFormData((prev) => ({
          ...prev,
          title: data.title || prev.title,
          amount: data.amount ? String(data.amount) : prev.amount,
          type: data.type || prev.type,
          category: data.category || prev.category,
        }));
        toast.success(data.ucapan ? `Dikenali: "${data.ucapan}"` : 'Berhasil dicatat!', { id: toastId });
      } catch (error) {
        toast.error(pesanApi(error, 'Gagal memproses suara'), { id: toastId });
      } finally {
        setIsLoading(false);
      }
    };

    isListeningRef.current = true;
    setIsMicOpen(true);
    perekam.start();

    // Batas aman: kalau pengguna lupa menekan berhenti, rekaman ditutup sendiri.
    setTimeout(() => {
      if (perekamRef.current?.state === 'recording') perekamRef.current.stop();
    }, 15000);
  };

  const handleVoice = async () => {
    // Kunci: ketukan kedua saat masih mendengarkan akan menutup sesi, bukan
    // menumpuk sesi baru. Dulu tanpa penjaga ini, ketukan beruntun membuat
    // Web Speech API melempar InvalidStateError bertubi-tubi.
    if (isListeningRef.current) {
      // Ketukan kedua = selesai bicara. Untuk jalur rekaman, inilah pemicu
      // pengiriman audionya; untuk Web Speech, cukup dihentikan.
      try { perekamRef.current?.stop(); } catch { /* abaikan */ }
      try { recognitionRef.current?.stop?.(); } catch { /* abaikan */ }
      isListeningRef.current = false;
      if (!perekamRef.current) setIsMicOpen(false);
      return;
    }

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    // Safari di iPhone/iPad TIDAK punya Web Speech API sama sekali, jadi tombol
    // ini dulu mati total di semua perangkat Apple. Jalur cadangannya: rekam
    // suaranya lalu kirim ke server, biarkan Gemini yang mendengar sekaligus
    // menyusun datanya. Hasilnya juga lebih pintar karena kalimat utuh dipahami,
    // bukan sekadar angka dicomot dengan pencocokan pola.
    if (!SpeechRecognition) {
      await rekamSuara();
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
            // KOLOM FLEX, bukan lapisan mengambang dengan jarak dipatok angka.
            // Versi lama menaruh bingkai pemindai di tengah layar dan tombol di
            // "bottom-40" — dua-duanya angka mati, sehingga pada tinggi layar
            // tertentu teks "Arahkan struk" tertimpa tombol rana. Dengan kolom
            // flex, area pemindai dan baris tombol saling membagi ruang, jadi
            // bertabrakan menjadi mustahil di ukuran layar mana pun.
            className="fixed inset-0 z-[70] bg-ink-950 flex flex-col"
          >
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="absolute inset-0 w-full h-full object-cover"
            />
            <canvas ref={canvasRef} className="hidden" />

            {/* Peredup supaya bingkai dan tombol tetap terbaca di atas gambar terang */}
            <div className="absolute inset-0 bg-gradient-to-b from-ink-950/50 via-transparent to-ink-950/80" />

            {/* AREA PEMINDAI — mengisi sisa ruang yang ada */}
            <div className="relative flex-1 min-h-0 flex flex-col items-center justify-center gap-5 px-6 pt-[calc(1rem+env(safe-area-inset-top,0px))]">
              <div className="relative w-[min(16rem,70vw)] aspect-[3/4] max-h-full">
                <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-brand-300 rounded-tl-lg" />
                <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-brand-300 rounded-tr-lg" />
                <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-brand-300 rounded-bl-lg" />
                <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-brand-300 rounded-br-lg" />
                <motion.div
                  // y (transform), bukan top: menganimasikan `top` memaksa
                  // browser menata ulang halaman 60x per detik dan itulah salah
                  // satu sumber patah-patah saat kamera terbuka di ponsel.
                  initial={{ y: 0 }}
                  animate={{ y: ['0%', '1900%', '0%'] }}
                  transition={{ repeat: Infinity, duration: 2.8, ease: 'linear' }}
                  className="absolute left-0 right-0 top-0 h-1 bg-brand-300 shadow-[0_0_20px_#5eead4] opacity-90"
                />
              </div>

              <p className="text-brand-200 font-semibold text-sm text-center bg-ink-950/60 rounded-full px-4 py-2 backdrop-blur-sm">
                Arahkan struk ke dalam kotak
              </p>
            </div>

            {/* BARIS TOMBOL — punya ruangnya sendiri, tidak menumpuk apa pun */}
            <div className="relative shrink-0 flex justify-center items-center gap-8 px-6 pt-4 pb-[calc(2rem+env(safe-area-inset-bottom,0px))]">
              <button
                type="button" onClick={closeCamera} aria-label="Tutup kamera"
                className="w-14 h-14 shrink-0 inline-flex items-center justify-center bg-danger-500/25 rounded-full text-danger-400 border border-danger-500/50 backdrop-blur-md active:scale-90 transition-transform"
              >
                <X size={24} />
              </button>
              <button
                type="button" onClick={capturePhoto} aria-label="Ambil foto struk"
                className="w-20 h-20 shrink-0 inline-flex items-center justify-center bg-brand-400 rounded-full text-ink-900 border-4 border-white/70 active:scale-90 transition-transform shadow-glow-brand"
              >
                <Aperture size={32} />
              </button>
              <label
                className="w-14 h-14 shrink-0 inline-flex items-center justify-center bg-white/20 rounded-full text-white backdrop-blur-md cursor-pointer border border-white/25 active:scale-90 transition-transform"
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
            {/* Label netral: pada Safari ketukan ini MENGIRIM rekaman, pada
                Chrome ia menutup sesi pengenalan. "Selesai Bicara" benar untuk
                keduanya, sedangkan "Batal" akan menyesatkan di jalur rekaman. */}
            <button type="button" onClick={() => void handleVoice()} className="btn-primary mt-8 px-8">
              Selesai Bicara
            </button>
            <p className="text-white/60 text-micro mt-3 text-center">
              Contoh: "beli kopi tiga puluh lima ribu"
            </p>
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
