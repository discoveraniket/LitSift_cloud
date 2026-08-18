import { GoogleGenAI, FunctionCallingConfigMode } from '@google/genai';
import { usePdfStore } from '../store/usePdfStore';
import { useGridStore } from '../store/useGridStore';
import { getPdfBase64 } from './pdfUtils';
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

  // 4. PDF Binary Blob Availability Guard
  let pdfBase64: string | undefined;
  if (activePdf) {
    try {
      logStore.setActiveStep(`Verifying attached PDF "${activePdf.name}"...`);
      pdfBase64 = await getPdfBase64(activePdf);
      if (!pdfBase64 || pdfBase64.length === 0) {
        throw new Error('PDF binary content is empty.');
      }
    } catch (err: any) {
      logStore.addLog('error', `PDF binary read failed for "${activePdf.name}": ${err.message}`);
      if (isDocumentQuery) {
        return {
          valid: false,
          error: `⚠️ **Unable to read PDF file "${activePdf.name}".**\n\nThe binary file data could not be retrieved from local IndexedDB storage. Please re-upload the PDF in the Left Explorer.`,
        };
      }
    }
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

export async function processAgentInteraction(
  userPrompt: string,
  activePdfTitle: string = 'Active Paper',
  abortSignal?: AbortSignal
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
  const activePdf = validation.activePdf;
  const pdfBase64 = validation.pdfBase64;

  try {
    const agentStore = useAgentStore.getState();

    // Determine past conversation turns (excluding welcome banner)
    const pastNonWelcomeMessages = agentStore.messages.filter(
      (m) =>
        m.id !== 'msg-1' &&
        !m.text.startsWith('**Now viewing') &&
        !m.text.startsWith('LitSift Agent is online')
    );
    const isFollowup = pastNonWelcomeMessages.length > 1;

    // Inject focused cell metadata if a cell is currently selected
    const gridStore = useGridStore.getState();
    const focusedCell = gridStore.focusedCell;
    let finalPromptText = userPrompt;

    if (focusedCell) {
      const row = gridStore.rows.find((r) => r.id === focusedCell.rowId);
      const col = gridStore.columns.find((c) => c.field === focusedCell.field);
      const cellValue = row ? row[focusedCell.field] || 'Empty' : 'Unknown';
      const citation = row?.citationMap?.[focusedCell.field] || gridStore.activeCitation;

      logStore.addLog('info', `Injecting active cell context for column "${col?.headerName || focusedCell.field}"`, {
        rowId: focusedCell.rowId,
        field: focusedCell.field,
        cellValue,
        citation,
      });

      finalPromptText = `[ACTIVE CELL CONTEXT]
- Selected Row: "${row?.pdfTitle || activePdfTitle}" (Row ID: ${focusedCell.rowId})
- Target Column: "${col?.headerName || focusedCell.field}" (Field: ${focusedCell.field})
- Current Extracted Value: "${cellValue}"
- Grounded Evidence Quote: "${citation?.snippetQuote || 'N/A'}"
- Source Location: Page ${citation?.pageNumber || 'N/A'}, Section: ${citation?.sectionName || 'N/A'}
- Existing AI Reasoning: "${citation?.reasoning || 'N/A'}"

[USER INSTRUCTION]:
${userPrompt}

(Note: If this requires updating, modifying, or populating the table, invoke the appropriate tools.)`;
    } else if (gridStore.rows.length > 0) {
      // Inject concise table state summary in global mode
      const populatedRows = gridStore.rows.filter((r) => !r.isDraftRow);
      const colsSummary = gridStore.columns.map((c) => `${c.headerName} (${c.field})`).join(', ');
      const rowsSummary = populatedRows
        .slice(0, 5)
        .map((r, i) => {
          const rowFields = gridStore.columns
            .slice(0, 5)
            .map((c) => `${c.headerName}: "${r[c.field] || '-'}"`)
            .join(', ');
          return `  • Row ${i + 1} (ID: ${r.id}, Paper: "${r.pdfTitle || activePdfTitle}"): ${rowFields}`;
        })
        .join('\n');

      finalPromptText = `[CURRENT DATA GRID STATE]
- Active Columns: ${colsSummary || 'None'}
- Existing Table Rows in Workspace (${populatedRows.length}):
${rowsSummary || '  (No populated rows)'}

[IMPORTANT MULTI-PAPER DATASET RULES]:
- LitSift is a cumulative multi-paper database aggregating scientific findings across multiple uploaded research papers.
- Existing rows from other papers (distinguishable by their Article DOI or paper titles) represent valuable accumulated research data and must NEVER be deleted, altered, or overwritten when extracting or editing data for a new paper.
- When extracting findings from the current paper ("${activePdfTitle}"), ALWAYS append new rows into the table schema.

[USER INSTRUCTION]:
${userPrompt}`;
    }

    // Build multi-turn contents array with history
    const contents: any[] = [];

    // On Turn 1 (or standalone), attach the PDF binary
    if (activePdf && pdfBase64) {
      try {
        const firstUserMsg = pastNonWelcomeMessages.find((m) => m.sender === 'user');
        const firstTurnText = firstUserMsg ? firstUserMsg.text : finalPromptText;

        contents.push({
          role: 'user',
          parts: [
            {
              inlineData: {
                mimeType: 'application/pdf',
                data: pdfBase64,
              },
            },
            { text: isFollowup ? firstTurnText : finalPromptText },
          ],
        });

        // Add intermediate conversation history turns if in follow-up mode
        if (isFollowup) {
          const remainingHistory = pastNonWelcomeMessages.slice(1, -1);
          for (const msg of remainingHistory) {
            contents.push({
              role: msg.sender === 'user' ? 'user' : 'model',
              parts: [{ text: msg.text }],
            });
          }

          // Add current prompt as latest user turn
          contents.push({
            role: 'user',
            parts: [{ text: finalPromptText }],
          });
        }
      } catch (e: any) {
        logStore.addLog('warn', `PDF attachment notice: ${e.message}`);
        contents.push({
          role: 'user',
          parts: [{ text: finalPromptText }],
        });
      }
    } else {
      contents.push({
        role: 'user',
        parts: [{ text: finalPromptText }],
      });
    }

    const ai = new GoogleGenAI({ apiKey });

    const systemInstruction = `You are LitSift Agent, an autonomous scientific literature synthesis assistant.
You are interacting with research paper "${activePdfTitle}" and managing a structured scientific data grid.
Understand the user's high-level objective and autonomously break it down into an ordered sequence of prerequisite and dependent tool actions.
When an objective involves dependent steps (such as creating schema structure before populating data, or querying findings before updating cells), execute the prerequisite actions first, and continue calling the dependent tools in subsequent turns until the complete user goal is fully realized.

CUMULATIVE MULTI-DOCUMENT DATASET INTEGRITY:
- The data grid accumulates scientific extractions across multiple papers.
- NEVER delete or overwrite existing table rows belonging to other research papers (which have different article DOIs or paper titles).
- When the user asks to extract data from the active paper, invoke extractPDFData to append the new findings to the dataset while leaving rows from other papers completely intact.
- If editing existing rows from the active paper, perform updates, column additions, or disaggregations directly on those specific rows.

You have access to a rich declarative tool suite:
- Cell & row editing: updateCell, batchUpdateCells, updateRow
- Schema management: addColumn (supports optional initialValues), renameColumn, deleteColumn
- Row structuring & disaggregation: disaggregateRow (to expand composite multi-variable rows into atomic observation rows with structured column values), mergeRows (to synthesize unified rows), deleteRows
- Document synthesis & verification: extractPDFData, verifyEvidenceCitation, searchDocument, queryGridData
Execute all required tool actions to fulfill the user's instructions and summarize your reasoning and findings clearly.`;

    // Multi-Step ReAct Execution Loop
    const MAX_STEPS = 6;
    let currentStep = 1;
    const executedTools: AgentToolExecution[] = [];
    let finalReplyText = '';

    while (currentStep <= MAX_STEPS) {
      if (abortSignal?.aborted) {
        logStore.addLog('warn', 'Agent interaction stopped by user.');
        return {
          replyText: 'Agent execution was stopped by user.',
          toolsExecuted: executedTools,
        };
      }

      // Dynamically evaluate tool schemas on every step to reflect latest columns
      const currentTools = getToolsForMode(agentMode);

      logStore.setActiveStep(`[Step ${currentStep}/${MAX_STEPS}] Reasoning with Gemini (${selectedModel})...`);
      const genStartTime = performance.now();

      const response: any = await ai.models.generateContent({
        model: selectedModel,
        contents,
        config: {
          systemInstruction,
          temperature: 0.2,
          tools: currentTools,
          toolConfig: {
            functionCallingConfig: {
              mode: FunctionCallingConfigMode.AUTO,
            },
          },
        },
      });

      const genDurationSec = ((performance.now() - genStartTime) / 1000).toFixed(2);
      const usage = response.usageMetadata;
      const promptTokens = usage?.promptTokenCount ?? 0;
      const candidateTokens = usage?.candidatesTokenCount ?? 0;
      const thinkingTokens = usage?.thinkingTokenCount ?? usage?.reasoningTokenCount;
      const cachedTokens = usage?.cachedContentTokenCount;

      let telemetryMsg = `⏱️ [Step ${currentStep}] Gemini ${selectedModel} responded in ${genDurationSec}s | Tokens: Prompt=${promptTokens.toLocaleString()}, Output=${candidateTokens.toLocaleString()}`;
      if (thinkingTokens) {
        telemetryMsg += `, Thinking=${thinkingTokens.toLocaleString()}`;
      }
      if (cachedTokens) {
        telemetryMsg += `, Cached=${cachedTokens.toLocaleString()}`;
      }

      logStore.addLog('info', telemetryMsg, {
        step: currentStep,
        latencySec: Number(genDurationSec),
        usageMetadata: usage,
      });

      const candidate = response.candidates?.[0];
      const parts = candidate?.content?.parts || [];

      // Extract function calls
      const functionCalls =
        response.functionCalls ||
        parts.filter((p: any) => p.functionCall).map((p: any) => p.functionCall);

      // Record any text generated by the model
      const candidateText = parts.find((p: any) => p.text)?.text;
      if (candidateText) {
        finalReplyText = candidateText;
      }

      // If no tools were called, the agent has finished its task
      if (!functionCalls || functionCalls.length === 0) {
        logStore.setActiveStep(null);
        logStore.addLog('info', `Agent completed reasoning at step ${currentStep} (${genDurationSec}s)`);
        break;
      }

      // Append model's tool call turn to contents
      contents.push({
        role: 'model',
        parts,
      });

      // Execute each tool requested by the model
      const responseParts: any[] = [];
      for (const fc of functionCalls) {
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

    return {
      replyText: finalReplyText,
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
