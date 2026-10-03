import { create } from 'zustand';

export type SettingsSection = 'providers' | 'execution' | 'grounding' | 'privacy';

interface SettingsUiState {
  activeSection: SettingsSection;
  setActiveSection: (section: SettingsSection) => void;
}

export const useSettingsUiStore = create<SettingsUiState>((set) => ({
  activeSection: 'providers',
  setActiveSection: (section) => set({ activeSection: section }),
}));
