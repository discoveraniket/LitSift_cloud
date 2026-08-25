import { PaperDocumentInfo } from '../types/paper';
import { SchemaColumn, GridRow } from '../types/grid';
import { usePdfStore } from '../store/usePdfStore';
import { useGridStore } from '../store/useGridStore';
import { useAgentStore } from '../store/useAgentStore';
import { resolvePaperByDoi } from './doiService';

export const SAMPLE_DOI = '10.1016/S0140-6736(20)30183-5';
export const SAMPLE_PMCID = 'PMC7095448';

export const SAMPLE_PMC_PAPER: PaperDocumentInfo = {
  id: 'doi-10_1016_s0140_6736_20_30183_5',
  name: 'Huang et al. (2020) - Clinical Features COVID-19.pdf',
  doi: SAMPLE_DOI,
  pmcid: SAMPLE_PMCID,
  title: 'Clinical features of patients infected with 2019 novel coronavirus in Wuhan, China',
  authors: [
    { name: 'Chaolin Huang', institution: 'Jin Yin-tan Hospital, Wuhan' },
    { name: 'Yeming Wang', institution: 'China-Japan Friendship Hospital, Beijing' },
    { name: 'Xingwang Li', institution: 'Beijing Ditan Hospital, Capital Medical University' },
    { name: 'Lili Ren', institution: 'Institute of Pathogen Biology, CAMS' },
    { name: 'Jianping Zhao', institution: 'Tongji Hospital, Wuhan' },
    { name: 'Bin Cao', institution: 'National Clinical Research Center for Respiratory Diseases' },
  ],
  journal: 'The Lancet',
  year: 2020,
  citationCount: 34200,
  oaStatus: 'gold',
  sourceType: 'doi_structured',
  abstractText:
    'A recent cluster of pneumonia cases in Wuhan, China, was caused by a novel betacoronavirus (2019-nCoV). We report the epidemiological, clinical, laboratory, and radiological characteristics and treatment and clinical outcomes of these patients. Prospective data were collected and analysed from all patients with laboratory-confirmed 2019-nCoV infection admitted to Jin Yin-tan Hospital in Wuhan.',
  sections: [
    {
      id: 'sec_intro',
      title: 'Introduction',
      content:
        'In December, 2019, a cluster of patients with pneumonia of unknown cause was linked to a seafood wholesale market in Wuhan, China. A novel coronavirus, tentatively named 2019-nCoV, was identified by next-generation sequencing from lower respiratory tract samples. The outbreak coincided with increased travel before the Chinese Spring Festival, raising urgent concerns about transmission dynamics and clinical spectrum.',
    },
    {
      id: 'sec_methods',
      title: 'Methods & Study Design',
      content:
        'Prospective cohort study. All patients with suspected 2019-nCoV were admitted to designated Jin Yin-tan Hospital in Wuhan. Real-time RT-PCR assays were performed on clinical respiratory specimens to confirm infection. Epidemiological, clinical, laboratory, and radiological characteristics and outcome data were obtained with standardized data collection forms from electronic medical records.',
    },
    {
      id: 'sec_results_patients',
      title: 'Patients & Clinical Characteristics',
      content:
        'By Jan 2, 2020, 41 admitted hospital patients were identified as having laboratory-confirmed 2019-nCoV infection. Most infected patients were men (30 [73%] of 41; median age 49.0 years [IQR 41.0–58.0]). Less than half had underlying diseases (13 [32%]), including diabetes (eight [20%]), hypertension (six [15%]), and cardiovascular disease (six [15%]). 27 (66%) of 41 patients had direct exposure to Huanan seafood market.',
    },
    {
      id: 'sec_results_findings',
      title: 'Key Clinical Findings & Complications',
      content:
        'Common symptoms at onset of illness were fever (40 [98%] of 41 patients), cough (31 [76%]), and myalgia or fatigue (18 [44%]); less common symptoms were sputum production (11 [28%]), headache (three [8%]), haemoptysis (two [5%]), and diarrhoea (one [3%]). Dyspnoea developed in 22 (55%) of 40 patients (median time from illness onset to dyspnoea 8.0 days [IQR 5.0–13.0]). Complications included acute respiratory distress syndrome (ARDS: 12 [29%]), RNAaemia (six [15%]), acute cardiac injury (five [12%]) and secondary infection (four [10%]). 13 (32%) patients were admitted to an ICU and six (15%) patients died.',
    },
    {
      id: 'sec_discussion',
      title: 'Discussion & Limitations',
      content:
        'This prospective study documents the initial epidemiological and clinical features of 2019-nCoV pneumonia. Limitations include the relatively small cohort size (41 admitted patients) during the earliest phase of the outbreak, meaning that clinical presentations captured were skewed toward hospitalized, symptomatic cases rather than mild community infections.',
    },
  ],
  tables: [
    {
      id: 'tbl_1',
      label: 'Table 1',
      caption: 'Baseline characteristics of 41 hospitalized patients infected with 2019-nCoV',
      headers: ['Characteristic', 'Total (N=41)', 'ICU Care (N=13)', 'Non-ICU Care (N=28)', 'p-value'],
      rows: [
        ['Age (years), median (IQR)', '49.0 (41.0–58.0)', '49.0 (41.0–61.0)', '49.0 (41.0–57.5)', '0.60'],
        ['Men, n (%)', '30 (73%)', '10 (77%)', '20 (71%)', '0.71'],
        ['Exposure to Huanan market, n (%)', '27 (66%)', '9 (69%)', '18 (64%)', '0.75'],
        ['Any underlying disease, n (%)', '13 (32%)', '5 (38%)', '8 (29%)', '0.53'],
        ['Fever at onset, n (%)', '40 (98%)', '13 (100%)', '27 (96%)', '0.50'],
        ['Cough, n (%)', '31 (76%)', '11 (85%)', '20 (71%)', '0.36'],
        ['ARDS Complication, n (%)', '12 (29%)', '12 (92%)', '0 (0%)', '<0.0001'],
      ],
    },
  ],
  status: 'Ready',
  uploadedAt: Date.now(),
};

