export interface AgentToolExecution {
  id: string;
  name: string;
  args: Record<string, any>;
  summary: string;
  status: 'running' | 'completed' | 'failed';
  result?: any;
  error?: string;
}

export interface AgentMessage {
  id: string;
  pdfId?: string; // Associated PDF ID or 'master-grid'
  sender: 'user' | 'agent';
  text: string;
  timestamp: string;
  thought?: string;
  toolsExecuted?: AgentToolExecution[];
  toolCall?: {
    name: string;
    description: string;
    status: 'running' | 'completed' | 'failed';
  };
  options?: string[]; // Interactive options/chips
  executionTime?: number; // Total duration of agent execution in seconds
}

export interface AgentExecutionResult {
  replyText: string;
  thought?: string;
  toolsExecuted: AgentToolExecution[];
  executionTime?: number;
}

export interface AgentState {
  messages: AgentMessage[];
  activePdfId: string;
  isThinking: boolean;
  mode: 'human_in_loop' | 'autonomous_autopilot';
  abortController?: AbortController | null;
  lastInteractionId?: string;

  // Actions
  hydrateFromDb: () => Promise<void>;
  setActivePdfId: (pdfId: string, pdfTitle?: string) => Promise<void>;
  sendMessage: (text: string, activePdfTitle?: string) => void;
  cancelInteraction: () => void;
  selectOption: (optionText: string) => void;
  clearMessages: () => void;
  deleteMessage: (id: string) => void;
  setExecutionMode: (mode: 'human_in_loop' | 'autonomous_autopilot') => void;
}
