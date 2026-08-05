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
  
  // Actions
  sendMessage: (text: string) => void;
  selectOption: (optionText: string) => void;
  clearMessages: () => void;
}
