export interface EditorTab {
  id: string;
  type: 'pdf' | 'master_grid' | 'workspace_hub';
  title: string;
  pdfId?: string;
  closable?: boolean;
}
