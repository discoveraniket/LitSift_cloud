import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LITSIFT_FILE = path.join(__dirname, 'LitSift_Research_2026-08-28.litsift');
const rawBundle = fs.readFileSync(LITSIFT_FILE, 'utf-8');
const bundle = JSON.parse(rawBundle);

const targetPdf = bundle.pdfs.find(
  (p) => p.title?.includes('Green approach') || p.name?.includes('Green approach')
);

const cleanBase64 = targetPdf.base64.includes(',') ? targetPdf.base64.split(',')[1] : targetPdf.base64;
const pdfBuffer = Buffer.from(cleanBase64, 'base64');
const uint8Array = new Uint8Array(pdfBuffer);

const loadingTask = pdfjsLib.getDocument({ data: uint8Array });
const pdfDoc = await loadingTask.promise;

for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
  const page = await pdfDoc.getPage(pageNum);
  const textContent = await page.getTextContent();
  const pageText = textContent.items.map((item) => item.str).join(' ');
  console.log(`Page ${pageNum}: ${pageText.length} chars | Starts with: "${pageText.slice(0, 80).replace(/\n/g, ' ')}..."`);
}
