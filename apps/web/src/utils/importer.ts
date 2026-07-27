import * as XLSX from 'xlsx';
import { extractPdfData } from './pdfExtractor';

export interface DraftImport {
  id: string; // temp id for UI list
  date: Date;
  title: string;
  amount: number;
  type: 'income' | 'expense' | 'transfer';
  category: string;
  walletName: string;
  receiptUrl?: string; // from XLSX
  receiptBlob?: Blob; // from PDF
  isValid: boolean;
  validationError?: string;
  selectedTabId?: string; // determined in UI
}

const parseAmount = (val: string): number => {
  if (!val) return 0;
  // "70.000" -> 70000
  const clean = val.replace(/\./g, '').replace(/,/g, '');
  return parseInt(clean, 10) || 0;
};

const parseDate = (val: string): Date => {
  if (!val) return new Date();
  // "27 Jul 2026"
  const months = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
  const parts = val.split(' ');
  if (parts.length === 3) {
    const d = parseInt(parts[0], 10);
    const m = months.indexOf(parts[1]);
    const y = parseInt(parts[2], 10);
    if (m !== -1) {
      return new Date(y, m, d);
    }
  }
  return new Date(val); // fallback
};

export const parseXLSX = async (file: File): Promise<DraftImport[]> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<string[]>(firstSheet, { header: 1 });
        
        const drafts: DraftImport[] = [];
        let hasStarted = false;

        for (const row of rows) {
          if (!row || row.length === 0) continue;
          
          if (row[0] === 'Kategori' && row[1] === 'Catatan') {
            hasStarted = true;
            continue;
          }

          if (hasStarted && row[0] && row[6]) {
            const rawCategory = row[0];
            const rawNotes = row[1] || '';
            const rawAmount = row[2] || '0';
            // row[3] is Mata Uang
            const rawType = row[4] || '';
            const rawWallet = row[5] || '';
            const rawDate = row[6] || '';
            const rawPhoto = row[7] || '';

            // Map type
            let type: 'income' | 'expense' | 'transfer' = 'expense';
            if (rawType.toLowerCase().includes('pemasukan')) type = 'income';

            drafts.push({
              id: crypto.randomUUID(),
              category: rawCategory.charAt(0).toUpperCase() + rawCategory.slice(1).toLowerCase(), // title case
              title: rawNotes,
              amount: parseAmount(rawAmount),
              type,
              walletName: rawWallet.trim(),
              date: parseDate(rawDate),
              receiptUrl: rawPhoto ? rawPhoto.split('\n')[0] : undefined, // taking first photo if multiple
              isValid: true
            });
          }
        }
        resolve(drafts);
      } catch (err) {
        reject(err);
      }
    };
    reader.readAsBinaryString(file);
  });
};

export const parsePDFFile = async (file: File): Promise<DraftImport[]> => {
  return extractPdfData(file);
};
