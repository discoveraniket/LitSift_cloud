import { GoogleGenAI } from '@google/genai';
import { usePdfStore } from '../store/usePdfStore';
import { useGridStore } from '../store/useGridStore';
import { getPdfBase64 } from './pdfUtils';
import { getToolsForMode, agentToolsRegistry, AgentExecutionMode } from './agentToolRegistry';
import { useAgentStore } from '../store/useAgentStore';
import { useLogStore } from '../store/useLogStore';

// Retrieve API key from environment variable (GEMINI_API_KEY) or localStorage fallback
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

export interface AgentExecutionResult {
  replyText: string;
  toolExecuted?: {
    name: string;
    description: string;
  };
}

export async function processAgentInteraction(userPrompt: string, activePdfTitle: string = 'Active Paper'): Promise<AgentExecutionResult> {
  const apiKey = getGeminiApiKey();
  const selectedModel = getSelectedGeminiModel();
  const agentMode: AgentExecutionMode = useAgentStore.getState().mode || 'human_in_loop';
  const logStore = useLogStore.getState();

  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is missing. Please set GEMINI_API_KEY in environment variables.');
  }

  // Fast-Path: Direct extraction intent detection
  const lower = userPrompt.toLowerCase().trim();
  if (lower === 'extract paper data' || lower === 'extract data' || lower.startsWith('extract paper data into table') || lower === '⚡ extract data') {
    logStore.addLog('info', `Routing prompt directly to extractPDFData tool for "${activePdfTitle}"`);
    const toolResult = await agentToolsRegistry.extractPDFData.execute({ pdfId: activePdfTitle }, agentMode);
    return {
      replyText: toolResult.replyText,
      toolExecuted: {
        name: 'extractPDFData',
        description: toolResult.summary,
      },
    };
  }

  try {
    const pdfStore = usePdfStore.getState();
    const activePdf = pdfStore.getActivePdf() || pdfStore.pdfs.find((p) => p.name === activePdfTitle || p.id === activePdfTitle);
    const agentStore = useAgentStore.getState();

    // Determine past conversation turns
    const pastNonWelcomeMessages = agentStore.messages.filter(
      (m) => m.id !== 'msg-1' && !m.text.startsWith('**Now viewing') && !m.text.startsWith('LitSift Agent is online')
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

[USER QUESTION / INSTRUCTION]:
${userPrompt}

(Note: If the user asks you to modify, correct, refine, or update this cell or any table value, invoke the updateCell tool with the new value, reasoning, and citation quote.)`;
    }

    // Build multi-turn contents array with history
    const contents: any[] = [];

    // On Turn 1 (or standalone), attach the PDF binary
    if (activePdf) {
      try {
        logStore.setActiveStep(`Loading attached PDF "${activePdf.name}"...`);
        const base64Data = await getPdfBase64(activePdf);
        
        // Push initial user message with attached PDF
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

          // Add the current prompt as the latest user turn
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

    logStore.setActiveStep(`Querying Gemini ${selectedModel}...`);
    const ai = new GoogleGenAI({ apiKey });
    const tools = getToolsForMode(agentMode);

    const systemInstruction = `You are LitSift Agent, an intelligent academic literature synthesis assistant for research paper "${activePdfTitle}".
The PDF document file is directly attached to this conversation. You excel at extracting data, verifying claims, and modifying table cells.
IMPORTANT: When the user asks you to update, correct, modify, or refine a table cell value, you MUST invoke the updateCell tool rather than merely describing the change in text.`;

    // 1. Send conversation turn with registered tools
    const response = await ai.models.generateContent({
      model: selectedModel,
      contents,
      config: {
        systemInstruction,
        temperature: 0.2,
        tools,
      },
    });

    logStore.setActiveStep(null);

    const candidate = response.candidates?.[0];
    const parts = candidate?.content?.parts || [];
    const functionCalls = parts.filter((p) => p.functionCall);

    // 2. Closed-Loop Tool Execution (ReAct Feedback Loop)
    if (functionCalls && functionCalls.length > 0) {
      const fc = functionCalls[0].functionCall!;
      const toolSpec = agentToolsRegistry[fc.name || ''];

      if (toolSpec) {
        logStore.addLog('info', `Gemini requested tool call: ${fc.name}`, fc.args);
        const toolResult = await toolSpec.execute(fc.args || {}, agentMode);

        // 3. Append model's functionCall turn to conversation
        contents.push({
          role: 'model',
          parts: [{ functionCall: fc }],
        });

        // 4. FEEDBACK LOOP: Send functionResponse back to Gemini
        contents.push({
          role: 'user',
          parts: [
            {
              functionResponse: {
                name: fc.name,
                response: {
                  status: 'success',
                  result: toolResult.summary,
                  details: toolResult.resultData || {},
                },
              },
            },
          ],
        });

        // 5. Query Gemini for final natural language confirmation turn
        try {
          logStore.setActiveStep(`Finalizing response with Gemini...`);
          const finalResponse = await ai.models.generateContent({
            model: selectedModel,
            contents,
            config: {
              systemInstruction,
              temperature: 0.2,
            },
          });

          logStore.setActiveStep(null);
          const finalReplyText = finalResponse.candidates?.[0]?.content?.parts?.find((p) => p.text)?.text 
            || toolResult.replyText;

          logStore.addLog('info', 'Received feedback confirmation from Gemini', { finalReplySnippet: finalReplyText.slice(0, 120) });

          return {
            replyText: finalReplyText,
            toolExecuted: {
              name: fc.name || 'toolCall',
              description: toolResult.summary,
            },
          };
        } catch (finalErr: any) {
          logStore.setActiveStep(null);
          logStore.addLog('warn', `Feedback loop finalization notice: ${finalErr.message}`);
          return {
            replyText: toolResult.replyText,
            toolExecuted: {
              name: fc.name || 'toolCall',
              description: toolResult.summary,
            },
          };
        }
      }
    }

    const replyText = parts.find((p) => p.text)?.text || 'Interaction completed.';
    logStore.addLog('info', 'Received response from Gemini', { replySnippet: replyText.slice(0, 120) });

    return {
      replyText,
    };
  } catch (err: any) {
    logStore.setActiveStep(null);
    logStore.addLog('error', `Gemini API Error: ${err.message}`);
    return {
      replyText: `⚠️ Gemini API Error: ${err.message || 'Failed to communicate with Gemini API.'}`,
    };
  }
}
