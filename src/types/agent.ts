export interface AgentMessage {
  id: string;
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
  isThinking: boolean;
  mode: 'human_in_loop' | 'autonomous_autopilot';
  lastInteractionId?: string;
  
  // Actions
  sendMessage: (text: string, activePdfTitle?: string) => void;
  selectOption: (optionText: string) => void;
  clearMessages: () => void;
  setExecutionMode: (mode: 'human_in_loop' | 'autonomous_autopilot') => void;
}
