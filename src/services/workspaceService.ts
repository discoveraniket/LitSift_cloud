import { db, StoredPdf } from '../db/litsiftDb';
import { SchemaColumn, GridRow } from '../types/grid';
import { AgentMessage } from '../types/agent';
import { usePdfStore } from '../store/usePdfStore';
import { useGridStore } from '../store/useGridStore';
import { useAgentStore } from '../store/useAgentStore';
import { useLogStore, LogEntry } from '../store/useLogStore';
import {
  OpenAccessStatus,
  DocumentSourceType,
  PaperAuthor,
  PaperSection,
  PaperTable,
  PaperFigure,
} from '../types/paper';

export interface WorkspacePdfItem {
  id: string;
  name: string;
  status: 'Ready' | 'Extracted' | 'Error';
  uploadedAt: number;
  base64?: string;
  sizeBytes?: number;

  // Rich Paper Metadata & Structured Content
  title?: string;
  doi?: string;
  pmcid?: string;
  authors?: PaperAuthor[];
  journal?: string;
  year?: number;
  citationCount?: number;
  oaStatus?: OpenAccessStatus;
  sourceType?: DocumentSourceType;
  abstractText?: string;
  sections?: PaperSection[];
  tables?: PaperTable[];
  figures?: PaperFigure[];
  landingPageUrl?: string;
  pdfDownloadUrl?: string;
  errorMessage?: string;
}

export interface WorkspaceMetadata {
  workspaceName: string;
  exportedAt: string;
  version: string;
  paperCount: number;
  rowCount: number;
  columnCount: number;
  chatMessageCount: number;
  activePdfId?: string;
  activePdfTitle?: string;
  activeView?: 'pdf' | 'master_grid';
  agentMode?: 'human_in_loop' | 'autonomous_autopilot';
}

export interface WorkspaceBundle {
  format: 'litsift_workspace';
  version: string;
  metadata: WorkspaceMetadata;
  pdfs: WorkspacePdfItem[];
  grid: {
    columns: SchemaColumn[];
    rows: GridRow[];
  };
  chatMessages: AgentMessage[];
  settings?: Array<{ key: string; value: any }>;
  logs?: LogEntry[];
}

export interface WorkspaceBundleSummary {
  workspaceName: string;
  exportedAt: string;
  version: string;
  paperCount: number;
  rowCount: number;
  columnCount: number;
  chatMessageCount: number;
  totalPdfSizeBytes: number;
  papers: Array<{ id: string; name: string; status: string }>;
  bundle: WorkspaceBundle;
}

/**
 * Converts a binary Blob/File to a Base64 data URL string
 */
export const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Failed to convert Blob to base64 string'));
      }
    };
    reader.onerror = () => reject(reader.error || new Error('FileReader error'));
    reader.readAsDataURL(blob);
  });
};

/**
 * Converts a Base64 data URL string back to a binary Blob
 */
export const base64ToBlob = (base64DataUrl: string): Blob => {
  const parts = base64DataUrl.split(';base64,');
  const contentType = parts.length > 1 ? parts[0].replace(/^data:/, '') : 'application/pdf';
  const base64Data = parts.length > 1 ? parts[1] : parts[0];

  const binaryString = atob(base64Data);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return new Blob([bytes], { type: contentType || 'application/pdf' });
};

/**
 * Triggers a native browser file download for any individual PDF
 */
