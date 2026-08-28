import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const litsiftFilePath = path.join(__dirname, 'LitSift_Research_2026-08-28.litsift');

console.log('Loading .litsift file...');
const raw = fs.readFileSync(litsiftFilePath, 'utf-8');
const data = JSON.parse(raw);

console.log('\n=== WORKSPACE BUNDLE INFO ===');
console.log('Format:', data.format);
console.log('Version:', data.version);
console.log('Metadata:', JSON.stringify(data.metadata, null, 2));

console.log('\n=== PAPERS IN BUNDLE ===');
(data.pdfs || []).forEach((pdf, i) => {
  console.log(`[${i + 1}] ID: ${pdf.id}`);
  console.log(`    Title: ${pdf.title || pdf.name}`);
  console.log(`    SourceType: ${pdf.sourceType}`);
  console.log(`    Abstract length: ${pdf.abstractText?.length || 0} chars`);
  console.log(`    Sections count: ${pdf.sections?.length || 0}`);
  console.log(`    Tables count: ${pdf.tables?.length || 0}`);
  console.log(`    Figures count: ${pdf.figures?.length || 0}`);
  console.log(`    Base64 length: ${pdf.base64?.length || 0} chars`);
});

console.log('\n=== SCHEMA COLUMNS ===');
(data.grid?.columns || []).forEach((col, i) => {
  console.log(`[${i + 1}] field: "${col.field}" | header: "${col.headerName}"`);
});

console.log('\n=== GROUND TRUTH ROWS ===');
(data.grid?.rows || []).forEach((row, i) => {
  console.log(`\n--- Row ${i + 1} (ID: ${row.id}, Paper: "${row.pdfTitle || row.pdfId}") ---`);
  (data.grid?.columns || []).forEach((col) => {
    const val = row[col.field];
    const citation = row.citationMap?.[col.field];
    console.log(`  • ${col.headerName} (${col.field}): ${val ? `"${val}"` : '(Empty)'}`);
    if (citation?.snippetQuote) {
      console.log(`    [Citation]: "${citation.snippetQuote.slice(0, 100)}..." (Section: ${citation.sectionName}, Page: ${citation.pageNumber})`);
    }
  });
});
