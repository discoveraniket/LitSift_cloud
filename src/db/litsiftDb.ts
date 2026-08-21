import Dexie, { Table } from 'dexie';
import { SchemaColumn, GridRow } from '../types/grid';
import { AgentMessage } from '../types/agent';
import { OpenAccessStatus, DocumentSourceType, PaperAuthor, PaperSection, PaperTable, PaperFigure } from '../types/paper';

export interface StoredPdf {
  id: string;
  name: string;
  blob?: Blob;
  base64?: string;
  status: 'Ready' | 'Extracted' | 'Error';
  uploadedAt: number;
  
  // Rich Paper Metadata
  doi?: string;
  pmcid?: string;
  title?: string;
  authors?: PaperAuthor[];
  journal?: string;
  year?: number;
  citationCount?: number;
  oaStatus?: OpenAccessStatus;
  sourceType?: DocumentSourceType;
  
  // Abstract & Structured Content
  abstractText?: string;
  sections?: PaperSection[];
  tables?: PaperTable[];
  figures?: PaperFigure[];
  landingPageUrl?: string;
  pdfDownloadUrl?: string;
  errorMessage?: string;
}

export interface StoredGridTable {
  id: string; // 'current'
  columns: SchemaColumn[];
  rows: GridRow[];
  updatedAt: number;
}

export interface StoredSetting {
  key: string;
  value: any;
}

export class LitSiftDatabase extends Dexie {
  pdfs!: Table<StoredPdf, string>;
  gridTable!: Table<StoredGridTable, string>;
  chatMessages!: Table<AgentMessage, string>;
  settings!: Table<StoredSetting, string>;

  constructor() {
    super('LitSiftCloudDB');
    this.version(1).stores({
      pdfs: 'id, name, status, uploadedAt',
      gridTable: 'id, updatedAt',
      chatMessages: 'id, pdfId, timestamp',
      settings: 'key',
    });
  }
}

export const db = new LitSiftDatabase();

