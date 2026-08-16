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

export async function processAgentInteraction(
  userPrompt: string,
  activePdfTitle: string = 'Active Paper',
  abortSignal?: AbortSignal
): Promise<AgentExecutionResult> {
  const apiKey = getGeminiApiKey();
  const selectedModel = getSelectedGeminiModel();
  const agentMode: AgentExecutionMode = useAgentStore.getState().mode || 'human_in_loop';
  const logStore = useLogStore.getState();

  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is missing. Please configure GEMINI_API_KEY in Settings or environment variables.');
  }

  try {
    const pdfStore = usePdfStore.getState();
    const activePdf =
      pdfStore.getActivePdf() ||
      pdfStore.pdfs.find((p) => p.name === activePdfTitle || p.id === activePdfTitle);
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
- Existing Table Rows (${populatedRows.length}):
${rowsSummary || '  (No populated rows)'}

[USER INSTRUCTION]:
${userPrompt}

(Note: If table rows already exist, perform updates or schema modifications directly on the existing rows without calling extractPDFData unless the user explicitly asks to re-extract.)`;
    }

    // Build multi-turn contents array with history
    const contents: any[] = [];

    // On Turn 1 (or standalone), attach the PDF binary
    if (activePdf) {
      try {
        logStore.setActiveStep(`Loading attached PDF "${activePdf.name}"...`);
        const base64Data = await getPdfBase64(activePdf);

        const firstUserMsg = pastNonWelcomeMessages.find((m) => m.sender === 'user');
        const firstTurnText = firstUserMsg ? firstUserMsg.text : finalPromptText;

        contents.push({
          role: 'user',
          parts: [
            {
              inlineData: {
                mimeType: 'application/pdf',
                data: base64Data,
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
If rows are already present in the data grid, perform the requested updates, column additions, or refinements directly on the existing rows rather than re-extracting unless explicitly instructed.

You have access to a rich tool suite:
- Cell editing: updateCell, batchUpdateCells
- Schema management: addColumn, renameColumn, deleteColumn
- Row structuring: splitRow, mergeRows, deleteRows
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
        logStore.addLog('info', `Agent finished reasoning at step ${currentStep}`);
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

          const toolResult = await toolSpec.execute(fc.args || {}, agentMode);

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