export const downloadPdfFile = (pdf: { name: string; file?: Blob | File; base64?: string; url?: string }): void => {
  let blobToDownload: Blob | null = null;

  if (pdf.file instanceof Blob) {
    blobToDownload = pdf.file;
  } else if (pdf.base64) {
    blobToDownload = base64ToBlob(pdf.base64);
  }

  const filename = pdf.name.toLowerCase().endsWith('.pdf') ? pdf.name : `${pdf.name}.pdf`;

  if (blobToDownload) {
    const objectUrl = URL.createObjectURL(blobToDownload);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  } else if (pdf.url && !pdf.url.startsWith('blob:')) {
    const link = document.createElement('a');
    link.href = pdf.url;
    link.download = filename;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
};

/**
 * Packages the entire active application state into a .litsift bundle and initiates browser download
 */
export const exportWorkspaceBundle = async (
  customName?: string
): Promise<{ bundle: WorkspaceBundle; filename: string; blob: Blob }> => {
  const defaultTimestamp = new Date().toISOString().slice(0, 10);
  const workspaceName = customName?.trim() || `LitSift_Workspace_${defaultTimestamp}`;

  // 1. Fetch PDFs and encode to Base64
  let storedPdfs: StoredPdf[] = [];
  try {
    storedPdfs = await db.pdfs.toArray();
  } catch (err) {
    console.warn('Could not read PDFs from IndexedDB, falling back to memory store:', err);
  }

  const memoryPdfs = usePdfStore.getState().pdfs;
  const pdfItems: WorkspacePdfItem[] = [];

  // Combine DB & memory PDFs
  const combinedPdfsMap = new Map<string, StoredPdf>();

  storedPdfs.forEach((p) => {
    combinedPdfsMap.set(p.id, { ...p });
  });

  memoryPdfs.forEach((p) => {
    const existing = combinedPdfsMap.get(p.id);
    combinedPdfsMap.set(p.id, {
      id: p.id,
      name: p.name,
      title: p.title || existing?.title,
      blob: (p.file instanceof Blob && p.file.size > 0) ? p.file : existing?.blob,
      base64: p.base64 || existing?.base64,
      status: p.status || existing?.status || 'Ready',
      uploadedAt: p.uploadedAt || existing?.uploadedAt || Date.now(),
      doi: p.doi || existing?.doi,
      pmcid: p.pmcid || existing?.pmcid,
      authors: p.authors || existing?.authors,
      journal: p.journal || existing?.journal,
      year: p.year || existing?.year,
      citationCount: p.citationCount || existing?.citationCount,
      oaStatus: p.oaStatus || existing?.oaStatus,
      sourceType: p.sourceType || existing?.sourceType,
      abstractText: p.abstractText || existing?.abstractText,
      sections: p.sections || existing?.sections,
      tables: p.tables || existing?.tables,
      figures: p.figures || existing?.figures,
      landingPageUrl: p.landingPageUrl || existing?.landingPageUrl,
      pdfDownloadUrl: p.pdfDownloadUrl || existing?.pdfDownloadUrl,
      errorMessage: p.errorMessage || existing?.errorMessage,
    });
  });

  for (const item of combinedPdfsMap.values()) {
    let base64 = item.base64 || '';
    if (!base64 && item.blob && item.blob.size > 0) {
      try {
        base64 = await blobToBase64(item.blob);
      } catch (e) {
        console.warn(`Could not convert PDF ${item.name} to base64:`, e);
      }
    }

    pdfItems.push({
      id: item.id,
      name: item.name,
      title: item.title || item.name,
      status: item.status || 'Ready',
      uploadedAt: item.uploadedAt || Date.now(),
      base64: base64 || undefined,
      sizeBytes: item.blob ? item.blob.size : (base64 ? Math.round((base64.length * 3) / 4) : 0),
      doi: item.doi,
      pmcid: item.pmcid,
      authors: item.authors,
      journal: item.journal,
      year: item.year,
      citationCount: item.citationCount,
      oaStatus: item.oaStatus,
      sourceType: item.sourceType,
      abstractText: item.abstractText,
      sections: item.sections,
      tables: item.tables,
      figures: item.figures,
      landingPageUrl: item.landingPageUrl,
      pdfDownloadUrl: item.pdfDownloadUrl,
      errorMessage: item.errorMessage,
    });
  }

  // 2. Fetch Data Grid
  const gridStore = useGridStore.getState();
  let columns = gridStore.columns;
  let rows = gridStore.rows;

  try {
    const storedGrid = await db.gridTable.get('current');
    if (storedGrid && storedGrid.columns && storedGrid.columns.length > 0) {
      columns = storedGrid.columns;
      rows = storedGrid.rows;
    }
  } catch (err) {
    console.warn('Could not read gridTable from IndexedDB:', err);
  }

  // 3. Fetch Chat Messages
  let chatMessages: AgentMessage[] = [];
  try {
    chatMessages = await db.chatMessages.toArray();
  } catch (err) {
    console.warn('Could not read chat messages from IndexedDB:', err);
  }

  if (chatMessages.length === 0) {
    chatMessages = useAgentStore.getState().messages;
  }

  // 4. Fetch Settings & Logs
  let settings: Array<{ key: string; value: any }> = [];
  try {
    settings = await db.settings.toArray();
  } catch (err) {
    console.warn('Could not read settings from IndexedDB:', err);
  }

  const logs = useLogStore.getState().logs;
  const activePdf = usePdfStore.getState().getActivePdf();

  const metadata: WorkspaceMetadata = {
    workspaceName,
    exportedAt: new Date().toISOString(),
    version: '1.0',
    paperCount: pdfItems.length,
    rowCount: rows.filter((r) => !r.isDraftRow).length,
    columnCount: columns.length,
    chatMessageCount: chatMessages.length,
    activePdfId: activePdf?.id,
    activePdfTitle: activePdf?.name,
    agentMode: useAgentStore.getState().mode,
  };

  const bundle: WorkspaceBundle = {
    format: 'litsift_workspace',
    version: '1.0',
    metadata,
    pdfs: pdfItems,
    grid: {
      columns,
      rows,
    },
    chatMessages,
    settings,
    logs,
  };

  const jsonString = JSON.stringify(bundle, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8;' });
  const sanitizedFilename = workspaceName.replace(/[^a-zA-Z0-9_-]/g, '_');
  const filename = `${sanitizedFilename}.litsift`;

  // Trigger download
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);

  return { bundle, filename, blob };
};

const readFileText = (file: File | Blob): Promise<string> => {
  if (typeof (file as any).text === 'function') {
    return (file as any).text();
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error || new Error('Failed to read file text'));
    reader.readAsText(file);
  });
};

