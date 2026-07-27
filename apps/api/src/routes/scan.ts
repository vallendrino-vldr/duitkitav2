import { Router } from 'express';
import multer from 'multer';
import { GoogleGenAI } from '@google/genai';
import { requireUser } from '../middleware/auth';

const router = Router();

// Batas ukuran & tipe: tanpa ini satu unggahan besar bisa menghabiskan memori server.
const upload = multer({
  limits: { fileSize: 4 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^image\/(jpeg|png|webp)$/.test(file.mimetype)) cb(null, true);
    else cb(new Error('Format gambar tidak didukung'));
  },
});

import { config } from '../config';

// Diverifikasi hidup pada Juli 2026. gemini-1.5-flash sudah dipensiunkan (404),
// jadi nama model dibuat bisa diganti lewat .env tanpa mengubah kode.
const MODEL = config.geminiModel;
const KUNCI = config.geminiKeys;

const SYSTEM_INSTRUCTION =
  'Parse financial data from a receipt image. Return ONLY valid JSON, no markdown, no backticks.\n' +
  'If the image IS a receipt/invoice/bill, return: ' +
  '{ "title": string, "amount": number, "type": "expense"|"income", "category": string }. ' +
  'Amount must be a plain number without currency symbols or separators. ' +
  'Category and title must be in Bahasa Indonesia.\n' +
  'If the image is NOT a receipt, return instead: ' +
  '{ "bukan_struk": true, "isi_gambar": string } where isi_gambar names what the picture ' +
  'actually shows, in Bahasa Indonesia, 1-4 words (contoh: "wajah orang", "kucing", ' +
  '"papan ketik laptop", "pemandangan", "layar komputer", "makanan").';

/**
 * Ledekan ringan saat penggunanya memotret benda yang jelas bukan struk.
 *
 * Sebelumnya semua kegagalan dijawab "Gagal membaca struk" — pengguna mengira
 * aplikasinya rusak, padahal AI-nya bekerja dengan benar dan memang fotonya
 * yang salah. Menyebut isi gambarnya membuat sebabnya langsung jelas.
 */
function ledekan(isi: string): string {
  const bersih = (isi || 'sesuatu').trim().toLowerCase();
  const pilihan = [
    `Ini ${bersih}, bukan struk 😅 Coba foto struknya ya.`,
    `Yang kefoto malah ${bersih}. Struknya mana nih?`,
    `AI-nya bingung — dia liat ${bersih}, bukan struk belanja.`,
    `Hmm, ${bersih} ga bisa dijadiin catatan pengeluaran. Foto struknya dong.`,
    `Gagal baca: ini ${bersih}. Arahin ke struk, bukan ke ${bersih} 😄`,
  ];
  // Dipilih dari panjang teks, bukan acak, supaya isi gambar yang sama
  // selalu memberi jawaban sama dan tidak terasa seperti kesalahan acak.
  return pilihan[bersih.length % pilihan.length];
}

export interface HasilParsing {
  title: string;
  amount: number;
  type: 'expense' | 'income';
  category: string;
}

const KATEGORI_VALID = ['Makanan', 'Transportasi', 'Hiburan', 'Tagihan', 'Belanja', 'Kesehatan'];

/**
 * Memvalidasi balasan model. Model bahasa bisa mengembalikan bentuk apa pun;
 * tanpa lapisan ini, `amount` berupa teks atau field yang hilang akan langsung
 * masuk ke form dan menghasilkan transaksi bernilai NaN.
 */
function validasi(mentah: unknown): HasilParsing {
  if (!mentah || typeof mentah !== 'object') throw new Error('Balasan AI bukan objek');
  const o = mentah as Record<string, unknown>;

  const angka = typeof o.amount === 'number' ? o.amount : Number(String(o.amount ?? '').replace(/[^\d.-]/g, ''));
  if (!Number.isFinite(angka) || angka <= 0) throw new Error('Nominal tidak terbaca');

  const tipe = o.type === 'income' ? 'income' : 'expense';
  const judul = typeof o.title === 'string' && o.title.trim() ? o.title.trim().slice(0, 120) : 'Transaksi';

  let kategori = typeof o.category === 'string' && o.category.trim() ? o.category.trim().slice(0, 40) : 'Belanja';
  const cocok = KATEGORI_VALID.find((k) => k.toLowerCase() === kategori.toLowerCase());
  if (cocok) kategori = cocok;

  return { title: judul, amount: Math.round(angka), type: tipe, category: kategori };
}

function bersihkanJson(teks: string): unknown {
  const bersih = teks.replace(/```json/gi, '').replace(/```/g, '').trim();
  return JSON.parse(bersih);
}

/**
 * Menjalankan prompt, mencoba kunci cadangan bila kunci utama kena limit/tolak.
 */
async function generate(parts: any[], jsonMode: boolean, instruksi?: string): Promise<string> {
  if (KUNCI.length === 0) throw new Error('GEMINI_API_KEY belum diatur');

  let terakhir: unknown;
  for (const apiKey of KUNCI) {
    try {
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: MODEL,
        contents: [{ role: 'user', parts }],
        config: jsonMode
          ? {
              systemInstruction: instruksi ?? SYSTEM_INSTRUCTION,
              responseMimeType: 'application/json',
            }
          : {},
      });

      // `.text` itu PROPERTY, bukan fungsi. Kode lama memanggil `response.text()`
      // sehingga selalu melempar "response.text is not a function".
      const teks = response.text;
      if (!teks) throw new Error('Balasan AI kosong');
      return teks;
    } catch (e) {
      console.error(`[GEMINI] gagal dengan salah satu kunci:`, e);
      terakhir = e;
    }
  }
  throw terakhir instanceof Error ? terakhir : new Error('Semua kunci Gemini gagal');
}

