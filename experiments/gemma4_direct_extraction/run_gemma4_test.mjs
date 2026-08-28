/**
 * Standalone Gemma 4 Direct Extraction Benchmark Script
 * Tests direct zero-shot extraction (Paper Text + Schema -> Markdown Table + Verbatim Quotes)
 * Target Model: google/gemma-4-12b-qat running in LM Studio (http://192.168.0.25:1234/v1)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ==========================================
// 1. CONFIGURATION
// ==========================================
const BASE_URL = process.env.LMSTUDIO_URL || 'http://192.168.0.25:1234/v1';
const MODEL_NAME = process.env.MODEL_NAME || 'google/gemma-4-12b-qat';
const TEMPERATURE = 0.1; // Low temperature for high precision extraction
const MAX_TOKENS = 4096;
const OUTPUT_FILE = path.join(__dirname, 'gemma4_extraction_report.txt');

// ==========================================
// 2. REALISTIC SCIENTIFIC PAPER TEXT
// ==========================================
const SAMPLE_PAPER = {
  title: 'Isolation and characterization of thermostable lytic bacteriophage Lys68 and endolysin against Pseudomonas aeruginosa and Salmonella enterica',
  doi: '10.1016/j.micres.2021.126800',
  text: `
# Title: Isolation and characterization of thermostable lytic bacteriophage Lys68 and endolysin against Pseudomonas aeruginosa and Salmonella enterica

## Abstract
Multidrug-resistant (MDR) strains of Pseudomonas aeruginosa and Salmonella enterica serovar Typhimurium present severe challenges in clinical and food safety settings. In this study, we isolated and characterized a novel lytic bacteriophage, designated as Phage Pa-P1, and a companion Salmonella phage Lys68 from municipal wastewater effluents. Phage Pa-P1 possesses an icosahedral head (diameter 68 ± 3 nm) and a long contractile tail (length 135 ± 5 nm), characteristic of the Myoviridae family. One-step growth curves revealed that Pa-P1 has a latent period of 22 minutes and an average burst size of 165 ± 12 virions per infected bacterial cell at 37°C. Whole-genome sequencing of Pa-P1 revealed a double-stranded DNA genome of 66,420 base pairs with a GC content of 55.4%, encoding 89 open reading frames (GenBank Accession: KJ475444). The cloned endolysin gene (Lys68, 489 bp) demonstrated high thermal stability, retaining >80% lytic activity after incubation at 65°C for 30 minutes in the presence of 0.5 mM EDTA. Lytic assays confirmed that Pa-P1 lyse 18 of 22 (81.8%) clinical MDR P. aeruginosa isolates, while phage Lys68 effectively cleared Salmonella enterica biofilm biomass by 74.5% within 4 hours.

## Materials and Methods
### Phage Isolation and Host Strains
Phages were enriched and isolated from municipal wastewater samples collected in October 2020. The indicator host strains used for plaque assays were Pseudomonas aeruginosa PAO1 and Salmonella enterica serovar Typhimurium ATCC 14028. Phages were purified by three consecutive single-plaque isolations using the double-layer agar method.

### Transmission Electron Microscopy (TEM)
Purified phage particles at a titer of 1.0 × 10^10 PFU/mL were deposited onto carbon-coated copper grids (400 mesh) and negatively stained with 2% (w/v) uranyl acetate (pH 4.5) for 45 s. Morphology was inspected using a JEOL JEM-1400 transmission electron microscope operated at an accelerating voltage of 80 kV.

### One-Step Growth Experiment
Mid-exponential phase P. aeruginosa PAO1 (OD600 = 0.5) was infected with phage Pa-P1 at a multiplicity of infection (MOI) of 0.01 and incubated at 37°C for 10 min for adsorption. Unadsorbed phages were removed by centrifugation at 10,000 × g for 2 min. Samples were collected every 5 min over a 60-min period and titrated to calculate the latent period and burst size.

### Genomic DNA Sequencing and Bioinformatic Analysis
Phage genomic DNA was extracted using the standard phenol-chloroform method with proteinase K treatment. Whole-genome sequencing was conducted on an Illumina NovaSeq 6000 platform with 150 bp paired-end reads. Assembly was performed de novo with SPAdes v3.14. Annotation of open reading frames was completed using RAST and BLASTp against the NCBI non-redundant database.

## Results
### Morphological and Biological Characteristics
Transmission electron microscopy revealed that Phage Pa-P1 exhibits an icosahedral head of 68 nm and a contractile tail of 135 nm, placing it taxonomically within the Myoviridae family. Phage Lys68 was classified as a Siphoviridae member with a flexible non-contractile tail of 180 nm. One-step growth analysis showed that Phage Pa-P1 had a latent period of 22 min with a burst size of 165 virions/cell. Phage Lys68 exhibited a latent period of 18 min and a burst size of 142 virions/cell.

### Genomic Architecture and Accession
The complete genome of Phage Pa-P1 comprises 66,420 bp of double-stranded DNA with a 55.4% GC content. Bioinformatic analysis identified 89 predicted ORFs, with no putative virulence factor or antimicrobial resistance genes detected. The complete sequence was deposited in GenBank under accession number KJ475444. The endolysin gene Lys68 spans 489 bp and encodes a 162-amino-acid polypeptide with a predicted molecular weight of 18.2 kDa (GenBank Accession: KJ475445).

### Lytic Spectrum and Biofilm Degradation
Phage Pa-P1 demonstrated broad lytic activity, successfully lysing 18 of 22 (81.8%) tested clinical MDR P. aeruginosa strains. Microtiter crystal violet assays demonstrated that recombinant Lys68 endolysin in combination with 0.5 mM EDTA degraded established Salmonella enterica biofilm biomass by 74.5 ± 4.2% within 4 hours at 37°C.
`.trim(),
};

// ==========================================
// 3. TARGET EXTRACTION SCHEMA
// ==========================================
const TARGET_COLUMNS = [
  'Phage / Entity Name',
  'Host Organism',
  'Burst Size (virions/cell) & Latent Period',
  'Genome Length (bp) & GenBank Accession',
  'TEM Morphology & Family',
  'Primary Lytic / Biofilm Finding',
  'Exact Verbatim Evidence Quote',
];

// ==========================================
// 4. PROMPT BUILDER (Direct Zero-Shot Approach)
// ==========================================
function buildPrompt(paper, columns) {
  const systemPrompt = `You are a precision scientific literature data extraction system.
Your mission is to read the provided research paper and extract all key data points for the specified schema columns into a clean, structured Markdown table.

CRITICAL EXTRACTION RULES:
1. STRICT ACCURACY: Extract exact numbers, accession numbers, biological host names, and metrics. Do not fabricate or estimate.
2. VERBATIM EVIDENCE: In the "Exact Verbatim Evidence Quote" column, provide the EXACT, word-for-word quote from the text supporting the extracted row.
3. TABULAR FORMAT: Output ONLY the completed Markdown table followed by a brief summary. Do not output markdown code fences or conversational fluff.
4. MULTIPLE ENTITIES: If the paper studies multiple phages/entities (e.g. Pa-P1 and Lys68), create a separate row for EACH entity.`;

  const userPrompt = `### DOCUMENT TO EXTRACT:
Title: ${paper.title}
DOI: ${paper.doi}

### FULL DOCUMENT TEXT:
${paper.text}

---

### TARGET SCHEMA COLUMNS:
${columns.map((c, i) => `${i + 1}. ${c}`).join('\n')}

---

### INSTRUCTION:
Extract all distinct phages / enzymes from the document and populate the Markdown table with all ${columns.length} columns defined above. Include the exact verbatim quote for each row.`;

  return { systemPrompt, userPrompt };
}

// ==========================================
// 5. MAIN BENCHMARK RUNNER
// ==========================================
async function runGemma4Experiment() {
  console.log('='.repeat(70));
  console.log('🧪 LITSIFT - GEMMA 4 DIRECT EXTRACTION BENCHMARK');
  console.log('='.repeat(70));
  console.log(`📡 LM Studio Endpoint: ${BASE_URL}`);
  console.log(`🤖 Target Model:      ${MODEL_NAME}`);
  console.log(`📄 Test Paper:        "${SAMPLE_PAPER.title.slice(0, 60)}..."`);
  console.log(`📋 Schema Columns:    ${TARGET_COLUMNS.length} columns`);
  console.log('='.repeat(70));

  // Step 1: Health & Discovery Check
  console.log('\n[1/3] Checking LM Studio connection...');
  try {
    const modelsRes = await fetch(`${BASE_URL}/models`, { method: 'GET' });
    if (modelsRes.ok) {
      const modelsData = await modelsRes.json();
      const availableModels = (modelsData.data || []).map((m) => m.id);
      console.log(`✅ LM Studio is reachable! Available models on server:`);
      availableModels.forEach((m) => console.log(`   • ${m}`));
    } else {
      console.warn(`⚠️ /v1/models returned HTTP ${modelsRes.status}. Continuing with target model ${MODEL_NAME}...`);
    }
  } catch (err) {
    console.warn(`⚠️ Could not query /v1/models (${err.message}). Attempting direct chat completion to ${BASE_URL}...`);
  }

  // Step 2: Build Prompts
  const { systemPrompt, userPrompt } = buildPrompt(SAMPLE_PAPER, TARGET_COLUMNS);

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

  console.log('\n[2/3] Sending extraction request to Gemma 4 (Streaming)...');
  const startTime = performance.now();
  let firstTokenTime = 0;
  let rawFullResponse = '';
  let extractedThinking = '';
  let extractedAnswer = '';
  let tokenCount = 0;

  try {
    const response = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`LM Studio returned HTTP ${response.status}: ${errBody}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    process.stdout.write('⚡ Streaming output: ');

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

            // Handle Reasoning/Thinking content if present in SSE
            if (delta?.reasoning_content) {
              extractedThinking += delta.reasoning_content;
              process.stdout.write('🧠');
            }

            // Handle standard content
            if (delta?.content) {
              rawFullResponse += delta.content;
              tokenCount++;
              if (tokenCount % 15 === 0) process.stdout.write('.');
            }
          } catch {
            // ignore partial JSON chunks
          }
        }
      }
    }
    console.log(' Done!\n');
  } catch (err) {
    console.error(`\n❌ Request Failed: ${err.message}`);
    console.error(`Please verify that LM Studio is running at ${BASE_URL} and the model "${MODEL_NAME}" is loaded.`);
    return;
  }

  const endTime = performance.now();
  const totalDurationSec = (endTime - startTime) / 1000;
  const timeToFirstTokenSec = firstTokenTime ? (firstTokenTime - startTime) / 1000 : 0;
  const tokensPerSecond = tokenCount > 0 ? (tokenCount / (totalDurationSec - timeToFirstTokenSec)).toFixed(1) : 0;

  // Step 3: Separate Thinking & Markdown Table
  // If model output thoughts in <thought>...</thought> or <think>...</think> blocks:
  const thoughtMatch = rawFullResponse.match(/<(?:thought|think)>([\s\S]*?)<\/(?:thought|think)>/i);
  if (thoughtMatch) {
    extractedThinking = (extractedThinking + '\n' + thoughtMatch[1]).trim();
    extractedAnswer = rawFullResponse.replace(/<(?:thought|think)>[\s\S]*?<\/(?:thought|think)>/i, '').trim();
  } else {
    extractedAnswer = rawFullResponse.trim();
  }

  // Step 4: Verbatim Citation Audit Check
  console.log('[3/3] Auditing extracted quotes against source document...');
  const quotesFound = [];
  const quoteRegex = /"([^"\n]{15,})"/g;
  let match;
  while ((match = quoteRegex.exec(extractedAnswer)) !== null) {
    quotesFound.push(match[1].trim());
  }

  const citationAudit = quotesFound.map((q) => {
    const isExact = SAMPLE_PAPER.text.includes(q);
    return {
      quote: q,
      isExactMatch: isExact,
    };
  });

  const exactMatches = citationAudit.filter((c) => c.isExactMatch).length;
  const auditScore = quotesFound.length > 0 ? Math.round((exactMatches / quotesFound.length) * 100) : 100;

  // Step 5: Format Report
  const timestamp = new Date().toISOString();
  const reportContent = `
================================================================================
📊 LITSIFT BENCHMARK REPORT: GEMMA 4 DIRECT EXTRACTION TEST
================================================================================
Timestamp:          ${timestamp}
Target Endpoint:    ${BASE_URL}
Target Model:       ${MODEL_NAME}
Paper Evaluated:    ${SAMPLE_PAPER.title}

--------------------------------------------------------------------------------
1. PERFORMANCE & TELEMETRY
--------------------------------------------------------------------------------
• Time to First Token (TTFT): ${timeToFirstTokenSec.toFixed(3)} seconds
• Total Execution Time:       ${totalDurationSec.toFixed(2)} seconds
• Generated Output Tokens:    ~${tokenCount} tokens
• Generation Speed:           ~${tokensPerSecond} tokens/sec
• Verbatim Quote Audit Score: ${auditScore}% (${exactMatches}/${quotesFound.length} exact matches in source)

--------------------------------------------------------------------------------
2. MODEL THINKING & REASONING TRACE
--------------------------------------------------------------------------------
${extractedThinking ? extractedThinking : '(No separate reasoning tokens emitted; direct response generated)'}

--------------------------------------------------------------------------------
3. EXTRACTED MARKDOWN TABLE OUTPUT
--------------------------------------------------------------------------------
${extractedAnswer}

--------------------------------------------------------------------------------
4. VERBATIM CITATION AUDIT DETAILS
--------------------------------------------------------------------------------
${
  citationAudit.length > 0
    ? citationAudit
        .map(
          (c, i) =>
            `[Quote ${i + 1}] ${c.isExactMatch ? '✅ EXACT MATCH' : '⚠️ PARAPHRASED / NOT EXACT'}\n"${c.quote}"\n`
        )
        .join('\n')
    : 'No explicit quoted strings detected in output table.'
}

--------------------------------------------------------------------------------
5. PROMPT TEMPLATE USED
--------------------------------------------------------------------------------
[SYSTEM PROMPT]:
${systemPrompt}

[USER PROMPT]:
${userPrompt}
================================================================================
`.trim();

  // Save report to txt file
  fs.writeFileSync(OUTPUT_FILE, reportContent, 'utf-8');

  // Print summary to console
  console.log('\n' + '='.repeat(70));
  console.log('🏁 EXPERIMENT COMPLETED SUCCESSFULLY!');
  console.log('='.repeat(70));
  console.log(`⏱️ Latency:      ${totalDurationSec.toFixed(2)}s (TTFT: ${timeToFirstTokenSec.toFixed(2)}s)`);
  console.log(`⚡ Speed:        ~${tokensPerSecond} tokens/sec`);
  console.log(`🎯 Quote Score:  ${auditScore}% exact fidelity`);
  console.log(`💾 Full Report:  ${OUTPUT_FILE}`);
  console.log('='.repeat(70));
  console.log('\n--- EXTRACTED TABLE PREVIEW ---');
  console.log(extractedAnswer.slice(0, 1000));
  console.log('...\n' + '='.repeat(70));
}

// Execute
runGemma4Experiment();
