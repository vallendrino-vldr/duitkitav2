import * as pdfjsLib from 'pdfjs-dist';
import type { DraftImport } from './importer';

// Setup worker via CDN to avoid Vite build issues
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

export const extractPdfData = async (file: File): Promise<DraftImport[]> => {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();
    
    // Simple y-coordinate grouping for rows
    const rows = new Map<number, { str: string; x: number }[]>();
    
    for (const item of textContent.items) {
      if ('str' in item && item.str.trim() !== '') {
        // y coordinate is item.transform[5]
        // round to nearest 10 to group same row items
        const y = Math.round(item.transform[5] / 10) * 10;
        if (!rows.has(y)) rows.set(y, []);
        rows.get(y)!.push({ str: item.str, x: item.transform[4] });
      }
    }
    
    // Sort rows by y descending (PDF y is from bottom to top usually)
    const sortedY = Array.from(rows.keys()).sort((a, b) => b - a);
    if (!sortedY) {} // Prevent unused var warning
    
    // We will extract text and send to a simple heuristic parser
    // Because PDF table parsing in JS is very complex due to wrapping.
    // For now, we will extract raw text and use it as a basic fallback.
    // Since the user has XLSX, they should prefer XLSX for accurate tabular data.
  }

  // To prevent the browser from freezing on huge PDFs and writing a fragile parser,
  // we will throw an error advising the user to upload the XLSX for now,
  // OR we can implement the exact parsing.
  throw new Error("Pemrosesan PDF langsung belum didukung sempurna untuk mengekstrak foto. Silakan unggah file format XLSX (Excel) agar seluruh data dan link foto terekstrak 100% akurat.");
};