/**
 * Inspects a .litsift or .json file and extracts a summary for pre-import validation
 */
export const inspectWorkspaceFile = async (file: File): Promise<WorkspaceBundleSummary> => {
  const text = await readFileText(file);
  let parsed: any;

  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new Error('Invalid file: File content is not valid JSON format.');
  }

  if (parsed.format !== 'litsift_workspace' && !parsed.metadata && !parsed.grid) {
    throw new Error('Unrecognized format: This file does not appear to be a valid LitSift workspace bundle.');
  }

  const metadata: WorkspaceMetadata = parsed.metadata || {
    workspaceName: file.name.replace(/\.(litsift|json)$/i, ''),
    exportedAt: new Date().toISOString(),
    version: parsed.version || '1.0',
    paperCount: Array.isArray(parsed.pdfs) ? parsed.pdfs.length : 0,
    rowCount: parsed.grid?.rows ? parsed.grid.rows.length : 0,
    columnCount: parsed.grid?.columns ? parsed.grid.columns.length : 0,
    chatMessageCount: Array.isArray(parsed.chatMessages) ? parsed.chatMessages.length : 0,
  };

  const pdfs: WorkspacePdfItem[] = Array.isArray(parsed.pdfs) ? parsed.pdfs : [];
  let totalPdfSizeBytes = 0;
  const paperSummaries = pdfs.map((p) => {
    const estimatedSize = p.sizeBytes || (p.base64 ? Math.round((p.base64.length * 3) / 4) : 0);
    totalPdfSizeBytes += estimatedSize;
    return {
      id: p.id,
      name: p.name,
      status: p.status || 'Ready',
    };
  });

  return {
    workspaceName: metadata.workspaceName || file.name.replace(/\.(litsift|json)$/i, ''),
    exportedAt: metadata.exportedAt || new Date().toISOString(),
    version: metadata.version || '1.0',
    paperCount: pdfs.length,
    rowCount: parsed.grid?.rows ? parsed.grid.rows.filter((r: any) => !r.isDraftRow).length : 0,
    columnCount: parsed.grid?.columns ? parsed.grid.columns.length : 0,
    chatMessageCount: Array.isArray(parsed.chatMessages) ? parsed.chatMessages.length : 0,
    totalPdfSizeBytes,
    papers: paperSummaries,
    bundle: parsed as WorkspaceBundle,
  };
};

/**
 * Restores a validated WorkspaceBundle into IndexedDB and hydrates all application stores
 */
