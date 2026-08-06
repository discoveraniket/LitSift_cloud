import { create } from 'zustand';
import { produce } from 'immer';
import { AgentState, AgentMessage } from '../types/agent';
import { processAgentInteraction } from '../services/geminiService';

const initialMessages: AgentMessage[] = [
  {
    id: 'msg-1',
    sender: 'agent',
    text: 'LitSift Agent is online. Ask me to extract paper data, generate custom schemas, or edit grid table cells!',
    timestamp: '17:00',
  },
];

export const useAgentStore = create<AgentState>((set, get) => ({
  messages: initialMessages,
  isThinking: false,

  sendMessage: (text: string) => {
    const userMsg: AgentMessage = {
      id: `msg-${Date.now()}`,
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

    // Execute Live Gemini 3.6 Interactions Engine
    processAgentInteraction(text).then((result) => {
      const agentMsg: AgentMessage = {
        id: `msg-${Date.now() + 1}`,
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
    });
  },

  selectOption: (optionText: string) => {
    get().sendMessage(`Execute extraction for: ${optionText}`);
  },

  clearMessages: () => set({ messages: initialMessages }),
}));
