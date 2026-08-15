export interface AgentMessage {
  id: string;
  pdfId?: string; // Associated PDF ID or 'master-grid'
  sender: 'user' | 'agent';
  text: string;
  timestamp: string;
  toolCall?: {
    name: string;
    description: string;
    status: 'running' | 'completed' | 'failed';
  };
  options?: string[]; // Clarification options
}

export interface AgentState {
  messages: AgentMessage[];
  activePdfId: string;
  isThinking: boolean;
  mode: 'human_in_loop' | 'autonomous_autopilot';
  lastInteractionId?: string;
  
  // Actions
  hydrateFromDb: () => Promise<void>;
  setActivePdfId: (pdfId: string, pdfTitle?: string) => Promise<void>;
  sendMessage: (text: string, activePdfTitle?: string) => void;
  selectOption: (optionText: string) => void;
  clearMessages: () => void;
  setExecutionMode: (mode: 'human_in_loop' | 'autonomous_autopilot') => void;
}
