import { create } from 'zustand';
import { produce } from 'immer';
import { AgentState, AgentMessage } from '../types/agent';
import { useGridStore } from './useGridStore';

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

    // Simulate Agent Tool Execution Engine based on prompt keywords
    setTimeout(() => {
      const lower = text.toLowerCase();
      const gridStore = useGridStore.getState();

      let agentText = '';
      let toolCall = undefined;
      let options = undefined;

      if (lower.includes('extract') || lower.includes('methodology') || lower.includes('data')) {
        toolCall = {
          name: 'extract_schema_data',
          description: 'Extracted key findings and methodology from 38094623.pdf',
          status: 'completed' as const,
        };
        agentText = 'Extracted new research findings from 38094623.pdf into the data grid. Please review the highlighted pending row.';
        gridStore.addRow('pdf-1', '38094623.pdf');
      } else if (lower.includes('split')) {
        toolCall = {
          name: 'propose_split_cell',
          description: 'Split row 1 cell content into distinct entry rows',
          status: 'completed' as const,
        };
        agentText = 'Proposed splitting row 1 methodology into two distinct sub-rows. Edits are highlighted in gold for your confirmation.';
        gridStore.addRow('pdf-1', '38094623.pdf');
      } else if (lower.includes('schema') || lower.includes('column')) {
        toolCall = {
          name: 'generate_schema',
          description: 'Generated new schema column based on research prompt',
          status: 'completed' as const,
        };
        agentText = 'Generated new schema column "Clinical Implications". Added to grid layout.';
        gridStore.addColumn('Clinical Implications');
      } else {
        agentText = 'Which section of 38094623.pdf would you like me to process?';
        options = ['Full Paper Methodology', 'Key Experimental Results', 'Author Limitations'];
      }

      const agentMsg: AgentMessage = {
        id: `msg-${Date.now() + 1}`,
        sender: 'agent',
        text: agentText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        toolCall,
        options,
      };

      set(
        produce((state: AgentState) => {
          state.messages.push(agentMsg);
          state.isThinking = false;
        })
      );
    }, 900);
  },

  selectOption: (optionText: string) => {
    get().sendMessage(`Execute extraction for: ${optionText}`);
  },

  clearMessages: () => set({ messages: initialMessages }),
}));
