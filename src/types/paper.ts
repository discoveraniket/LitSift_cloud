export type OpenAccessStatus = 'gold' | 'green' | 'hybrid' | 'bronze' | 'closed' | 'unknown';

export type DocumentSourceType = 'pdf_upload' | 'doi_full_pdf' | 'doi_abstract_only' | 'doi_structured';

export interface PaperAuthor {
  name: string;
  institution?: string;
  orcid?: string;
}

export interface PaperSection {
  id: string;
  title: string;
  content: string;
  subsections?: Array<{ id: string; title: string; content: string }>;
}

export interface PaperTable {
  id: string;
  label?: string;
  caption: string;
  headers: string[];
  rows: string[][];
}

export interface PaperFigure {
  id: string;
  label?: string;
  caption: string;
  url?: string;
  thumbnailUrl?: string;
}

export interface PaperDocumentInfo {
  id: string;
  name: string;
  doi?: string;
  pmcid?: string;
  title?: string;
  authors?: PaperAuthor[];
  journal?: string;
  year?: number;
  citationCount?: number;
  oaStatus: OpenAccessStatus;
  sourceType: DocumentSourceType;
  
  // Abstract & Structured Text
  abstractText?: string;
  sections?: PaperSection[];
  tables?: PaperTable[];
  figures?: PaperFigure[];
  
  // PDF Data
  url?: string; // Blob Object URL for PDF reader
  file?: File | Blob;
  base64?: string;
  pdfDownloadUrl?: string;
  landingPageUrl?: string;
  
  status: 'Ready' | 'Extracted' | 'Error';
  uploadedAt: number;
  errorMessage?: string;
}