router.post('/receipt', requireUser, upload.single('receipt'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Tidak ada gambar struk' });

  try {
    const teks = await generate(
      [
        { inlineData: { data: req.file.buffer.toString('base64'), mimeType: req.file.mimetype } },
        { text: 'Extract the total amount, suggest a title, determine if it is an expense or income, and suggest a category based on this receipt.' },
      ],
      true,
    );

    const mentah = bersihkanJson(teks) as Record<string, unknown>;

    // Bukan struk: jawab 422 (permintaannya sah, isinya yang tidak cocok)
    // dengan pesan yang menyebut isi gambarnya, bukan galat teknis.
    if (mentah && mentah.bukan_struk === true) {
      return res.status(422).json({ error: ledekan(String(mentah.isi_gambar ?? 'sesuatu')) });
    }

    res.json(validasi(mentah));
  } catch (error) {
    console.error('Error scanning receipt:', error);
    res.status(502).json({ error: 'Gagal membaca struk. Coba foto ulang lebih terang dan fokus.' });
  }
});

/** Unggahan audio: format yang dihasilkan perekam browser berbeda-beda. */
const uploadAudio = multer({
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^audio\//.test(file.mimetype) || /^video\/(mp4|webm)$/.test(file.mimetype)) cb(null, true);
    else cb(new Error('Format audio tidak didukung'));
  },
});

const INSTRUKSI_SUARA =
  'Kamu mengubah ucapan bahasa Indonesia sehari-hari menjadi satu transaksi keuangan.\n' +
  'Balas HANYA JSON, tanpa markdown, tanpa backtick.\n' +
  'Jika ucapannya adalah transaksi, balas: ' +
  '{ "title": string, "amount": number, "type": "expense"|"income", "category": string, "ucapan": string }\n' +
  'Aturan angka: pahami sebutan lisan Indonesia. ' +
  '"lima puluh ribu"=50000, "seratus dua puluh ribu"=120000, "dua juta setengah"=2500000, ' +
  '"gocap"=50000, "cepek"=100000, "goceng"=5000, "seceng"=1000, "ceban"=10000, ' +
  '"25rb"/"25k"/"25 ribu"=25000, "1,5 juta"=1500000. Keluarkan angka polos tanpa titik/koma.\n' +
  'type: "income" untuk gaji, bonus, terima uang, dibayar, jualan laku. ' +
  'Selain itu "expense".\n' +
  'category pilih SATU yang paling cocok dari: Makanan, Transportasi, Hiburan, Tagihan, ' +
  'Belanja, Kesehatan, Gaji, Lainnya.\n' +
  'title: ringkas, rapi, huruf kapital di awal, TANPA menyebut nominal. ' +
  'Contoh "beli kopi di starbucks tiga puluh lima ribu" -> title "Beli Kopi di Starbucks".\n' +
  'ucapan: salin apa adanya yang kamu dengar.\n' +
  'Jika audio tidak berisi transaksi apa pun (kosong, berisik, atau ngobrol biasa), balas: ' +
  '{ "bukan_transaksi": true, "ucapan": string }';

/**
 * Mengubah rekaman suara menjadi transaksi.
 *
 * Dibuat karena Safari di iPhone TIDAK mendukung Web Speech API sama sekali,
 * sehingga tombol catat suara mati total di seluruh perangkat Apple. Di sini
 * audionya dikirim apa adanya ke Gemini, yang sekaligus mendengar DAN menyusun
 * datanya — jadi hasilnya juga lebih pintar daripada pengenalan kata mentah
 * yang dulu cuma menebak angka lewat pencocokan pola.
 */
router.post('/voice', requireUser, uploadAudio.single('audio'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Tidak ada rekaman suara' });

  try {
    const teks = await generate(
      [
        { inlineData: { data: req.file.buffer.toString('base64'), mimeType: req.file.mimetype } },
        { text: 'Dengarkan rekaman ini lalu ubah menjadi satu transaksi keuangan sesuai aturan.' },
      ],
      true,
      INSTRUKSI_SUARA,
    );

    const mentah = bersihkanJson(teks) as Record<string, unknown>;

    if (mentah && mentah.bukan_transaksi === true) {
      const ucapan = String(mentah.ucapan ?? '').trim();
      return res.status(422).json({
        error: ucapan
          ? `Kedengarannya "${ucapan}" — itu belum kelihatan seperti transaksi. Sebut nominalnya juga ya.`
          : 'Suaranya nggak kedengeran. Coba ngomong lebih dekat ke mikrofon.',
      });
    }

    res.json({ ...validasi(mentah), ucapan: String(mentah.ucapan ?? '') });
  } catch (error) {
    console.error('Error memproses suara:', error);
    res.status(502).json({ error: 'Gagal memproses suara. Coba ulangi.' });
  }
});

router.post('/roast', requireUser, async (req, res) => {
  const { income, expense, topCategory } = req.body ?? {};
  try {
    const teks = await generate(
      [{
        text:
          'Roast gaya bahasa anak Jaksel yang pedas, savage, tapi lucu. ' +
          `Pemasukan gue Rp ${Number(income) || 0}, pengeluaran Rp ${Number(expense) || 0}, ` +
          `paling boros di kategori ${String(topCategory || 'nggak jelas')}. Maksimal 2 kalimat pendek.`,
      }],
      false,
    );
    res.json({ roast: teks.trim() });
  } catch (error) {
    console.error('Error roasting:', error);
    res.status(502).json({ roast: 'Gagal koneksi ke Gemini AI. Coba lagi nanti bro.' });
  }
});

export default router;
