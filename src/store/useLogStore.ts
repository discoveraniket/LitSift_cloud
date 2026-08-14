import { create } from 'zustand';

export interface LogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'success';
  message: string;
  details?: any;
}

interface LogState {
  logs: LogEntry[];
  activeStep: string | null;
  elapsedSeconds: number;
  isOpen: boolean;

  // Actions
  addLog: (level: 'info' | 'warn' | 'error' | 'success', message: string, details?: any) => void;
  setActiveStep: (step: string | null) => void;
  setElapsedSeconds: (seconds: number) => void;
  toggleOpen: () => void;
  setOpen: (open: boolean) => void;
  clearLogs: () => void;
}

export const useLogStore = create<LogState>((set) => ({
  logs: [],
  activeStep: null,
  elapsedSeconds: 0,
  isOpen: false,

  addLog: (level, message, details) => {
    const entry: LogEntry = {
      id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      level,
      message,
      details,
    };
    set((state) => ({ logs: [...state.logs, entry] }));
  },

  setActiveStep: (step) => set({ activeStep: step }),

  setElapsedSeconds: (seconds) => set({ elapsedSeconds: seconds }),

  toggleOpen: () => set((state) => ({ isOpen: !state.isOpen })),

  setOpen: (open) => set({ isOpen: open }),

  clearLogs: () => set({ logs: [] }),
}));
