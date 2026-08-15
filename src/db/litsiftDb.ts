import Dexie, { Table } from 'dexie';
import { SchemaColumn, GridRow } from '../types/grid';
import { AgentMessage } from '../types/agent';

export interface StoredPdf {
  id: string;
  name: string;
  blob: Blob;
  base64?: string;
  status: 'Ready' | 'Extracted' | 'Error';
  uploadedAt: number;
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
      chatMessages: 'id, timestamp',
      settings: 'key',
    });
  }
}

export const db = new LitSiftDatabase();
