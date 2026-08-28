import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const litsiftFilePath = path.join(__dirname, 'LitSift_Research_2026-08-28.litsift');
const raw = fs.readFileSync(litsiftFilePath, 'utf-8');
const data = JSON.parse(raw);

const targetPdf = data.pdfs.find(p => p.title?.includes('Green approach') || p.name?.includes('Green approach'));

if (!targetPdf || !targetPdf.base64) {
  console.error('Target PDF base64 not found!');
  process.exit(1);
}

const cleanBase64 = targetPdf.base64.includes(',') ? targetPdf.base64.split(',')[1] : targetPdf.base64;
const pdfBuffer = Buffer.from(cleanBase64, 'base64');
const uint8Array = new Uint8Array(pdfBuffer);

async function extractText() {
  const loadingTask = pdfjsLib.getDocument({ data: uint8Array });
  const pdfDoc = await loadingTask.promise;
  console.log(`Loaded PDF with ${pdfDoc.numPages} pages.`);

  let fullText = '';
  for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
    const page = await pdfDoc.getPage(pageNum);
    const textContent = await page.getTextContent();
    const pageText = textContent.items.map(item => item.str).join(' ');
    fullText += `\n\n--- [PAGE ${pageNum}] ---\n\n` + pageText;
  }

  console.log(`Extracted full text: ${fullText.length} characters.`);
  console.log('\nPreview (First 600 chars):');
  console.log(fullText.slice(0, 600));
}

extractText().catch(console.error);
