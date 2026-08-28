import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const litsiftFilePath = path.join(__dirname, 'LitSift_Research_2026-08-28.litsift');
const raw = fs.readFileSync(litsiftFilePath, 'utf-8');
const data = JSON.parse(raw);

const targetPdf = data.pdfs.find(p => p.title?.includes('Green approach') || p.name?.includes('Green approach'));
console.log('Base64 length:', targetPdf?.base64?.length || 0);
console.log('Base64 preview:', targetPdf?.base64?.slice(0, 100));

// Check if any papers in the workspace have structured text
let structuredCount = 0;
let base64Count = 0;
data.pdfs.forEach(p => {
  if (p.sections?.length > 0 || p.abstractText) structuredCount++;
  if (p.base64) base64Count++;
});
console.log(`Summary of ${data.pdfs.length} PDFs: ${structuredCount} have structured text, ${base64Count} have Base64 PDF.`);
