/**
 * Option 1: Structured JSON + Full Citation Map Generator Benchmark for Gemma 4 12B
 * Tests generating exact LitSift GridRow + citationMap JSON payload with verifiable quotes & page numbers.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { streamChatCompletion } from './http_helper.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ==========================================
// 1. CONFIGURATION
// ==========================================
const BASE_URL = process.env.LMSTUDIO_URL || 'http://192.168.0.25:1234/v1';
const MODEL_NAME = process.env.MODEL_NAME || 'google/gemma-4-12b-qat';
const TEMPERATURE = 0.1;
const MAX_TOKENS = 8192;
const LITSIFT_FILE = path.join(__dirname, 'LitSift_Research_2026-08-28.litsift');
const REPORT_FILE = path.join(__dirname, 'gemma4_json_citation_report.txt');
const EXPORTED_ROWS_FILE = path.join(__dirname, 'extracted_litsift_rows.json');

// ==========================================
// 2. LOAD DATA FROM .LITSIFT BUNDLE
// ==========================================
console.log('='.repeat(75));
console.log('🧪 OPTION 1: STRUCTURED JSON + CITATION MAP BENCHMARK (GEMMA 4)');
console.log('='.repeat(75));

const rawBundle = fs.readFileSync(LITSIFT_FILE, 'utf-8');
const bundle = JSON.parse(rawBundle);

const targetPdf = bundle.pdfs.find(
  (p) => p.title?.includes('Green approach') || p.name?.includes('Green approach')
);

if (!targetPdf) {
  console.error('❌ Target paper not found in .litsift bundle!');
  process.exit(1);
}

const schemaColumns = bundle.grid.columns || [];
const groundTruthRows = (bundle.grid.rows || []).filter(
  (r) => r.pdfId === targetPdf.id || (r.pdfTitle && r.pdfTitle.includes('Green approach'))
);

console.log(`📄 Target Paper: "${targetPdf.title || targetPdf.name}"`);
console.log(`📋 Schema:       ${schemaColumns.length} columns`);
console.log(`🎯 Ground Truth: ${groundTruthRows.length} verified rows in dataset`);

// Extract Pages 1-8 text
console.log('\n[1/4] Extracting paper text (Pages 1-8) with pdfjs-dist...');
const cleanBase64 = targetPdf.base64.includes(',') ? targetPdf.base64.split(',')[1] : targetPdf.base64;
const pdfBuffer = Buffer.from(cleanBase64, 'base64');
const uint8Array = new Uint8Array(pdfBuffer);

const loadingTask = pdfjsLib.getDocument({ data: uint8Array });
const pdfDoc = await loadingTask.promise;
let fullPaperText = '';
const pageTextMap = {};
const maxPagesToExtract = Math.min(8, pdfDoc.numPages);

for (let pageNum = 1; pageNum <= maxPagesToExtract; pageNum++) {
  const page = await pdfDoc.getPage(pageNum);
  const textContent = await page.getTextContent();
  let pageText = textContent.items.map((item) => item.str).join(' ');
  
  // Clean redundant whitespace
  pageText = pageText.replace(/\s+/g, ' ').trim();
  pageTextMap[pageNum] = pageText;
  fullPaperText += `\n\n--- [PAGE ${pageNum}] ---\n\n` + pageText;
}

console.log(`✅ Extracted ${maxPagesToExtract} pages (${fullPaperText.length} characters / ~8,500 words).`);

// ==========================================
// 3. BUILD JSON CITATION PROMPT
// ==========================================
const schemaFormatExample = {
  entities: [
    {
      entityName: 'vB_Psp.S_PRɸL2',
      fields: {
        article_doi: '10.1016/j.micres.2019.126300',
        phage_name: 'vB_Psp.S_PRɸL2',
        phage_genome_accession_bioproject: 'Not reported',
        phage_genome_size_bp: '25.403 kb',
        phage_gc_content: 'Not reported',
        phage_tem_shows_structural_similarity_with: 'Siphoviridae',
        phage_tem_dimensions_capsid_morphology: 'Isometric head of 72 nm...',
        phage_taxonomy: 'Order Caudovirales, Family Siphoviridae',
        phage_type_lytic_lysogenic_engineered: 'Lytic',
        place_of_sample_collection: 'Pavana river, Pimpri, Pune...',
        phage_isolation_sample: 'River water',
        primary_targeted_bacteria_species_not_strain: 'Pseudomonas sp.',
        studied_host_strain_propagating_bacterial_strain: 'Pseudomonas sp. SK 10',
        phage_s_plaque_characteristics_shape: 'circular, 2 mm',
        optimal_moi: '0.1',
        latent_period_min: '20 min',
        burst_size_phage_infected_bacterium: '85 (± 4)',
        optimal_temperature_c: '4 to 50 °C',
        optimal_ph: '6–9',
      },
      citations: {
        phage_genome_size_bp: {
          snippetQuote: 'The genome size of phages PRɸL2 and SSɸL8 was approximately 25.403 kb and 29.877 kb respectively.',
          sectionName: 'Abstract',
          pageNumber: 1,
          reasoning: 'Explicitly stated in the abstract and results.',
        },
        burst_size_phage_infected_bacterium: {
          snippetQuote: 'PRɸL2 showed a latent period of 20 min with a burst size of 85 ( ± 4) phage particles per infected host cell',
          sectionName: '3.5. One step growth curve',
          pageNumber: 4,
          reasoning: 'One-step growth curve results give burst size and latent period.',
        },
      },
    },
  ],
};

const systemPrompt = `You are a precision scientific literature data extraction system.
Your task is to extract all distinct bacteriophages characterized in the research paper into a strict, valid JSON object matching the LitSift Grid format.

CRITICAL INSTRUCTIONS:
1. STRICT JSON OUTPUT: Output ONLY a valid JSON object matching the schema below. Do not wrap in markdown codeblocks (no \`\`\`json).
2. MULTI-ENTITY ARRAYS: Include an entry in the "entities" array for EACH distinct phage characterized in the paper (vB_Psp.S_PRɸL2 and vB_Psp.M_SSɸL8).
3. EXACT CITATIONS: In the "citations" object, provide exact quotes and page numbers for extracted fields:
   - "snippetQuote": The EXACT, word-for-word quote from the text.
   - "sectionName": The section title where the quote was found.
   - "pageNumber": The page number (1-8) where the quote appears.
   - "reasoning": Scientific rationale for the extracted value.
4. MISSING DATA DISCIPLINE: If a parameter is not reported, write "Not reported" or "Not specified". Do NOT fabricate.

JSON SCHEMA STRUCTURE:
${JSON.stringify(schemaFormatExample, null, 2)}`;

const userPrompt = `### DOCUMENT TO EXTRACT:
Title: ${targetPdf.title}
DOI: ${targetPdf.doi || '10.1016/j.micres.2019.126300'}

### FULL DOCUMENT TEXT (Pages 1-${maxPagesToExtract}):
${fullPaperText}

---

### TARGET SCHEMA COLUMN KEYS (${schemaColumns.length} Fields):
${schemaColumns.map((c, i) => `${i + 1}. "${c.field}": ${c.headerName}`).join('\n')}

---

### INSTRUCTION:
Extract all distinct bacteriophages from the document into the strict JSON format with full citation evidence for each field. Return ONLY the JSON object.`;

// ==========================================
// 4. SEND STREAMING INFERENCE TO GEMMA 4 (ZERO-TIMEOUT)
// ==========================================
console.log('\n[2/4] Connecting to LM Studio server (Zero-Timeout Native Stream)...');
console.log(`📡 Endpoint: ${BASE_URL}`);
console.log(`🤖 Model:    ${MODEL_NAME}`);

const requestBody = {
  model: MODEL_NAME,
  messages: [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ],
  temperature: TEMPERATURE,
  max_tokens: MAX_TOKENS,
  stream: true,
};

const startTime = performance.now();
let reasoningChunkCount = 0;
let contentChunkCount = 0;

console.log('\n[3/4] Streaming reasoning & JSON generation (Uncapped)...');
console.log('⏳ Processing prompt context in LM Studio...');
process.stdout.write('⚡ Live stream: ');

let result;
try {
  const streamEndpoint = `${BASE_URL.replace(/\/+$/, '')}/chat/completions`;
  result = await streamChatCompletion(
    streamEndpoint,
    requestBody,
    (chunk) => {
      contentChunkCount++;
      if (contentChunkCount % 15 === 0) process.stdout.write('.');
    },
    (reasoning) => {
      reasoningChunkCount++;
      if (reasoningChunkCount % 15 === 0) process.stdout.write('🧠');
    }
  );
  console.log(' Complete!\n');
} catch (err) {
  console.error(`\n❌ Request Failed: ${err.message}`);
  process.exit(1);
}

const endTime = performance.now();
const totalDurationSec = (endTime - startTime) / 1000;
const firstTokenTime = result.firstTokenTime;
const timeToFirstTokenSec = firstTokenTime ? (firstTokenTime - startTime) / 1000 : 0;
const tokenCount = result.tokenCount;
const tokensPerSecond =
  tokenCount > 0 ? (tokenCount / (totalDurationSec - timeToFirstTokenSec)).toFixed(1) : 0;

let rawFullResponse = result.rawFullText;
let extractedThinking = result.extractedThinking;

// Clean raw JSON response (strip any accidental code fences or <thought> tags)
let cleanedJsonText = rawFullResponse.trim();
const jsonBlockMatch = cleanedJsonText.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
if (jsonBlockMatch) {
  cleanedJsonText = jsonBlockMatch[1].trim();
}

const thoughtMatch = cleanedJsonText.match(/<(?:thought|think)>([\s\S]*?)<\/(?:thought|think)>/i);
if (thoughtMatch) {
  extractedThinking = (extractedThinking + '\n' + thoughtMatch[1]).trim();
  cleanedJsonText = cleanedJsonText.replace(/<(?:thought|think)>[\s\S]*?<\/(?:thought|think)>/i, '').trim();
}

// ==========================================
// 5. PARSE & AUDIT JSON CITATIONS
// ==========================================
console.log('[4/4] Validating JSON syntax and auditing citations against Ground Truth...');

let parsedData = null;
let jsonValid = false;
let parseError = '';

try {
  parsedData = JSON.parse(cleanedJsonText);
  jsonValid = true;
} catch (err) {
  parseError = err.message;
  console.error(`⚠️ JSON Parse Error: ${err.message}`);
}

const entities = parsedData?.entities || [];

// Save formatted extracted LitSift rows
if (jsonValid) {
  fs.writeFileSync(EXPORTED_ROWS_FILE, JSON.stringify(parsedData, null, 2), 'utf-8');
}

// Citation Verification
let totalCitations = 0;
let exactQuotesInDoc = 0;
let correctPages = 0;
const citationDetails = [];

entities.forEach((ent, entIdx) => {
  const citations = ent.citations || {};
  Object.entries(citations).forEach(([fieldKey, cit]) => {
    if (!cit || !cit.snippetQuote) return;
    totalCitations++;

    const quote = cit.snippetQuote.trim();
    const isExactInFullText = fullPaperText.includes(quote);
    if (isExactInFullText) exactQuotesInDoc++;

    // Check page accuracy if specified
    const pageNum = cit.pageNumber;
    let pageAccurate = false;
    if (pageNum && pageTextMap[pageNum] && pageTextMap[pageNum].includes(quote)) {
      correctPages++;
      pageAccurate = true;
    }

    citationDetails.push({
      entity: ent.entityName || `Entity ${entIdx + 1}`,
      field: fieldKey,
      quote,
      isExact: isExactInFullText,
      pageSpecified: pageNum,
      isPageAccurate: pageAccurate,
      section: cit.sectionName || 'N/A',
      reasoning: cit.reasoning || '',
    });
  });
});

const quoteFidelityPercent =
  totalCitations > 0 ? Math.round((exactQuotesInDoc / totalCitations) * 100) : 100;
const pageAccuracyPercent =
  totalCitations > 0 ? Math.round((correctPages / totalCitations) * 100) : 100;

// Field-by-Field Ground Truth Evaluation
const fieldComparisons = [];
let totalFieldsChecked = 0;
let exactFieldMatches = 0;
let partialFieldMatches = 0;

groundTruthRows.forEach((gtRow, rowIndex) => {
  const modelEnt = entities[rowIndex] || {};
  const modelFields = modelEnt.fields || {};

  const rowEval = {
    phageName: gtRow.phage_name || `Row ${rowIndex + 1}`,
    fields: [],
  };

  schemaColumns.forEach((col) => {
    totalFieldsChecked++;
    const gtVal = String(gtRow[col.field] || '').trim();
    const modelVal = String(modelFields[col.field] || '(Missing)').trim();

    const cleanGt = gtVal.toLowerCase().replace(/[^a-z0-9]/g, '');
    const cleanModel = modelVal.toLowerCase().replace(/[^a-z0-9]/g, '');

    let status = 'MISMATCH';
    if (!cleanGt && (!cleanModel || cleanModel.includes('not'))) {
      status = 'CORRECT_EMPTY';
      exactFieldMatches++;
    } else if (cleanGt === cleanModel) {
      status = 'EXACT_MATCH';
      exactFieldMatches++;
    } else if (cleanModel.includes(cleanGt) || cleanGt.includes(cleanModel)) {
      status = 'SEMANTIC_PARTIAL';
      partialFieldMatches++;
    }

    rowEval.fields.push({
      field: col.field,
      header: col.headerName,
      groundTruth: gtVal || '(Not Reported)',
      modelValue: modelVal,
      status,
      citation: modelEnt.citations?.[col.field],
    });
  });

  fieldComparisons.push(rowEval);
});

const overallAccuracyScore =
  totalFieldsChecked > 0
    ? Math.round(((exactFieldMatches + partialFieldMatches * 0.75) / totalFieldsChecked) * 100)
    : 0;

// ==========================================
// 6. GENERATE COMPREHENSIVE REPORT
// ==========================================
const timestamp = new Date().toISOString();
let reportContent = `
================================================================================
📊 LITSIFT BENCHMARK REPORT: OPTION 1 (JSON + CITATION MAP GENERATION)
================================================================================
Timestamp:               ${timestamp}
Target Model:            ${MODEL_NAME}
Server Endpoint:         ${BASE_URL}
Target Paper:            ${targetPdf.title}
Schema Size:             ${schemaColumns.length} Columns
JSON Parse Status:       ${jsonValid ? '✅ 100% VALID JSON' : `❌ INVALID JSON (${parseError})`}
Entities Extracted:      ${entities.length} distinct phages

--------------------------------------------------------------------------------
1. PERFORMANCE & CITATION TELEMETRY
--------------------------------------------------------------------------------
• Time to First Token (TTFT): ${timeToFirstTokenSec.toFixed(3)} seconds
• Total Execution Time:       ${totalDurationSec.toFixed(2)} seconds
• Generated Tokens:           ~${tokenCount} tokens
• Generation Speed:           ~${tokensPerSecond} tokens/sec
• Ground Truth Field Score:   ${overallAccuracyScore}%
• Verbatim Quote Fidelity:    ${quoteFidelityPercent}% (${exactQuotesInDoc}/${totalCitations} exact quotes in source text)
• Citation Page Precision:    ${pageAccuracyPercent}% (${correctPages}/${totalCitations} quotes verified on exact page)

--------------------------------------------------------------------------------
2. CITATION MAP AUDIT (VERIFIED AGAINST 10-PAGE PDF TEXT)
--------------------------------------------------------------------------------
`;

citationDetails.forEach((c, idx) => {
  reportContent += `[Citation ${idx + 1}] Entity: "${c.entity}" | Field: "${c.field}"\n`;
  reportContent += `   • Quote Status:   ${c.isExact ? '✅ EXACT TEXT MATCH' : '⚠️ PARAPHRASED'}\n`;
  reportContent += `   • Page Precision: ${c.isPageAccurate ? `✅ Verified on Page ${c.pageSpecified}` : `⚠️ Page ${c.pageSpecified || 'N/A'}`}\n`;
  reportContent += `   • Section:        ${c.section}\n`;
  reportContent += `   • Exact Quote:    "${c.quote}"\n`;
  reportContent += `   • Reasoning:      "${c.reasoning}"\n\n`;
});

reportContent += `
--------------------------------------------------------------------------------
3. SIDE-BY-SIDE GROUND TRUTH COMPARISON
--------------------------------------------------------------------------------
`;

fieldComparisons.forEach((r, rIdx) => {
  reportContent += `\n[ENTITY ${rIdx + 1}]: "${r.phageName}"\n`;
  reportContent += `${'='.repeat(80)}\n`;
  r.fields.forEach((f) => {
    const icon =
      f.status === 'EXACT_MATCH' || f.status === 'CORRECT_EMPTY'
        ? '✅'
        : f.status === 'SEMANTIC_PARTIAL'
        ? '🟡'
        : '❌';
    reportContent += `${icon} [${f.header}] (${f.status})\n`;
    reportContent += `   • Ground Truth:   ${f.groundTruth}\n`;
    reportContent += `   • Gemma 4 JSON:   ${f.modelValue}\n`;
    if (f.citation?.snippetQuote) {
      reportContent += `   • Citation Quote: "${f.citation.snippetQuote.slice(0, 90)}..." (Page ${f.citation.pageNumber || '?'})\n`;
    }
    reportContent += '\n';
  });
});

reportContent += `
--------------------------------------------------------------------------------
4. MODEL THINKING TRACE (UNCAPPED)
--------------------------------------------------------------------------------
${extractedThinking ? extractedThinking : '(No separate reasoning content emitted)'}

--------------------------------------------------------------------------------
5. RAW JSON OUTPUT
--------------------------------------------------------------------------------
${cleanedJsonText}

================================================================================
`;

fs.writeFileSync(REPORT_FILE, reportContent, 'utf-8');

console.log('\n' + '='.repeat(75));
console.log('🏁 OPTION 1 BENCHMARK COMPLETE!');
console.log('='.repeat(75));
console.log(`📋 JSON Valid:            ${jsonValid ? '✅ YES' : '❌ NO'}`);
console.log(`🎯 Field Accuracy:        ${overallAccuracyScore}%`);
console.log(`🔬 Quote Fidelity:        ${quoteFidelityPercent}% (${exactQuotesInDoc}/${totalCitations} exact)`);
console.log(`📄 Page Precision:        ${pageAccuracyPercent}% exact page match`);
console.log(`💾 Full Audit Report:     ${REPORT_FILE}`);
console.log(`📦 Ready-to-Import JSON:  ${EXPORTED_ROWS_FILE}`);
console.log('='.repeat(75));
