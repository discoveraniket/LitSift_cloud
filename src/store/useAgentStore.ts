import { create } from 'zustand';
import { produce } from 'immer';
import { AgentState, AgentMessage } from '../types/agent';
import { processAgentInteraction } from '../services/geminiService';
import { useGridStore } from './useGridStore';
import { db } from '../db/litsiftDb';

export const useAgentStore = create<AgentState>((set, get) => ({
  messages: [],
  activePdfId: '',
  isThinking: false,
  streamingThought: '',
  streamingText: '',
  mode: 'human_in_loop',
  abortController: null,
  lastInteractionId: undefined,

  hydrateFromDb: async () => {
    try {
      const activeId = get().activePdfId || 'master-grid';
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

  setExecutionMode: (mode) => set({ mode }),

  addAgentResponse: async (text: string, options?: string[]) => {
    const currentPdfId = get().activePdfId || 'master-grid';
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
    const currentPdfId = get().activePdfId || 'master-grid';
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
        set({
          streamingThought: stream.fullThoughtText || '',
          streamingText: stream.fullText || '',
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
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          toolsExecuted: result.toolsExecuted,
          executionTime: durationSec,
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
            state.streamingThought = '';
            state.streamingText = '';
            state.abortController = null;
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
      set({ isThinking: false, streamingThought: '', streamingText: '', abortController: null });
    }
  },

  selectOption: (optionText: string) => {
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
    const currentPdfId = get().activePdfId || 'master-grid';

    set({
      messages: [],
    });

    try {
      if (currentPdfId === 'master-grid') {
        await db.chatMessages.clear();
      } else {
        await db.chatMessages.where('pdfId').equals(currentPdfId).delete();
      }
    } catch (err) {
      console.warn('Failed to clear chat messages in IndexedDB:', err);
    }
  },
}));
