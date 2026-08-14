import { create } from 'zustand';

export interface PdfDocumentInfo {
  id: string;
  name: string;
  url: string; // Sample URL or Blob Object URL
  status: 'Ready' | 'Extracted' | 'Error';
  file?: File;
  base64?: string;
}

interface PdfState {
  pdfs: PdfDocumentInfo[];
  activePdfId: string;

  // Actions
  addPdfFile: (file: File) => PdfDocumentInfo;
  addPdfUrl: (id: string, name: string, url: string) => void;
  setActivePdf: (id: string) => void;
  setPdfBase64: (id: string, base64: string) => void;
  getPdf: (id: string) => PdfDocumentInfo | undefined;
  getActivePdf: () => PdfDocumentInfo | undefined;
}

const initialPdfs: PdfDocumentInfo[] = [
  {
    id: 'pdf-1',
    name: '38094623.pdf',
    url: '/sample-pdfs/38094623.pdf',
    status: 'Ready',
  },
];

export const usePdfStore = create<PdfState>((set, get) => ({
  pdfs: initialPdfs,
  activePdfId: 'pdf-1',

  addPdfFile: (file: File) => {
    const blobUrl = URL.createObjectURL(file);
    const newPdfId = `pdf-${Date.now()}`;
    const newPdf: PdfDocumentInfo = {
      id: newPdfId,
      name: file.name,
      url: blobUrl,
      status: 'Ready',
      file,
    };

    set((state) => ({
      pdfs: [...state.pdfs, newPdf],
      activePdfId: newPdfId,
    }));

    return newPdf;
  },

  addPdfUrl: (id, name, url) => {
    set((state) => {
      if (state.pdfs.some((p) => p.id === id)) return state;
      return {
        pdfs: [...state.pdfs, { id, name, url, status: 'Ready' }],
      };
    });
  },

  setActivePdf: (id) => set({ activePdfId: id }),

  setPdfBase64: (id, base64) => {
    set((state) => ({
      pdfs: state.pdfs.map((p) => (p.id === id ? { ...p, base64 } : p)),
    }));
  },

  getPdf: (id) => get().pdfs.find((p) => p.id === id),

  getActivePdf: () => get().pdfs.find((p) => p.id === get().activePdfId),
}));
