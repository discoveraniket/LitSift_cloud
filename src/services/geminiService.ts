import { GoogleGenAI, FunctionCallingConfigMode } from '@google/genai';
import { usePdfStore } from '../store/usePdfStore';
import { useGridStore } from '../store/useGridStore';
import { getPdfBase64, buildPaperMarkdownContext, resolveEffectiveGroundingMode } from './pdfUtils';
import { getToolsForMode, agentToolsRegistry, AgentExecutionMode } from './agentToolRegistry';
import { useAgentStore } from '../store/useAgentStore';
import { useLogStore } from '../store/useLogStore';
import { AgentExecutionResult, AgentToolExecution } from '../types/agent';

// Retrieve API key from environment variable or localStorage
export function getGeminiApiKey(): string {
  if (typeof process !== 'undefined' && process.env?.GEMINI_API_KEY) {
    return process.env.GEMINI_API_KEY;
  }
  if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_GEMINI_API_KEY) {
    return import.meta.env.VITE_GEMINI_API_KEY;
  }
  return localStorage.getItem('LITSIFT_GEMINI_API_KEY') || '';
}

// Model Selection Helpers
export function getSelectedGeminiModel(): string {
  return localStorage.getItem('LITSIFT_SELECTED_MODEL') || 'gemini-3.6-flash';
}

export function setSelectedGeminiModel(modelId: string): void {
  localStorage.setItem('LITSIFT_SELECTED_MODEL', modelId);
}

export interface AgentPrerequisiteValidation {
  valid: boolean;
  error?: string;
  activePdf?: any;
  pdfBase64?: string;
}

/**
 * Pre-flight validation verifying all required prerequisites (API key, prompt, PDF binary, schema)
 * before invoking Google GenAI API.
 */
export async function validateAgentPrerequisites(
  userPrompt: string,
  activePdfTitle: string = 'Active Paper'
): Promise<AgentPrerequisiteValidation> {
  const logStore = useLogStore.getState();

  // 1. Validate Prompt Non-Empty
  if (!userPrompt || !userPrompt.trim()) {
    return {
      valid: false,
      error: 'Please enter a prompt or instruction for LitSift Agent.',
    };
  }

  // 2. Validate Gemini API Key
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    return {
      valid: false,
      error:
        '⚠️ **GEMINI_API_KEY is not configured.**\n\nPlease set your Gemini API key in **Settings (⚙️)** or through the environment variable (`VITE_GEMINI_API_KEY`) to enable autonomous agent execution.',
    };
  }

  const pdfStore = usePdfStore.getState();
  const gridStore = useGridStore.getState();

  const activePdf =
    pdfStore.getActivePdf() ||
    pdfStore.pdfs.find((p) => p.name === activePdfTitle || p.id === activePdfTitle);

  const lowerPrompt = userPrompt.toLowerCase();
  const isDocumentQuery =
    lowerPrompt.includes('extract') ||
    lowerPrompt.includes('paper') ||
    lowerPrompt.includes('pdf') ||
    lowerPrompt.includes('document') ||
    lowerPrompt.includes('citation') ||
    lowerPrompt.includes('verify') ||
    lowerPrompt.includes('quote') ||
    lowerPrompt.includes('burst size') ||
    lowerPrompt.includes('latent period') ||
    lowerPrompt.includes('genome');

  // 3. Document Availability Guard
  if (isDocumentQuery && !activePdf && pdfStore.pdfs.length === 0) {
    logStore.addLog('warn', 'Agent interaction halted: No research paper PDF in workspace.');
    return {
      valid: false,
      error:
        '📄 **No Research Paper PDF Loaded in Workspace**\n\nPlease upload or select a research paper PDF from the **Left Explorer** before requesting data extraction or document synthesis.',
    };
  }

  // 4. Document Content Availability Guard (PDF Binary OR Structured Text / Abstract OR Detached)
  let pdfBase64: string | undefined;
  const effectiveMode = activePdf ? resolveEffectiveGroundingMode(activePdf) : 'none';

  if (activePdf && effectiveMode === 'pdf') {
    try {
      logStore.setActiveStep(`Verifying attached document "${activePdf.name}"...`);
      pdfBase64 = await getPdfBase64(activePdf);
    } catch (err: any) {
      logStore.addLog('warn', `PDF binary read note for "${activePdf.name}": ${err.message}`);
      const hasTextContent = Boolean(
        (activePdf.abstractText && activePdf.abstractText.trim().length > 0) ||
        (activePdf.sections && activePdf.sections.length > 0)
      );
      if (!hasTextContent && isDocumentQuery) {
        return {
          valid: false,
          error: `⚠️ **Unable to read PDF file "${activePdf.name}".**\n\nThe binary file data could not be retrieved from local IndexedDB storage. Please re-upload the PDF in the Left Explorer.`,
        };
      }
    }
  } else if (activePdf && effectiveMode === 'none' && !activePdf.groundingMode && isDocumentQuery) {
    return {
      valid: false,
      error: `📄 **No Document Content Available for "${activePdf.name}"**\n\nPlease select or upload a research paper with text or PDF content.`,
    };
  }

  // 5. Schema Guard
  if (lowerPrompt.includes('extract') && gridStore.columns.length === 0) {
    logStore.addLog('warn', 'Extraction requested with 0 schema columns defined.');
    return {
      valid: false,
      error:
        '📊 **No Schema Columns Defined in Data Grid**\n\nThe extraction grid does not have any target columns defined. Please add columns in the table or import a CSV schema template before extracting findings.',
    };
  }

  return {
    valid: true,
    activePdf,
    pdfBase64,
  };
}