export const DEFAULT_REVIEW_SCHEMA: SchemaColumn[] = [
  { field: 'study_design', headerName: 'Study Design / Methodology' },
  { field: 'sample_cohort', headerName: 'Sample Size & Cohort' },
  { field: 'key_findings', headerName: 'Key Findings & Complications' },
  { field: 'limitations', headerName: 'Limitations & Biases' },
];

export const SAMPLE_EXTRACTED_ROW: GridRow = {
  id: 'row-demo-huang-2020',
  pdfId: SAMPLE_PMC_PAPER.id,
  pdfTitle: SAMPLE_PMC_PAPER.name,
  study_design: 'Prospective single-centre cohort study of admitted hospital patients with RT-PCR confirmed 2019-nCoV infection.',
  sample_cohort: '41 admitted hospital patients (30 [73%] men, median age 49.0 yrs [IQR 41.0–58.0]; 66% Huanan market exposure).',
  key_findings: 'Fever (98%), cough (76%), dyspnoea (55%). Major complications: ARDS in 29% (12/41), RNAaemia in 15%, mortality was 15% (6/41).',
  limitations: 'Small initial single-centre cohort (41 patients) representing early severe hospital admissions.',
  aiStatus: 'Pending Review',
  pendingReviewFields: ['study_design', 'sample_cohort', 'key_findings', 'limitations'],
  citationMap: {
    study_design: {
      pageNumber: 2,
      sectionName: 'Methods & Study Design',
      paragraphNumber: 'Paragraph 1',
      snippetQuote: 'Prospective cohort study. All patients with suspected 2019-nCoV were admitted to designated Jin Yin-tan Hospital in Wuhan. Real-time RT-PCR assays were performed on clinical respiratory specimens to confirm infection.',
      reasoning: 'Extracted directly from the Methods section detailing the single-center prospective design and RT-PCR confirmation.',
      confidence: 0.98,
    },
    sample_cohort: {
      pageNumber: 3,
      sectionName: 'Patients & Clinical Characteristics',
      paragraphNumber: 'Paragraph 1',
      snippetQuote: 'By Jan 2, 2020, 41 admitted hospital patients were identified as having laboratory-confirmed 2019-nCoV infection. Most infected patients were men (30 [73%] of 41; median age 49.0 years [IQR 41.0–58.0]).',
      reasoning: 'Explicitly defines the 41 admitted patient cohort, sex distribution, and median age.',
      confidence: 0.99,
    },
    key_findings: {
      pageNumber: 4,
      sectionName: 'Key Clinical Findings & Complications',
      paragraphNumber: 'Paragraph 1',
      snippetQuote: 'Common symptoms at onset of illness were fever (40 [98%] of 41 patients), cough (31 [76%]), and myalgia or fatigue (18 [44%])... Complications included acute respiratory distress syndrome (ARDS: 12 [29%]), RNAaemia (six [15%]), acute cardiac injury (five [12%])... Six (15%) patients died.',
      reasoning: 'Synthesizes primary symptom frequencies, ARDS complication rates, and overall in-hospital mortality.',
      confidence: 0.97,
    },
    limitations: {
      pageNumber: 5,
      sectionName: 'Discussion & Limitations',
      paragraphNumber: 'Paragraph 1',
      snippetQuote: 'Limitations include the relatively small cohort size (41 admitted patients) during the earliest phase of the outbreak, meaning that clinical presentations captured were skewed toward hospitalized, symptomatic cases.',
      reasoning: 'Authors explicitly note single-center small sample bias and hospital-admission severity skew.',
      confidence: 0.95,
    },
  },
};

