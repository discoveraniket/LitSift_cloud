import { create } from 'zustand';
import { produce } from 'immer';
import { AgentState, AgentMessage, AgentScope } from '../types/agent';
import { processAgentInteraction } from '../services/geminiService';
import { setActiveProvider } from '../services/providerConfig';
import { useGridStore } from './useGridStore';
import { db } from '../db/litsiftDb';

export const useAgentStore = create<AgentState>((set, get) => ({
  messages: [],
  activePdfId: '',
  agentScope: (typeof localStorage !== 'undefined' && (localStorage.getItem('litsift_agent_scope') as AgentScope)) || 'workspace',
  activeBatchProgress: null,
  isThinking: false,
  activityStatus: 'idle',
  activityDetail: undefined,
  activityToolName: undefined,
  streamingThought: '',
  streamingText: '',
  mode: 'human_in_loop',
  abortController: null,
  lastInteractionId: undefined,
  checkpoint: null,

  setActivityStatus: (status, detail, toolName) =>
    set({ activityStatus: status, activityDetail: detail, activityToolName: toolName }),

  setActiveBatchProgress: (progress) =>
    set({ activeBatchProgress: progress }),

  hydrateFromDb: async () => {
    try {
      const isWorkspace = get().agentScope === 'workspace';
      const activeId = isWorkspace ? 'workspace-global' : (get().activePdfId || 'master-grid');
      const stored = await db.chatMessages.where('pdfId').equals(activeId).sortBy('timestamp');

      if (stored.length > 0) {
        // Clean out legacy greeting messages if any
        const cleaned = stored.filter(
          (m) => m.text !== '⚡ LitSift Agent ready' && !m.text.startsWith('⚡ Viewing')
        );
        set({ messages: cleaned });
      } else {
        set({ messages: [] });
      }
    } catch (err) {
      console.warn('Failed to hydrate chat messages from IndexedDB:', err);
    }
  },

  setActivePdfId: async (pdfId: string) => {
    set({ activePdfId: pdfId });
    // In workspace scope, retain continuous conversation stream without blanking
    if (get().agentScope !== 'paper') {
      return;
    }
    try {
      const targetId = pdfId || 'master-grid';
      const paperMessages = await db.chatMessages.where('pdfId').equals(targetId).sortBy('timestamp');

      if (paperMessages.length > 0) {
        const cleaned = paperMessages.filter(
          (m) => m.text !== '⚡ LitSift Agent ready' && !m.text.startsWith('⚡ Viewing')
        );
        set({ messages: cleaned });
      } else {
        set({ messages: [] });
      }
    } catch (err) {
      console.warn('Failed to switch active chat messages:', err);
    }
  },

  setAgentScope: async (scope: AgentScope) => {
    set({ agentScope: scope });
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('litsift_agent_scope', scope);
      }
    } catch (_) {}

    try {
      const targetId = scope === 'workspace' ? 'workspace-global' : (get().activePdfId || 'master-grid');
      const messages = await db.chatMessages.where('pdfId').equals(targetId).sortBy('timestamp');

      if (messages.length > 0) {
        const cleaned = messages.filter(
          (m) => m.text !== '⚡ LitSift Agent ready' && !m.text.startsWith('⚡ Viewing')
        );
        set({ messages: cleaned });
      } else {
        set({ messages: [] });
      }
    } catch (err) {
      console.warn('Failed to switch agent scope messages:', err);
    }
  },

  setExecutionMode: (mode) => set({ mode }),

  addAgentResponse: async (text: string, options?: string[]) => {
    const isWorkspace = get().agentScope === 'workspace';
    const currentPdfId = isWorkspace ? 'workspace-global' : (get().activePdfId || 'master-grid');
    const agentMsg: AgentMessage = {
      id: `msg-${Date.now()}`,
      pdfId: currentPdfId,
      sender: 'agent',
      text,
      options,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    set(
      produce((state: AgentState) => {
        state.messages.push(agentMsg);
      })
    );

    try {
      await db.chatMessages.put(agentMsg);
    } catch (err) {
      console.warn('Failed to save agent message to IndexedDB:', err);
    }
  },

  sendMessage: (text: string, activePdfTitle?: string) => {
    if (!text || !text.trim()) return;
    const isWorkspace = get().agentScope === 'workspace';
    const currentPdfId = isWorkspace ? 'workspace-global' : (get().activePdfId || 'master-grid');
    const controller = new AbortController();
    const startTime = Date.now();

    const userMsg: AgentMessage = {
      id: `msg-${Date.now()}`,
      pdfId: currentPdfId,
      sender: 'user',
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    set(
      produce((state: AgentState) => {
        state.messages.push(userMsg);
        state.isThinking = true;
        state.activityStatus = 'reading_context';
        state.activityDetail = activePdfTitle
          ? `Reading "${activePdfTitle}" & assembling context...`
          : 'Reading prompt & assembling context...';
        state.activityToolName = undefined;
        state.streamingThought = '';
        state.streamingText = '';
        state.abortController = controller;
      })
    );

    db.chatMessages.put(userMsg).catch(console.warn);

    // Execute Multi-Step ReAct Agent Loop with real-time streaming
    processAgentInteraction(
      text,
      activePdfTitle,
      controller.signal,
      (stream) => {
        set((prev) => {
          let nextStatus = stream.activityStatus || prev.activityStatus;
          let nextDetail = stream.activityDetail !== undefined ? stream.activityDetail : prev.activityDetail;
          let nextToolName = stream.activityToolName !== undefined ? stream.activityToolName : prev.activityToolName;

          if (stream.thoughtChunk) {
            nextStatus = 'thinking';
            nextDetail = 'Reasoning through research context...';
          } else if (stream.toolCallChunk) {
            nextStatus = 'formulating_action';
            nextToolName = stream.toolCallChunk.name || nextToolName;
            nextDetail = nextToolName ? `Preparing tool action: ${nextToolName}...` : 'Preparing tool action...';
          } else if (stream.textChunk && !stream.thoughtChunk && nextStatus !== 'executing_tool') {
            nextStatus = 'generating_text';
            nextDetail = undefined;
          }

          return {
            streamingThought: stream.fullThoughtText || '',
            streamingText: stream.fullText || '',
            activityStatus: nextStatus,
            activityDetail: nextDetail,
            activityToolName: nextToolName,
          };
        });
      }
    )
      .then((result) => {
        const durationSec = Number(((Date.now() - startTime) / 1000).toFixed(1));
        const agentMsg: AgentMessage = {
          id: `msg-${Date.now() + 1}`,
          pdfId: currentPdfId,
          sender: 'agent',
          text: result.replyText,
          thought: result.thought,
          thinkingTokens: result.thinkingTokens,
          promptTokens: result.promptTokens,
          candidateTokens: result.candidateTokens,
          cachedTokens: result.cachedTokens,
          modelUsed: result.modelUsed,
          timeToFirstToken: result.timeToFirstToken,
          tokensPerSecond: result.tokensPerSecond,
          cost: result.cost,
          upstreamProvider: result.upstreamProvider,
          generationId: result.generationId,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          toolsExecuted: result.toolsExecuted,
          executionTime: durationSec,
          options: result.options,
          toolCall:
            result.toolsExecuted.length > 0
              ? {
                  name: result.toolsExecuted.map((t) => t.name).join(', '),
                  description: result.toolsExecuted.map((t) => t.summary).join(' | '),
                  status: result.toolsExecuted.every((t) => t.status === 'completed')
                    ? 'completed'
                    : 'failed',
                }
              : undefined,
        };

        set(
          produce((state: AgentState) => {
            state.messages.push(agentMsg);
            state.isThinking = false;
            state.activityStatus = 'idle';
            state.activityDetail = undefined;
            state.activityToolName = undefined;
            state.streamingThought = '';
            state.streamingText = '';
            state.abortController = null;
            if (!result.checkpoint) {
              state.checkpoint = null;
            }
          })
        );

        db.chatMessages.put(agentMsg).catch(console.warn);
      })
      .catch((err) => {
        const errMsg: AgentMessage = {
          id: `msg-${Date.now() + 1}`,
          pdfId: currentPdfId,
          sender: 'agent',
          text: `⚠️ Agent Error: ${err.message || 'Execution failed.'}`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        };

        set(
          produce((state: AgentState) => {
            state.messages.push(errMsg);
            state.isThinking = false;
            state.activityStatus = 'idle';
            state.activityDetail = undefined;
            state.activityToolName = undefined;
            state.streamingThought = '';
            state.streamingText = '';
            state.abortController = null;
          })
        );

        db.chatMessages.put(errMsg).catch(console.warn);
      });
  },

  cancelInteraction: () => {
    const controller = get().abortController;
    if (controller) {
      controller.abort();
      set({
        isThinking: false,
        activityStatus: 'idle',
        activityDetail: undefined,
        activityToolName: undefined,
        streamingThought: '',
        streamingText: '',
        abortController: null,
      });
    }
  },

  selectOption: (optionText: string) => {
    if (optionText.toLowerCase().includes('resume step') && get().checkpoint) {
      get().resumeCheckpoint();
      return;
    }

    if (optionText.toLowerCase().includes('switch to gemini') && get().checkpoint) {
      setActiveProvider('gemini');
      get().resumeCheckpoint();
      return;
    }

    const pendingCsv = (window as any).__pendingCsvImport;
    const currentPdfId = get().activePdfId || 'master-grid';

    if (pendingCsv && optionText.toLowerCase().includes('append')) {
      useGridStore.getState().appendCsvDataset(pendingCsv.headers, pendingCsv.parsedRows);
      (window as any).__pendingCsvImport = null;
      const msg: AgentMessage = {
        id: `msg-${Date.now()}`,
        pdfId: currentPdfId,
        sender: 'agent',
        text: `Appended ${pendingCsv.parsedRows.length} rows from "${pendingCsv.filename}" to your current table!`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      set(
        produce((state: AgentState) => {
          state.messages.push(msg);
        })
      );
      db.chatMessages.put(msg).catch(console.warn);
      return;
    }

    if (pendingCsv && optionText.toLowerCase().includes('replace')) {
      useGridStore.getState().importCsvDataset(pendingCsv.headers, pendingCsv.parsedRows);
      (window as any).__pendingCsvImport = null;
      const msg: AgentMessage = {
        id: `msg-${Date.now()}`,
        pdfId: currentPdfId,
        sender: 'agent',
        text: `Replaced open table with ${pendingCsv.parsedRows.length} rows from "${pendingCsv.filename}".`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      set(
        produce((state: AgentState) => {
          state.messages.push(msg);
        })
      );
      db.chatMessages.put(msg).catch(console.warn);
      return;
    }

    get().sendMessage(optionText);
  },

  deleteMessage: async (id: string) => {
    set((state) => ({
      messages: state.messages.filter((m) => m.id !== id),
    }));
    try {
      await db.chatMessages.delete(id);
    } catch (err) {
      console.warn('Failed to delete message from IndexedDB:', err);
    }
  },

  clearMessages: async () => {
    const isWorkspace = get().agentScope === 'workspace';
    const currentPdfId = isWorkspace ? 'workspace-global' : (get().activePdfId || 'master-grid');

    set({
      messages: [],
    });

    try {
      await db.chatMessages.where('pdfId').equals(currentPdfId).delete();
    } catch (err) {
      console.warn('Failed to clear chat messages in IndexedDB:', err);
    }
  },

  setCheckpoint: (checkpoint) => set({ checkpoint }),

  resumeCheckpoint: async () => {
    const cp = get().checkpoint;
    if (!cp) return;

    const currentPdfId = get().activePdfId || 'master-grid';
    const controller = new AbortController();
    const startTime = Date.now();

    set(
      produce((state: AgentState) => {
        state.isThinking = true;
        state.activityStatus = 'reading_context';
        state.activityDetail = `Resuming from step ${cp.currentStep}/${cp.maxSteps}...`;
        state.activityToolName = undefined;
        state.streamingThought = '';
        state.streamingText = '';
        state.abortController = controller;
      })
    );

    try {
      const result = await processAgentInteraction(
        cp.userPrompt,
        cp.activePdfTitle,
        controller.signal,
        (stream) => {
          set((prev) => {
            let nextStatus = stream.activityStatus || prev.activityStatus;
            let nextDetail = stream.activityDetail !== undefined ? stream.activityDetail : prev.activityDetail;
            let nextToolName = stream.activityToolName !== undefined ? stream.activityToolName : prev.activityToolName;

            if (stream.thoughtChunk) {
              nextStatus = 'thinking';
              nextDetail = 'Reasoning through research context...';
            } else if (stream.toolCallChunk) {
              nextStatus = 'formulating_action';
              nextToolName = stream.toolCallChunk.name || nextToolName;
              nextDetail = nextToolName ? `Preparing tool action: ${nextToolName}...` : 'Preparing tool action...';
            } else if (stream.textChunk && !stream.thoughtChunk && nextStatus !== 'executing_tool') {
              nextStatus = 'generating_text';
              nextDetail = undefined;
            }

            return {
              streamingThought: stream.fullThoughtText || '',
              streamingText: stream.fullText || '',
              activityStatus: nextStatus,
              activityDetail: nextDetail,
              activityToolName: nextToolName,
            };
          });
        },
        cp
      );

      const durationSec = Number(((Date.now() - startTime) / 1000).toFixed(1));
      const agentMsg: AgentMessage = {
        id: `msg-${Date.now() + 1}`,
        pdfId: currentPdfId,
        sender: 'agent',
        text: result.replyText,
        thought: result.thought,
        thinkingTokens: result.thinkingTokens,
        promptTokens: result.promptTokens,
        candidateTokens: result.candidateTokens,
        cachedTokens: result.cachedTokens,
        modelUsed: result.modelUsed,
        timeToFirstToken: result.timeToFirstToken,
        tokensPerSecond: result.tokensPerSecond,
        cost: result.cost,
        upstreamProvider: result.upstreamProvider,
        generationId: result.generationId,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        toolsExecuted: result.toolsExecuted,
        executionTime: durationSec,
        options: result.options,
        toolCall:
          result.toolsExecuted.length > 0
            ? {
                name: result.toolsExecuted.map((t) => t.name).join(', '),
                description: result.toolsExecuted.map((t) => t.summary).join(' | '),
                status: result.toolsExecuted.every((t) => t.status === 'completed') ? 'completed' : 'failed',
              }
            : undefined,
      };

      set(
        produce((state: AgentState) => {
          state.messages.push(agentMsg);
          state.isThinking = false;
          state.activityStatus = 'idle';
          state.activityDetail = undefined;
          state.activityToolName = undefined;
          state.streamingThought = '';
          state.streamingText = '';
          state.abortController = null;
          if (!result.checkpoint) {
            state.checkpoint = null;
          }
        })
      );

      db.chatMessages.put(agentMsg).catch(console.warn);
    } catch (err: any) {
      const errMsg: AgentMessage = {
        id: `msg-${Date.now() + 1}`,
        pdfId: currentPdfId,
        sender: 'agent',
        text: `⚠️ Agent Error: ${err.message || 'Execution failed.'}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      set(
        produce((state: AgentState) => {
          state.messages.push(errMsg);
          state.isThinking = false;
          state.activityStatus = 'idle';
          state.activityDetail = undefined;
          state.activityToolName = undefined;
          state.streamingThought = '';
          state.streamingText = '';
          state.abortController = null;
        })
      );

      db.chatMessages.put(errMsg).catch(console.warn);
    }
  },
}));
