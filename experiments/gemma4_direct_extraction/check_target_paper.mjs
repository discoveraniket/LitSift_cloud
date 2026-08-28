import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const litsiftFilePath = path.join(__dirname, 'LitSift_Research_2026-08-28.litsift');
const raw = fs.readFileSync(litsiftFilePath, 'utf-8');
const data = JSON.parse(raw);

const targetPdf = data.pdfs.find(p => p.title?.includes('Green approach') || p.name?.includes('Green approach'));

if (targetPdf) {
  console.log('=== TARGET PDF FOUND ===');
  console.log('ID:', targetPdf.id);
  console.log('Title:', targetPdf.title);
  console.log('DOI:', targetPdf.doi);
  console.log('SourceType:', targetPdf.sourceType);
  console.log('Has Abstract:', !!targetPdf.abstractText, `(length: ${targetPdf.abstractText?.length})`);
  console.log('Sections:', targetPdf.sections?.length || 0);
  (targetPdf.sections || []).forEach((sec, i) => {
    console.log(`  [Sec ${i + 1}] ${sec.title} (${sec.content?.length || 0} chars)`);
  });
  console.log('Tables:', targetPdf.tables?.length || 0);
  (targetPdf.tables || []).forEach((tbl, i) => {
    console.log(`  [Table ${i + 1}] ${tbl.label || ''} ${tbl.caption || ''}`);
  });
} else {
  console.log('Target PDF not found in bundle. Listing all paper titles:');
  data.pdfs.forEach((p, i) => console.log(`[${i + 1}] ${p.title || p.name}`));
}
