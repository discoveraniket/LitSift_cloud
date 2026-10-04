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
  thinkingTokens?: number;
  promptTokens?: number;
  candidateTokens?: number;
  cachedTokens?: number;
  modelUsed?: string;
  toolsExecuted?: AgentToolExecution[];
  toolCall?: {
    name: string;
    description: string;
    status: 'running' | 'completed' | 'failed';
  };
  options?: string[]; // Interactive options/chips
  executionTime?: number; // Total duration of agent execution in seconds
}

export interface AgentCheckpoint {
  userPrompt: string;
  activePdfTitle: string;
  currentStep: number;
  maxSteps: number;
  openAiMessages: Array<{ role: 'user' | 'system' | 'assistant' | 'tool'; content?: string | null; tool_calls?: any[]; tool_call_id?: string; name?: string }>;
  accumulatedThoughts: string[];
  executedTools: AgentToolExecution[];
  finalReplyText: string;
  totalPromptTokens: number;
  totalCandidateTokens: number;
  timestamp: number;
}

export interface AgentExecutionResult {
  replyText: string;
  thought?: string;
  thinkingTokens?: number;
  promptTokens?: number;
  candidateTokens?: number;
  cachedTokens?: number;
  modelUsed?: string;
  toolsExecuted: AgentToolExecution[];
  executionTime?: number;
  options?: string[];
  checkpoint?: AgentCheckpoint;
}

export type AgentActivityStatus =
  | 'idle'
  | 'reading_context'
  | 'thinking'
  | 'formulating_action'
  | 'executing_tool'
  | 'generating_text';

export interface AgentState {
  messages: AgentMessage[];
  activePdfId: string;
  isThinking: boolean;
  activityStatus: AgentActivityStatus;
  activityDetail?: string;
  activityToolName?: string;
  streamingThought?: string;
  streamingText?: string;
  mode: 'human_in_loop' | 'autonomous_autopilot';
  abortController?: AbortController | null;
  lastInteractionId?: string;
  checkpoint?: AgentCheckpoint | null;

  // Actions
  hydrateFromDb: () => Promise<void>;
  setActivePdfId: (pdfId: string, pdfTitle?: string) => Promise<void>;
  sendMessage: (text: string, activePdfTitle?: string) => void;
  addAgentResponse: (text: string, options?: string[]) => Promise<void>;
  cancelInteraction: () => void;
  selectOption: (optionText: string) => void;
  clearMessages: () => void;
  deleteMessage: (id: string) => void;
  setExecutionMode: (mode: 'human_in_loop' | 'autonomous_autopilot') => void;
  setCheckpoint: (checkpoint: AgentCheckpoint | null) => void;
  resumeCheckpoint: () => Promise<void>;
  setActivityStatus: (status: AgentActivityStatus, detail?: string, toolName?: string) => void;
}