/**
 * Executes Step 1 of the guided demo:
 * Resolves the paper via live PMC API if reachable, with fallback to pre-packaged structured content.
 */
export async function loadSamplePaperToWorkspace(
  onProgress?: (step: string, percent: number) => void
): Promise<PaperDocumentInfo> {
  onProgress?.('Resolving paper via Europe PMC & OpenAlex APIs...', 25);
  
  let paperDoc: PaperDocumentInfo = SAMPLE_PMC_PAPER;
  try {
    const liveDoc = await resolvePaperByDoi(SAMPLE_DOI, (p) => {
      onProgress?.(p.message, p.progressPercent);
    });
    if (liveDoc && (liveDoc.sections?.length || liveDoc.abstractText)) {
      paperDoc = {
        ...liveDoc,
        id: SAMPLE_PMC_PAPER.id,
        name: liveDoc.name || SAMPLE_PMC_PAPER.name,
      };
    }
  } catch (err) {
    console.info('Using structured bundled sample paper:', err);
    onProgress?.('Loaded structured landmark study from cache', 100);
  }

  // Add to store
  await usePdfStore.getState().addPdf(paperDoc);
  usePdfStore.getState().setActivePdf(paperDoc.id);
  return paperDoc;
}

/**
 * Executes Step 2 of the guided demo:
 * Applies the 4-column review schema.
 */
export function applySampleSchemaToGrid(): SchemaColumn[] {
  const gridStore = useGridStore.getState();
  DEFAULT_REVIEW_SCHEMA.forEach((col) => {
    if (!gridStore.columns.some((c) => c.field === col.field)) {
      gridStore.addColumn(col.headerName);
    }
  });
  return DEFAULT_REVIEW_SCHEMA;
}

/**
 * Executes Step 3 of the guided demo:
 * Replays the AI extraction with "Pending Review" status and posts a greeting to Copilot.
 */
export async function replayDemoExtraction(): Promise<void> {
  const gridStore = useGridStore.getState();
  const agentStore = useAgentStore.getState();

  // Ensure columns exist
  applySampleSchemaToGrid();

  // Append sample row if not already present
  if (!gridStore.rows.some((r) => r.id === SAMPLE_EXTRACTED_ROW.id)) {
    gridStore.appendRows([SAMPLE_EXTRACTED_ROW]);
  }

  // Focus the first extracted cell
  gridStore.setFocusedCell({ rowId: SAMPLE_EXTRACTED_ROW.id, field: 'key_findings' });
  gridStore.setSelectedCells([{ rowId: SAMPLE_EXTRACTED_ROW.id, field: 'key_findings' }]);

  const cit = SAMPLE_EXTRACTED_ROW.citationMap?.key_findings;
  if (cit) {
    gridStore.setActiveCitation(cit);
    gridStore.setActiveEvidence({
      pageNumber: cit.pageNumber || 1,
      snippetText: cit.snippetQuote,
      sectionName: cit.sectionName,
      paragraphNumber: cit.paragraphNumber,
    });
  }

  // Send interactive onboarding message in Copilot
  agentStore.addAgentResponse(
    `### 🤝 LitSift Collaborative Co-Lab Initialized!\n\n` +
    `I have extracted the initial findings from **Huang et al. (The Lancet 2020)** according to your 4 review columns.\n\n` +
    `> **Human-in-the-Loop Audit:**\n` +
    `> Notice the **yellow highlight** on the cells in the table below. Click any cell (e.g. \`Key Findings\` or \`Sample Size\`) to jump directly to the verified source quote in the document reader!\n\n` +
    `You can click **[✓ Confirm]** on a row to accept the AI draft, edit any text in the cells, or ask me to extract another column.`
  );
}