export const restoreWorkspaceBundle = async (
  bundle: WorkspaceBundle,
  onProgress?: (status: string, progressPercent: number) => void
): Promise<void> => {
  onProgress?.('Clearing active workspace data...', 10);

  // 1. Reset selection & clear stores
  useGridStore.getState().resetActiveSelection();
  await usePdfStore.getState().clearAllPdfs();
  useGridStore.getState().clearTable();
  useAgentStore.getState().clearMessages();
  useLogStore.getState().clearLogs();

  // 2. Clear IndexedDB tables
  try {
    await db.pdfs.clear();
    await db.gridTable.clear();
    await db.chatMessages.clear();
    await db.settings.clear();
  } catch (err) {
    console.warn('Warning during IndexedDB table clearance:', err);
  }

  onProgress?.('Reconstructing binary PDF documents...', 30);

  // 3. Decode PDFs to Blobs and write to IndexedDB & memory
  const restoredPdfs = bundle.pdfs || [];
  const inMemoryPdfs: any[] = [];

  for (let i = 0; i < restoredPdfs.length; i++) {
    const p = restoredPdfs[i];
    let pdfBlob: Blob | undefined = undefined;
    let blobUrl = '';

    if (p.base64 && p.base64.trim().length > 0) {
      try {
        const decoded = base64ToBlob(p.base64);
        if (decoded && decoded.size > 0) {
          pdfBlob = decoded;
          blobUrl = URL.createObjectURL(decoded);
        }
      } catch (err) {
        console.warn(`Failed to decode base64 for paper ${p.name}:`, err);
      }
    }

    const storedPdf: StoredPdf = {
      id: p.id,
      name: p.name || p.title || 'Untitled Paper',
      title: p.title || p.name,
      blob: pdfBlob,
      base64: p.base64 || '',
      status: p.status || 'Ready',
      uploadedAt: p.uploadedAt || Date.now(),
      doi: p.doi,
      pmcid: p.pmcid,
      authors: p.authors,
      journal: p.journal,
      year: p.year,
      citationCount: p.citationCount,
      oaStatus: p.oaStatus || 'unknown',
      sourceType: p.sourceType || (pdfBlob ? 'pdf_upload' : (p.sections && p.sections.length > 0 ? 'doi_structured' : 'doi_abstract_only')),
      abstractText: p.abstractText,
      sections: p.sections,
      tables: p.tables,
      figures: p.figures,
      landingPageUrl: p.landingPageUrl,
      pdfDownloadUrl: p.pdfDownloadUrl,
      errorMessage: p.errorMessage,
    };

    try {
      await db.pdfs.put(storedPdf);
    } catch (err) {
      console.warn(`Error storing PDF ${p.name} to IndexedDB:`, err);
    }

    inMemoryPdfs.push({
      ...storedPdf,
      file: pdfBlob,
      url: blobUrl,
    });

    const pct = 30 + Math.round(((i + 1) / (restoredPdfs.length || 1)) * 30);
    onProgress?.(`Restored paper ${i + 1} of ${restoredPdfs.length}...`, pct);
  }

  onProgress?.('Restoring data grid & citations...', 70);

  // 4. Save gridTable
  const gridColumns = bundle.grid?.columns || [];
  const gridRows = bundle.grid?.rows || [];
  try {
    await db.gridTable.put({
      id: 'current',
      columns: gridColumns,
      rows: gridRows,
      updatedAt: Date.now(),
    });
  } catch (err) {
    console.warn('Error storing grid table to IndexedDB:', err);
  }

  onProgress?.('Restoring AI chat discussions & traces...', 85);

  // 5. Save chat messages
  const chatMessages = bundle.chatMessages || [];
  for (const msg of chatMessages) {
    try {
      await db.chatMessages.put(msg);
    } catch (err) {
      console.warn('Error storing chat message to IndexedDB:', err);
    }
  }

  // 6. Save settings
  const targetActivePdfId = bundle.metadata?.activePdfId || (restoredPdfs.length > 0 ? restoredPdfs[0].id : '');
  try {
    await db.settings.put({ key: 'activePdfId', value: targetActivePdfId });
    if (bundle.settings) {
      for (const s of bundle.settings) {
        await db.settings.put(s);
      }
    }
  } catch (err) {
    console.warn('Error storing settings to IndexedDB:', err);
  }

  onProgress?.('Hydrating application state...', 95);

  // 7. Directly set Zustand store states for instantaneous UI reactivity
  usePdfStore.setState({
    pdfs: inMemoryPdfs,
    activePdfId: targetActivePdfId,
    isHydrated: true,
  });

  useGridStore.setState({
    columns: gridColumns,
    rows: gridRows,
  });

  useAgentStore.setState({
    messages: chatMessages.length > 0 ? chatMessages : useAgentStore.getState().messages,
    activePdfId: targetActivePdfId,
  });

  // Attempt DB hydration sync
  try {
    await usePdfStore.getState().hydrateFromDb();
    await useGridStore.getState().hydrateFromDb();
  } catch (_) {}

  if (targetActivePdfId) {
    const activeDoc = usePdfStore.getState().getPdf(targetActivePdfId);
    await useAgentStore.getState().setActivePdfId(targetActivePdfId, activeDoc?.name);
  } else {
    await useAgentStore.getState().setActivePdfId('', 'Master Workspace');
  }

  if (bundle.metadata?.agentMode) {
    useAgentStore.getState().setExecutionMode(bundle.metadata.agentMode);
  }

  if (bundle.logs && bundle.logs.length > 0) {
    useLogStore.setState({ logs: bundle.logs });
  }

  useLogStore.getState().addLog(
    'success',
    `Workspace "${bundle.metadata?.workspaceName || 'Restored'}" successfully loaded (${restoredPdfs.length} PDFs, ${gridRows.length} rows, ${chatMessages.length} messages).`
  );

  onProgress?.('Workspace ready!', 100);
};
