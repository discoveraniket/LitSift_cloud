export type SidebarViewMode = 'explorer' | 'workspace' | 'debug';

export interface EditorTab {
  id: string;
  type: 'pdf' | 'master_grid' | 'workspace_hub' | 'paper_discovery';
  title: string;
  pdfId?: string;
  closable?: boolean;
}

