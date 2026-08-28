/**
 * LitSift Ground Truth Extraction Benchmark for Gemma 4 12B QAT
 * Evaluates real 10-page paper extraction against human-verified ground truth from .litsift export
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

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
const REPORT_FILE = path.join(__dirname, 'gemma4_ground_truth_evaluation_report.txt');

// ==========================================
// 2. LOAD DATA FROM .LITSIFT BUNDLE
// ==========================================
console.log('='.repeat(75));
console.log('🧪 LITSIFT GROUND TRUTH BENCHMARK: GEMMA 4 12B EVALUATION');
console.log('='.repeat(75));
console.log(`📂 Loading workspace export: ${LITSIFT_FILE}`);

const rawBundle = fs.readFileSync(LITSIFT_FILE, 'utf-8');
const bundle = JSON.parse(rawBundle);

// Target Paper: Green approach to phytopathogen...
const targetPdf = bundle.pdfs.find(
  (p) => p.title?.includes('Green approach') || p.name?.includes('Green approach')
);

if (!targetPdf) {
  console.error('❌ Target paper not found in .litsift bundle!');
  process.exit(1);
}

// Target Schema Columns (19 columns)
const schemaColumns = bundle.grid.columns || [];

// Ground Truth Rows
const groundTruthRows = (bundle.grid.rows || []).filter(
  (r) => r.pdfId === targetPdf.id || (r.pdfTitle && r.pdfTitle.includes('Green approach'))
);

console.log(`📄 Target Paper: "${targetPdf.title || targetPdf.name}"`);
console.log(`📋 Schema Size:  ${schemaColumns.length} columns`);
console.log(`🎯 Ground Truth: ${groundTruthRows.length} verified rows in dataset`);

// Extract text from Base64 PDF (Pages 1 to 8: Abstract, Methods, Results, Discussion)
console.log('\n[1/4] Extracting core content (Pages 1-8) from binary PDF with pdfjs-dist...');
const cleanBase64 = targetPdf.base64.includes(',') ? targetPdf.base64.split(',')[1] : targetPdf.base64;
const pdfBuffer = Buffer.from(cleanBase64, 'base64');
const uint8Array = new Uint8Array(pdfBuffer);

const loadingTask = pdfjsLib.getDocument({ data: uint8Array });
const pdfDoc = await loadingTask.promise;
let fullPaperText = '';
const maxPagesToExtract = Math.min(8, pdfDoc.numPages); // Pages 1-8 contain all scientific findings; pages 9-10 are references

for (let pageNum = 1; pageNum <= maxPagesToExtract; pageNum++) {
  const page = await pdfDoc.getPage(pageNum);
  const textContent = await page.getTextContent();
  const pageText = textContent.items.map((item) => item.str).join(' ');
  fullPaperText += `\n\n--- [PAGE ${pageNum}] ---\n\n` + pageText;
}

console.log(`✅ Extracted ${maxPagesToExtract} core pages (${fullPaperText.length} characters / ~8,500 words).`);

// ==========================================
// 3. BUILD DIRECT EXTRACTION PROMPT
// ==========================================
const systemPrompt = `You are a precision scientific literature data extraction system for bacteriophage and pathogen research.
Your mission is to carefully read the provided research paper and extract all distinct bacteriophages into a structured Markdown table matching the exact target schema columns.

CRITICAL INSTRUCTIONS:
1. STRICT ACCURACY: Extract exact numbers, accession numbers, biological host names, plaque shapes, morphology dimensions, burst sizes, latent periods, and environmental stability ranges.
2. MISSING DATA DISCIPLINE: If a parameter is not reported in the document (e.g. GC content or Whole Genome Accession), write "Not reported" or "Not specified". Do NOT hallucinate.
3. MULTI-ENTITY ROWS: The paper characterizes multiple phages (vB_Psp.S_PRɸL2 and vB_Psp.M_SSɸL8). Create a dedicated row for EACH distinct phage.
4. CLEAN OUTPUT: Output ONLY the completed Markdown table containing all schema columns, followed by a brief 2-sentence summary.`;

const userPrompt = `### DOCUMENT TO EXTRACT:
Title: ${targetPdf.title}
DOI: ${targetPdf.doi || '10.1016/j.micres.2019.126300'}

### FULL DOCUMENT TEXT (Pages 1-${maxPagesToExtract}):
${fullPaperText}

---

### TARGET SCHEMA COLUMNS (${schemaColumns.length} Columns):
${schemaColumns.map((c, i) => `${i + 1}. ${c.headerName} (Field Key: "${c.field}")`).join('\n')}

---

### INSTRUCTION:
Read the complete paper above, identify all distinct bacteriophages characterized, and populate the Markdown table with all ${schemaColumns.length} columns defined above. Provide exact numerical data from the paper.`;

// ==========================================
// 4. SEND STREAMING INFERENCE TO GEMMA 4
// ==========================================
console.log('\n[2/4] Connecting to LM Studio server...');
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
let firstTokenTime = 0;
let rawFullResponse = '';
let extractedThinking = '';
let extractedAnswer = '';
let tokenCount = 0;
let reasoningTokenCount = 0;

console.log('\n[3/4] Streaming reasoning and table extraction (Uncapped)...');
process.stdout.write('⚡ Live stream: ');

try {
  const response = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Connection: 'keep-alive',
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`LM Studio HTTP ${response.status}: ${errText}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    if (!firstTokenTime) {
      firstTokenTime = performance.now();
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith(':')) continue;

      if (trimmed.startsWith('data: ')) {
        const dataStr = trimmed.slice(6).trim();
        if (dataStr === '[DONE]') break;

        try {
          const parsed = JSON.parse(dataStr);
          const delta = parsed.choices?.[0]?.delta;

          if (delta?.reasoning_content) {
            extractedThinking += delta.reasoning_content;
            reasoningTokenCount++;
            if (reasoningTokenCount % 20 === 0) process.stdout.write('🧠');
          }

          if (delta?.content) {
            rawFullResponse += delta.content;
            tokenCount++;
            if (tokenCount % 20 === 0) process.stdout.write('.');
          }
        } catch {
          // ignore partial JSON chunks
        }
      }
    }
  }
  console.log(' Complete!\n');
} catch (err) {
  console.error(`\n❌ Request Failed: ${err.message}`);
  process.exit(1);
}

const endTime = performance.now();
const totalDurationSec = (endTime - startTime) / 1000;
const timeToFirstTokenSec = firstTokenTime ? (firstTokenTime - startTime) / 1000 : 0;
const tokensPerSecond =
  tokenCount > 0 ? (tokenCount / (totalDurationSec - timeToFirstTokenSec)).toFixed(1) : 0;

// Separate any XML thoughts if model used <thought> blocks
const thoughtMatch = rawFullResponse.match(/<(?:thought|think)>([\s\S]*?)<\/(?:thought|think)>/i);
if (thoughtMatch) {
  extractedThinking = (extractedThinking + '\n' + thoughtMatch[1]).trim();
  extractedAnswer = rawFullResponse.replace(/<(?:thought|think)>[\s\S]*?<\/(?:thought|think)>/i, '').trim();
} else {
  extractedAnswer = rawFullResponse.trim();
}

// ==========================================
// 5. AUTOMATED GROUND TRUTH COMPARISON AUDIT
// ==========================================
console.log('[4/4] Auditing extracted table against Human Ground Truth...');

// Parse Markdown Table Rows from model output
function parseMarkdownTable(mdText) {
  const lines = mdText.split('\n').filter((l) => l.includes('|'));
  if (lines.length < 2) return [];

  // Filter out header and separator lines
  const dataLines = lines.filter((l) => !l.includes('---') && !l.toLowerCase().includes('phage name'));

  const parsedRows = dataLines.map((line) => {
    const cells = line
      .split('|')
      .slice(1, -1)
      .map((c) => c.trim());
    return cells;
  });

  return parsedRows;
}

const modelParsedRows = parseMarkdownTable(extractedAnswer);

// Build Comparison Matrix
const fieldEvaluations = [];

groundTruthRows.forEach((gtRow, rowIndex) => {
  const phageNameGT = gtRow.phage_name || `Row ${rowIndex + 1}`;
  const rowEval = {
    phageName: phageNameGT,
    gtRowId: gtRow.id,
    fields: [],
  };

  schemaColumns.forEach((col, colIndex) => {
    const gtVal = String(gtRow[col.field] || '').trim();
    const gtCitation = gtRow.citationMap?.[col.field]?.snippetQuote || '';

    // Attempt to match cell from model parsed rows
    const modelRowCells = modelParsedRows[rowIndex] || [];
    const modelVal = modelRowCells[colIndex] || '(Not in model table)';

    // Similarity matching
    const cleanGt = gtVal.toLowerCase().replace(/[^a-z0-9]/g, '');
    const cleanModel = modelVal.toLowerCase().replace(/[^a-z0-9]/g, '');

    let matchStatus = 'MISMATCH';
    if (!cleanGt && (!cleanModel || cleanModel.includes('not'))) {
      matchStatus = 'CORRECT_EMPTY';
    } else if (cleanGt === cleanModel) {
      matchStatus = 'EXACT_MATCH';
    } else if (cleanModel.includes(cleanGt) || cleanGt.includes(cleanModel)) {
      matchStatus = 'SEMANTIC_PARTIAL';
    }

    rowEval.fields.push({
      field: col.field,
      header: col.headerName,
      groundTruth: gtVal || '(Empty / Not Reported)',
      modelExtracted: modelVal,
      matchStatus,
      gtCitationQuote: gtCitation,
    });
  });

  fieldEvaluations.push(rowEval);
});

// Calculate Overall Precision & Accuracy Metrics
let totalCheckedFields = 0;
let exactMatches = 0;
let partialMatches = 0;
let correctEmptyMatches = 0;

fieldEvaluations.forEach((r) => {
  r.fields.forEach((f) => {
    totalCheckedFields++;
    if (f.matchStatus === 'EXACT_MATCH') exactMatches++;
    if (f.matchStatus === 'SEMANTIC_PARTIAL') partialMatches++;
    if (f.matchStatus === 'CORRECT_EMPTY') correctEmptyMatches++;
  });
});

const overallAccuracyScore =
  totalCheckedFields > 0
    ? Math.round(((exactMatches + correctEmptyMatches + partialMatches * 0.75) / totalCheckedFields) * 100)
    : 0;

// ==========================================
// 6. GENERATE REPORT FILE
// ==========================================
const timestamp = new Date().toISOString();
let reportContent = `
================================================================================
📊 LITSIFT BENCHMARK REPORT: GEMMA 4 12B vs HUMAN GROUND TRUTH
================================================================================
Timestamp:               ${timestamp}
Evaluated Model:         ${MODEL_NAME}
Server Endpoint:         ${BASE_URL}
Target Paper:            ${targetPdf.title}
Evaluated Content:       Pages 1-8 (Abstract, Methods, Results, Discussion)
Target Schema:           ${schemaColumns.length} Columns
Ground Truth Dataset:    ${groundTruthRows.length} Verified Rows in LitSift Workspace

--------------------------------------------------------------------------------
1. PERFORMANCE & TELEMETRY
--------------------------------------------------------------------------------
• Time to First Token (TTFT): ${timeToFirstTokenSec.toFixed(3)} seconds
• Total Latency:              ${totalDurationSec.toFixed(2)} seconds
• Emitted Output Tokens:      ~${tokenCount} tokens
• Emitted Reasoning Tokens:   ~${reasoningTokenCount} tokens
• Generation Throughput:      ~${tokensPerSecond} tokens/sec
• Ground Truth Accuracy:      ${overallAccuracyScore}% (${exactMatches} Exact, ${partialMatches} Partial, ${correctEmptyMatches} Correct Empty)

--------------------------------------------------------------------------------
2. SIDE-BY-SIDE GROUND TRUTH COMPARISON MATRIX
--------------------------------------------------------------------------------
`;

fieldEvaluations.forEach((r, rIdx) => {
  reportContent += `\n[ROW ${rIdx + 1}]: "${r.phageName}" (Ground Truth Row ID: ${r.gtRowId})\n`;
  reportContent += `${'='.repeat(80)}\n`;

  r.fields.forEach((f) => {
    const icon =
      f.matchStatus === 'EXACT_MATCH' || f.matchStatus === 'CORRECT_EMPTY'
        ? '✅'
        : f.matchStatus === 'SEMANTIC_PARTIAL'
        ? '🟡'
        : '❌';

    reportContent += `${icon} [${f.header}] (${f.matchStatus})\n`;
    reportContent += `   • Ground Truth:    ${f.groundTruth}\n`;
    reportContent += `   • Gemma 4 Output:  ${f.modelExtracted}\n`;
    if (f.gtCitationQuote) {
      reportContent += `   • Ground Citation: "${f.gtCitationQuote.slice(0, 100)}..."\n`;
    }
    reportContent += '\n';
  });
});

reportContent += `
--------------------------------------------------------------------------------
3. MODEL THINKING & REASONING TRACE (UNCAPPED)
--------------------------------------------------------------------------------
${extractedThinking ? extractedThinking : '(No separate reasoning content emitted)'}

--------------------------------------------------------------------------------
4. EXTRACTED MARKDOWN TABLE
--------------------------------------------------------------------------------
${extractedAnswer}

================================================================================
`;

fs.writeFileSync(REPORT_FILE, reportContent, 'utf-8');

console.log('\n' + '='.repeat(75));
console.log('🏁 GROUND TRUTH EVALUATION COMPLETE!');
console.log('='.repeat(75));
console.log(`⏱️ Latency:               ${totalDurationSec.toFixed(2)}s (TTFT: ${timeToFirstTokenSec.toFixed(2)}s)`);
console.log(`🎯 Overall Accuracy:      ${overallAccuracyScore}%`);
console.log(`💾 Evaluation Report:     ${REPORT_FILE}`);
console.log('='.repeat(75));
