export type SidebarViewMode = 'explorer' | 'workspace' | 'debug' | 'settings';

export interface EditorTab {
  id: string;
  type: 'pdf' | 'master_grid' | 'workspace_hub' | 'paper_discovery' | 'settings';
  title: string;
  pdfId?: string;
  closable?: boolean;
}