export interface AgentStreamUpdate {
  thoughtChunk?: string;
  fullThoughtText?: string;
  textChunk?: string;
  fullText?: string;
}

export type AgentStreamCallback = (data: AgentStreamUpdate) => void;

export async function processAgentInteraction(
  userPrompt: string,
  activePdfTitle: string = 'Active Paper',
  abortSignal?: AbortSignal,
  onStream?: AgentStreamCallback
): Promise<AgentExecutionResult> {
  const logStore = useLogStore.getState();

  // Run Pre-Flight Prerequisite Validation
  const validation = await validateAgentPrerequisites(userPrompt, activePdfTitle);
  if (!validation.valid) {
    return {
      replyText: validation.error || 'Agent execution could not proceed due to missing prerequisites.',
      toolsExecuted: [],
    };
  }

  const apiKey = getGeminiApiKey()!;
  const selectedModel = getSelectedGeminiModel();
  const agentMode: AgentExecutionMode = useAgentStore.getState().mode || 'human_in_loop';

  try {
    const agentStore = useAgentStore.getState();

    // Determine past conversation turns (excluding welcome banners and transient error notices)
    const pastNonWelcomeMessages = agentStore.messages.filter(
      (m) =>
        m.id !== 'msg-1' &&
        !m.text.startsWith('**Now viewing') &&
        !m.text.startsWith('LitSift Agent is online') &&
        !m.text.startsWith('⚠️')
    );
    const isFollowup = pastNonWelcomeMessages.length > 1;

    // Calculate baseline token count from previous turns to subtract it from this turn's prompt/cached tokens
    let historyBaselineTokens = 0;
    if (isFollowup) {
      const lastAgentMsg = [...pastNonWelcomeMessages]
        .reverse()
        .find((m) => m.sender === 'agent' && m.promptTokens !== undefined);
      if (lastAgentMsg) {
        historyBaselineTokens = (lastAgentMsg.promptTokens ?? 0) + (lastAgentMsg.candidateTokens ?? 0);
      }
    }

    // Multi-Level Context Injection: Multi-Cell -> Single Cell -> Row -> Column -> Entire Table
    const gridStore = useGridStore.getState();
    const focusedCell = gridStore.focusedCell;
    const selectedCells = (gridStore.selectedCells || []).filter(
      (c) => c.field !== '0' && c.field !== 'rowNum' && gridStore.columns.some((col) => col.field === c.field)
    );
    const selectedRowIds = gridStore.selectedRowIds;
    const selectedColumnField = gridStore.selectedColumnField;
    const isTableSelected = gridStore.isTableSelected;
    let finalPromptText = userPrompt;

    if (selectedCells.length > 1) {
      logStore.addLog('info', `Injecting multi-cell comparative context for ${selectedCells.length} cells`);
      const cellsFormatted = selectedCells
        .map((c, i) => {
          const row = gridStore.rows.find((r) => r.id === c.rowId);
          const col = gridStore.columns.find((cl) => cl.field === c.field);
          const cellValue = row ? row[c.field] || 'Empty' : 'Unknown';
          const citation = row?.citationMap?.[c.field];
          const quote = citation?.snippetQuote || 'N/A';
          const loc = `Page ${citation?.pageNumber || 'N/A'}, Section: ${citation?.sectionName || 'N/A'}`;
          const reason = citation?.reasoning || 'N/A';

          return `Target Cell ${i + 1}:
  - Target Column: "${col?.headerName || c.field}" (Field Key: "${c.field}")
  - Observation Row: "${row?.pdfTitle || activePdfTitle}" (Row ID: ${c.rowId})
  - Current Extracted Value: "${cellValue}"
  - Evidence Quote: "${quote}" (${loc})
  - Existing AI Reasoning: "${reason}"`;
        })
        .join('\n\n');

      finalPromptText = `[ACTIVE MULTI-CELL COMPARISON CONTEXT - ${selectedCells.length} TARGET CELLS SELECTED]
${cellsFormatted}

[RELATIONSHIP & COMPARISON OBJECTIVE]:
The user has explicitly selected these ${selectedCells.length} distinct cells to evaluate their interrelationship, correlation, discrepancy, cross-validation, or coupled dependencies. Analyze their relationship thoroughly based on the source papers and extracted data.

[USER INSTRUCTION]:
${userPrompt}

(Note: If this requires updating, synchronizing, or verifying these cells, invoke the appropriate tools.)`;
    } else if (selectedCells.length === 1 || (focusedCell && focusedCell.field !== '0' && focusedCell.field !== 'rowNum' && gridStore.columns.some((c) => c.field === focusedCell.field))) {
      const activeC = selectedCells.length === 1 ? selectedCells[0] : focusedCell!;
      const row = gridStore.rows.find((r) => r.id === activeC.rowId);
      const col = gridStore.columns.find((c) => c.field === activeC.field);
      const cellValue = row ? row[activeC.field] || 'Empty' : 'Unknown';
      const citation = row?.citationMap?.[activeC.field] || gridStore.activeCitation;

      logStore.addLog('info', `Injecting active cell context for column "${col?.headerName || activeC.field}"`, {
        rowId: activeC.rowId,
        field: activeC.field,
        cellValue,
        citation,
      });

      finalPromptText = `[ACTIVE CELL CONTEXT]
- Selected Row: "${row?.pdfTitle || activePdfTitle}" (Row ID: ${activeC.rowId})
- Target Column: "${col?.headerName || activeC.field}" (Field: ${activeC.field})
- Current Extracted Value: "${cellValue}"
- Grounded Evidence Quote: "${citation?.snippetQuote || 'N/A'}"
- Source Location: Page ${citation?.pageNumber || 'N/A'}, Section: ${citation?.sectionName || 'N/A'}
- Existing AI Reasoning: "${citation?.reasoning || 'N/A'}"

[USER INSTRUCTION]:
${userPrompt}

(Note: If this requires updating, modifying, or populating the table, invoke the appropriate tools.)`;
    } else if (selectedRowIds.length > 0) {
      const selectedRow = gridStore.rows.find((r) => r.id === selectedRowIds[0]);
      if (selectedRow) {
        logStore.addLog('info', `Injecting active row context for "${selectedRow.pdfTitle || activePdfTitle}" [${selectedRow.id}]`);
        const rowFields = gridStore.columns
          .map((c) => {
            const rawVal = selectedRow[c.field];
            const val = rawVal !== undefined && rawVal !== '' ? `"${rawVal}"` : '(Empty / Not extracted yet)';
            const cit = selectedRow.citationMap?.[c.field];
            const citInfo =
              cit?.snippetQuote && cit.snippetQuote !== 'Not reported in document'
                ? ` (Evidence: "${cit.snippetQuote}" [${cit.sectionName || 'Section N/A'}, P.${cit.pageNumber || '1'}])`
                : '';
            return `  • ${c.headerName} (${c.field}): ${val}${citInfo}`;
          })
          .join('\n');

        finalPromptText = `[ACTIVE ROW CONTEXT]
- Selected Observation Row: "${selectedRow.pdfTitle || activePdfTitle}" (Row ID: ${selectedRow.id})
- Extracted Column Values & Grounded Evidence:
${rowFields}

[USER INSTRUCTION]:
${userPrompt}

(Note: If this requires updating, modifying, splitting, or verifying this specific row, invoke the appropriate tools.)`;
      }
    } else if (selectedColumnField) {
      const targetCol = gridStore.columns.find((c) => c.field === selectedColumnField);
      if (targetCol) {
        logStore.addLog('info', `Injecting active column context for "${targetCol.headerName}" (${targetCol.field})`);
        const populatedRows = gridStore.rows.filter((r) => !r.isDraftRow);
        const colValues = populatedRows
          .map(
            (r, i) =>
              `  • Row ${i + 1} ("${r.pdfTitle || activePdfTitle}"): ${r[targetCol.field] !== undefined && r[targetCol.field] !== '' ? `"${r[targetCol.field]}"` : '(Empty / Not extracted yet)'}`
          )
          .join('\n');

        finalPromptText = `[ACTIVE COLUMN CONTEXT]
- Selected Target Column: "${targetCol.headerName}" (Field Key: "${targetCol.field}")
- Values across observations in dataset (${populatedRows.length} rows):
${colValues || '  (No data rows)'}

[USER INSTRUCTION]:
${userPrompt}

(Note: If this requires standardizing, editing, or evaluating this column across rows, invoke the appropriate tools.)`;
      }
    } else if (isTableSelected || gridStore.rows.length > 0) {
      // Inject concise table state summary in table/global mode
      const populatedRows = gridStore.rows.filter((r) => !r.isDraftRow);
      const colsSummary = gridStore.columns.map((c) => `${c.headerName} (${c.field})`).join(', ');
      const rowsSummary = populatedRows
        .slice(0, 10)
        .map((r, i) => {
          const rowFields = gridStore.columns
            .slice(0, 6)
            .map(
              (c) =>
                `${c.headerName}: ${r[c.field] !== undefined && r[c.field] !== '' ? `"${r[c.field]}"` : '(Empty / Not extracted)'}`
            )
            .join(', ');
          return `  • Row ${i + 1} (ID: ${r.id}, Paper: "${r.pdfTitle || activePdfTitle}"): ${rowFields}`;
        })
        .join('\n');

      finalPromptText = `[CURRENT DATA GRID STATE${isTableSelected ? ' - ENTIRE TABLE SELECTED' : ''}]
- Active Columns (${gridStore.columns.length}): ${colsSummary || 'None'}
- Existing Table Rows in Workspace (${populatedRows.length}):
${rowsSummary || '  (No populated rows)'}

[IMPORTANT MULTI-PAPER DATASET RULES]:
- LitSift is a cumulative multi-paper database aggregating scientific findings across multiple uploaded research papers.
- Existing rows from other papers (distinguishable by their Article DOI or paper titles) represent valuable accumulated research data and must NEVER be deleted, altered, or overwritten when extracting or editing data for a new paper.
- When extracting findings from the current paper ("${activePdfTitle}"), ALWAYS append new rows into the table schema.

[USER INSTRUCTION]:
${userPrompt}`;
    }

    // Build multi-turn contents array with root document anchor (PDF binary or Structured Markdown or Abstract Only)
    const contents: any[] = [];
    const rootUserParts: any[] = [];
    const effectiveGrounding = validation.activePdf ? resolveEffectiveGroundingMode(validation.activePdf) : 'none';

    if (effectiveGrounding === 'pdf' && validation.pdfBase64) {
      const cleanBase64 = validation.pdfBase64.includes(',')
        ? validation.pdfBase64.split(',')[1]
        : validation.pdfBase64;
      rootUserParts.push({
        inlineData: {
          mimeType: 'application/pdf',
          data: cleanBase64.trim(),
        },
      });
    } else if (effectiveGrounding === 'structured_text' && validation.activePdf) {
      const docMarkdown = buildPaperMarkdownContext(validation.activePdf, { abstractOnly: false });
      if (docMarkdown.trim().length > 0) {
        rootUserParts.push({
          text: `[ACTIVE DOCUMENT CONTENT (Structured Text): "${activePdfTitle}"]\n${docMarkdown}`,
        });
      }
    } else if (effectiveGrounding === 'abstract_only' && validation.activePdf) {
      const docMarkdown = buildPaperMarkdownContext(validation.activePdf, { abstractOnly: true });
      if (docMarkdown.trim().length > 0) {
        rootUserParts.push({
          text: `[ACTIVE DOCUMENT ABSTRACT: "${activePdfTitle}"]\n${docMarkdown}`,
        });
      }
    }

    if (isFollowup) {
      // Turn 0: Root anchor with document context
      contents.push({
        role: 'user',
        parts: [
          ...rootUserParts,
          { text: `You are analyzing research document "${activePdfTitle}". I will ask you questions and instructions to extract, verify, and edit data in our structured table grid.` },
        ],
      });
      contents.push({
        role: 'model',
        parts: [{ text: `Understood. I have full access to "${activePdfTitle}" and will synthesize findings, extract exact verbatim citations, and assist you with managing the structured data grid.` }],
      });

      // Historical turns: Clean user prompts and assistant replies without redundant table duplicates
      const historyTurns = pastNonWelcomeMessages.slice(0, -1);
      for (const msg of historyTurns) {
        contents.push({
          role: msg.sender === 'user' ? 'user' : 'model',
          parts: [{ text: msg.text }],
        });
      }

      // Latest active turn: Injects live data grid state and focused cell context
      contents.push({
        role: 'user',
        parts: [{ text: finalPromptText }],
      });
    } else {
      // First turn: Anchors PDF with live data grid state and user prompt
      contents.push({
        role: 'user',
        parts: [
          ...rootUserParts,
          { text: finalPromptText },
        ],
      });
    }

    const ai = new GoogleGenAI({ apiKey });

    const systemInstruction = `You are LitSift Agent, an autonomous scientific literature synthesis assistant.
You are interacting with research document "${activePdfTitle}" and managing a structured scientific data grid.
Understand the user's high-level objective and autonomously break it down into an ordered sequence of prerequisite and dependent tool actions.

AUTONOMOUS DOCUMENT EXTRACTION & VERIFICATION FLOW:
- When the user asks to extract findings from the active paper, call extractPDFData.
- extractPDFData autonomously parses the paper, extracts all schema columns with verbatim citations, and inserts the new rows into the table grid.
- TASK COMPLETION RULE: Once extractPDFData completes and stages the rows, the extraction objective is FINISHED. Present your final synthesis summary to the user immediately.
- Do NOT use batchUpdateCells to re-insert or overwrite data from extractPDFData.

INTERACTIVE ROW-LEVEL INTEGRITY & COUPLED ATTRIBUTES:
- In structured scientific and analytical data tables, columns within a single row often represent interdependent, coupled attributes of a single observation or entity.
- When the user asks to update or modify a specific cell value that logically impacts other dependent columns in that same row:
  1. Identify the interrelated attributes within that row.
  2. Explicitly explain the relationship to the user.
  3. Ask the user whether they would like to update the full row with the corresponding consistent values or modify only the target cell.

ERROR HANDLING & RECOVERY RULES:
- If extractPDFData or any other tool returns an error, state the error clearly to the user and explain what failed.
- NEVER attempt to recover from a failed extractPDFData by using batchUpdateCells or updateRow to overwrite existing rows from other papers with search excerpts or partial text.
- If you need to manually create an observation row, ALWAYS use appendRows to create brand new rows with new IDs.

CUMULATIVE MULTI-DOCUMENT DATASET INTEGRITY:
- The data grid accumulates scientific extractions across multiple papers.
- NEVER delete or overwrite existing table rows belonging to other research papers (which have different article DOIs or paper titles).
- When extracting findings from the active paper, append the new findings to the dataset while leaving rows from other papers completely intact.
- If the user specifically asks to edit, merge, or disaggregate existing rows from the active paper, perform updates directly on those specific rows.

DOCUMENT CONTEXT & STRIPPED ADMINISTRATIVE SECTIONS POLICY:
- Non-scientific administrative boilerplate sections (specifically: References / Bibliography, Author Contributions, Funding Statements / Financial Disclosures, and Competing Interests / Conflict of Interest declarations) are intentionally stripped off before the paper text is sent to you.
- If the user asks questions regarding citations from the References list, specific grant/funding bodies, author CRediT contribution roles, or COI statements that are absent from the provided text, explicitly and politely inform the user that these administrative boilerplate sections were intentionally stripped off prior to ingestion to save context tokens, and that they can check the original PDF or publisher portal for those specific details.

EMPTY VS. NOT REPORTED PARAMETERS & PROACTIVE EXTRACTION:
- An empty cell "" or (Empty / Not extracted yet) indicates that the parameter has not been extracted from the research paper yet (e.g. a newly added column or a partially populated dataset).
- When answering questions, querying the grid, or evaluating observations with empty cells, if the source research paper is available in the workspace, proactively inspect the document to extract the missing parameter and populate the table using updateCell or updateRow.
- Use "Not reported" ONLY when you have checked the source paper and verified that the authors genuinely did not measure, test, or report that specific parameter in the text, figures, or tables. Always provide an evidence citation explaining that the parameter is unmentioned in the document.

You have access to a rich declarative tool suite:
- Document extraction & verification: extractPDFData, verifyEvidenceCitation, queryGridData
- Row creation & structuring: appendRows (supports single or batch row additions), disaggregateRow (to expand composite rows into atomic rows), mergeRows, deleteRows
- Cell & row editing: updateCell, batchUpdateCells, updateRow
- Schema management: addColumn (supports optional initialValues), renameColumn, deleteColumn
Execute all required tool actions to fulfill the user's instructions and summarize your reasoning and findings clearly.`;

    // Multi-Step ReAct Execution Loop (Expanded to 10 Turns)
    const MAX_STEPS = 10;
    let currentStep = 1;
    const executedTools: AgentToolExecution[] = [];
    let finalReplyText = '';
    const accumulatedThoughts: string[] = [];
    let totalThinkingTokens = 0;
    let totalPromptTokens = 0;
    let totalCandidateTokens = 0;
    let totalCachedTokens = 0;

    while (currentStep <= MAX_STEPS) {
      if (abortSignal?.aborted) {
        logStore.addLog('warn', 'Agent interaction stopped by user.');
        return {
          replyText: 'Agent execution was stopped by user.',
          thought: accumulatedThoughts.length > 0 ? accumulatedThoughts.join('\n\n---\n\n') : undefined,
          thinkingTokens: totalThinkingTokens > 0 ? totalThinkingTokens : undefined,
          promptTokens: totalPromptTokens > 0 ? totalPromptTokens : undefined,
          candidateTokens: totalCandidateTokens > 0 ? totalCandidateTokens : undefined,
          cachedTokens: totalCachedTokens > 0 ? totalCachedTokens : undefined,
          modelUsed: selectedModel,
          toolsExecuted: executedTools,
        };
      }

      // Dynamically evaluate tool schemas on every step to reflect latest columns
      const currentTools = getToolsForMode(agentMode);

      logStore.setActiveStep(`[Step ${currentStep}/${MAX_STEPS}] Reasoning with Gemini (${selectedModel})...`);
      const genStartTime = performance.now();

      const requestConfig = {
        systemInstruction,
        temperature: 0.2,
        thinkingConfig: {
          includeThoughts: true,
          thinkingBudget: -1,
        },
        tools: currentTools,
        toolConfig: {
          functionCallingConfig: {
            mode: FunctionCallingConfigMode.AUTO,
          },
        },
      };

      let stepThoughtText = '';
      let stepAnswerText = '';
      const collectedFunctionCalls: any[] = [];
      const allModelParts: any[] = [];
      let lastUsage: any = null;

      const executeStreamTurn = async () => {
        const stream = await ai.models.generateContentStream({
          model: selectedModel,
          contents,
          config: requestConfig,
        });

        for await (const chunk of stream) {
          if (abortSignal?.aborted) break;

          if (chunk.usageMetadata) {
            lastUsage = chunk.usageMetadata;
          }

          const candidate = chunk.candidates?.[0];
          const parts = candidate?.content?.parts || [];

          for (const part of parts) {
            allModelParts.push(part);

            if (part.thought && part.text) {
              stepThoughtText += part.text;
              const liveFullThought = accumulatedThoughts.concat(stepThoughtText).join('\n\n---\n\n');
              onStream?.({
                thoughtChunk: part.text,
                fullThoughtText: liveFullThought,
                fullText: finalReplyText ? `${finalReplyText}\n\n${stepAnswerText}` : stepAnswerText,
              });
            } else if (!part.thought && part.text) {
              stepAnswerText += part.text;
              const liveFullThought = accumulatedThoughts.length > 0
                ? (stepThoughtText ? accumulatedThoughts.concat(stepThoughtText).join('\n\n---\n\n') : accumulatedThoughts.join('\n\n---\n\n'))
                : stepThoughtText;
              onStream?.({
                textChunk: part.text,
                fullThoughtText: liveFullThought,
                fullText: finalReplyText ? `${finalReplyText}\n\n${stepAnswerText}` : stepAnswerText,
              });
            }

            if (part.functionCall) {
              collectedFunctionCalls.push(part.functionCall);
            }
          }

          if (chunk.functionCalls && chunk.functionCalls.length > 0) {
            for (const fc of chunk.functionCalls) {
              if (
                !collectedFunctionCalls.some(
                  (existing) =>
                    existing.name === fc.name &&
                    JSON.stringify(existing.args) === JSON.stringify(fc.args)
                )
              ) {
                collectedFunctionCalls.push(fc);
              }
            }
          }
        }
      };

      try {
        await executeStreamTurn();
      } catch (err: any) {
        const errMsg = String(err?.message || '');
        const isRateLimit = errMsg.includes('429') || errMsg.includes('RESOURCE_EXHAUSTED');
        const isTransient503 =
          errMsg.includes('503') ||
          errMsg.includes('Deadline') ||
          errMsg.includes('UNAVAILABLE') ||
          err?.status === 'UNAVAILABLE';

        if (isRateLimit) {
          logStore.addLog('warn', `Gemini API rate limit reached (429). Waiting 15s before retry...`);
          await new Promise((resolve) => setTimeout(resolve, 15000));
          await executeStreamTurn();
        } else if (isTransient503) {
          logStore.addLog('warn', `Transient 503/Deadline error from Gemini API (${errMsg}). Retrying in 2s...`);
          await new Promise((resolve) => setTimeout(resolve, 2000));
          await executeStreamTurn();
        } else {
          throw err;
        }
      }

      if (stepThoughtText) {
        accumulatedThoughts.push(stepThoughtText);
      }
      if (stepAnswerText) {
        finalReplyText = finalReplyText ? `${finalReplyText}\n\n${stepAnswerText}` : stepAnswerText;
      }

      const genDurationSec = ((performance.now() - genStartTime) / 1000).toFixed(2);
      const usage = lastUsage;
      const promptTokens = Math.max(0, (usage?.promptTokenCount ?? 0) - historyBaselineTokens);
      const candidateTokens = usage?.candidatesTokenCount ?? 0;
      const stepThinkingTokens = usage?.thinkingTokenCount ?? usage?.reasoningTokenCount ?? 0;
      const cachedTokens = Math.max(0, (usage?.cachedContentTokenCount ?? 0) - historyBaselineTokens);

      totalThinkingTokens += stepThinkingTokens;
      totalPromptTokens += promptTokens;
      totalCandidateTokens += candidateTokens;
      totalCachedTokens += cachedTokens ?? 0;

      let telemetryMsg = `⏱️ [Step ${currentStep}] Gemini ${selectedModel} responded in ${genDurationSec}s | Tokens: Prompt=${promptTokens.toLocaleString()}, Output=${candidateTokens.toLocaleString()}`;
      if (stepThinkingTokens) {
        telemetryMsg += `, Thinking=${stepThinkingTokens.toLocaleString()}`;
      }
      if (cachedTokens) {
        telemetryMsg += `, Cached=${cachedTokens.toLocaleString()}`;
      }

      logStore.addLog('info', telemetryMsg, {
        step: currentStep,
        latencySec: Number(genDurationSec),
        usageMetadata: usage,
      });

      // If no tools were called, the agent has finished its task
      if (!collectedFunctionCalls || collectedFunctionCalls.length === 0) {
        logStore.setActiveStep(null);
        logStore.addLog('info', `Agent completed reasoning at step ${currentStep} (${genDurationSec}s)`);
        break;
      }

      // Append model's tool call turn to contents
      contents.push({
        role: 'model',
        parts: allModelParts.length > 0 ? allModelParts : [{ text: stepAnswerText || 'Executing tools...' }],
      });

      // Execute each tool requested by the model
      const responseParts: any[] = [];
      for (const fc of collectedFunctionCalls) {
        if (abortSignal?.aborted) break;

        const toolSpec = agentToolsRegistry[fc.name || ''];
        if (toolSpec) {
          logStore.addLog('info', `[Step ${currentStep}] Invoking tool: ${fc.name}`, fc.args);
          logStore.setActiveStep(`[Step ${currentStep}] Executing ${fc.name}...`);

          const toolStartTime = performance.now();
          const toolResult = await toolSpec.execute(fc.args || {}, agentMode);
          const toolDurationSec = ((performance.now() - toolStartTime) / 1000).toFixed(2);

          logStore.addLog(
            toolResult.success ? 'success' : 'error',
            `⚡ [Step ${currentStep}] Tool "${fc.name}" ${toolResult.success ? 'finished' : 'failed'} in ${toolDurationSec}s`
          );

          executedTools.push({
            id: `tool-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            name: fc.name,
            args: fc.args || {},
            summary: toolResult.summary,
            status: toolResult.success ? 'completed' : 'failed',
            result: toolResult.resultData,
            error: toolResult.error,
          });

          responseParts.push({
            functionResponse: {
              name: fc.name,
              response: {
                success: toolResult.success,
                summary: toolResult.summary,
                result: toolResult.resultData || {},
                error: toolResult.error || undefined,
              },
            },
          });
        } else {
          responseParts.push({
            functionResponse: {
              name: fc.name,
              response: {
                success: false,
                error: `Tool "${fc.name}" is not registered in the system.`,
              },
            },
          });
        }
      }

      // Append user/tool response turn back into contents for the next step
      contents.push({
        role: 'user',
        parts: responseParts,
      });

      currentStep++;
    }

    logStore.setActiveStep(null);

    // If no text was provided in the final turn, construct an informative summary of actions
    if (!finalReplyText) {
      if (executedTools.length > 0) {
        finalReplyText = executedTools
          .map((t) => (t.status === 'completed' ? `✅ ${t.summary}` : `⚠️ ${t.summary} (${t.error})`))
          .join('\n\n');
      } else {
        finalReplyText = 'Completed interaction.';
      }
    }

    const finalThoughtText =
      accumulatedThoughts.length > 0 ? accumulatedThoughts.join('\n\n---\n\n') : undefined;

    return {
      replyText: finalReplyText,
      thought: finalThoughtText,
      thinkingTokens: totalThinkingTokens > 0 ? totalThinkingTokens : undefined,
      promptTokens: totalPromptTokens > 0 ? totalPromptTokens : undefined,
      candidateTokens: totalCandidateTokens > 0 ? totalCandidateTokens : undefined,
      cachedTokens: totalCachedTokens > 0 ? totalCachedTokens : undefined,
      modelUsed: selectedModel,
      toolsExecuted: executedTools,
    };
  } catch (err: any) {
    logStore.setActiveStep(null);
    logStore.addLog('error', `Gemini API Error: ${err.message}`);
    return {
      replyText: `⚠️ Gemini API Error: ${err.message || 'Failed to communicate with Gemini API.'}`,
      toolsExecuted: [],
    };
  }
}
