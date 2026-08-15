import { create } from 'zustand';
import { produce } from 'immer';
import { AgentState, AgentMessage } from '../types/agent';
import { processAgentInteraction } from '../services/geminiService';
import { useGridStore } from './useGridStore';
import { db } from '../db/litsiftDb';

const createDefaultGreeting = (pdfTitle?: string): AgentMessage => ({
  id: `msg-${Date.now()}`,
  pdfId: pdfTitle ? undefined : 'master-grid',
  sender: 'agent',
  text: pdfTitle
    ? `**Now viewing "${pdfTitle}".**\n\nLitSift Agent is online. Ask me to extract findings, generate custom schemas, or ask specific questions about this paper!`
    : 'LitSift Agent is online. Ask me to extract paper data, generate custom schemas, or edit grid table cells!',
  timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
});

export const useAgentStore = create<AgentState>((set, get) => ({
  messages: [createDefaultGreeting()],
  activePdfId: '',
  isThinking: false,
  mode: 'human_in_loop',
  lastInteractionId: undefined,

  hydrateFromDb: async () => {
    try {
      const activeId = get().activePdfId;
      let stored: AgentMessage[] = [];
      if (activeId) {
        stored = await db.chatMessages.where('pdfId').equals(activeId).toArray();
      } else {
        stored = await db.chatMessages.toArray();
      }

      if (stored.length > 0) {
        set({ messages: stored });
      }
    } catch (err) {
      console.warn('Failed to hydrate chat messages from IndexedDB:', err);
    }
  },

  setActivePdfId: async (pdfId: string, pdfTitle?: string) => {
    set({ activePdfId: pdfId });
    try {
      let paperMessages: AgentMessage[] = [];
      if (pdfId) {
        paperMessages = await db.chatMessages.where('pdfId').equals(pdfId).sortBy('timestamp');
      } else {
        paperMessages = await db.chatMessages.where('pdfId').equals('master-grid').sortBy('timestamp');
      }

      if (paperMessages.length > 0) {
        set({ messages: paperMessages });
      } else {
        const greeting = createDefaultGreeting(pdfTitle);
        greeting.pdfId = pdfId || 'master-grid';
        set({ messages: [greeting] });
        await db.chatMessages.put(greeting);
      }
    } catch (err) {
      console.warn('Failed to switch active chat messages:', err);
    }
  },

  setExecutionMode: (mode) => set({ mode }),

  sendMessage: (text: string, activePdfTitle?: string) => {
    const currentPdfId = get().activePdfId || (activePdfTitle ? `pdf-active` : 'master-grid');
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
      })
    );

    db.chatMessages.put(userMsg).catch(console.warn);

    // Execute Live Gemini Interactions Engine with active paper context
    processAgentInteraction(text, activePdfTitle).then((result) => {
      const agentMsg: AgentMessage = {
        id: `msg-${Date.now() + 1}`,
        pdfId: currentPdfId,
        sender: 'agent',
        text: result.replyText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        toolCall: result.toolExecuted
          ? {
              name: result.toolExecuted.name,
              description: result.toolExecuted.description,
              status: 'completed',
            }
          : undefined,
      };

      set(
        produce((state: AgentState) => {
          state.messages.push(agentMsg);
          state.isThinking = false;
        })
      );

      db.chatMessages.put(agentMsg).catch(console.warn);
    });
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
        text: `Replaced open table with ${pendingCsv.parsedRows.length} rows from "${pendingCsv.filename}". (Previous table saved to Undo stack).`,
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

  clearMessages: () => {
    const currentPdfId = get().activePdfId || 'master-grid';
    const freshMsg: AgentMessage = {
      id: `msg-${Date.now()}`,
      pdfId: currentPdfId,
      sender: 'agent',
      text: 'Fresh session started. LitSift Agent is ready for new paper extractions and table edits!',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    set({
      messages: [freshMsg],
    });

    if (currentPdfId) {
      db.chatMessages.where('pdfId').equals(currentPdfId).delete()
        .then(() => db.chatMessages.put(freshMsg))
        .catch(console.warn);
    } else {
      db.chatMessages.clear().then(() => db.chatMessages.put(freshMsg)).catch(console.warn);
    }
  },
}));
