import { create } from 'zustand';
import { db, StoredPdf } from '../db/litsiftDb';

export interface PdfDocumentInfo {
  id: string;
  name: string;
  url: string; // Blob Object URL
  status: 'Ready' | 'Extracted' | 'Error';
  file?: File | Blob;
  base64?: string;
}

interface PdfState {
  pdfs: PdfDocumentInfo[];
  activePdfId: string;
  isHydrated: boolean;

  // Actions
  hydrateFromDb: () => Promise<void>;
  addPdfFile: (file: File) => Promise<PdfDocumentInfo>;
  addPdfUrl: (id: string, name: string, url: string) => Promise<void>;
  setActivePdf: (id: string) => void;
  setPdfBase64: (id: string, base64: string) => Promise<void>;
  getPdf: (id: string) => PdfDocumentInfo | undefined;
  getActivePdf: () => PdfDocumentInfo | undefined;
}

export const usePdfStore = create<PdfState>((set, get) => ({
  pdfs: [],
  activePdfId: '',
  isHydrated: false,

  hydrateFromDb: async () => {
    try {
      const stored = await db.pdfs.toArray();
      if (stored.length > 0) {
        const loadedPdfs: PdfDocumentInfo[] = stored.map((item) => {
          const blobUrl = URL.createObjectURL(item.blob);
          return {
            id: item.id,
            name: item.name,
            url: blobUrl,
            status: item.status,
            file: item.blob,
            base64: item.base64,
          };
        });

        const activeSetting = await db.settings.get('activePdfId');
        const activeId = activeSetting?.value && loadedPdfs.some((p) => p.id === activeSetting.value)
          ? activeSetting.value
          : loadedPdfs[0].id;

        set({
          pdfs: loadedPdfs,
          activePdfId: activeId,
          isHydrated: true,
        });
        return;
      }
    } catch (err) {
      console.warn('Failed to hydrate PDFs from IndexedDB:', err);
    }
    set({ isHydrated: true });
  },

  addPdfFile: async (file: File) => {
    const newPdfId = `pdf-${Date.now()}`;
    const blobUrl = URL.createObjectURL(file);

    const newPdf: PdfDocumentInfo = {
      id: newPdfId,
      name: file.name,
      url: blobUrl,
      status: 'Ready',
      file,
    };

    // Save to IndexedDB
    try {
      const storedPdf: StoredPdf = {
        id: newPdfId,
        name: file.name,
        blob: file,
        status: 'Ready',
        uploadedAt: Date.now(),
      };
      await db.pdfs.put(storedPdf);
      await db.settings.put({ key: 'activePdfId', value: newPdfId });
    } catch (err) {
      console.error('Error saving PDF to IndexedDB:', err);
    }

    set((state) => ({
      pdfs: [...state.pdfs.filter((p) => p.id !== 'pdf-1' || p.file), newPdf],
      activePdfId: newPdfId,
    }));

    return newPdf;
  },

  addPdfUrl: async (id, name, url) => {
    set((state) => {
      if (state.pdfs.some((p) => p.id === id)) return state;
      return {
        pdfs: [...state.pdfs, { id, name, url, status: 'Ready' }],
      };
    });
  },

  setActivePdf: (id) => {
    set({ activePdfId: id });
    db.settings.put({ key: 'activePdfId', value: id }).catch(console.warn);
  },

  setPdfBase64: async (id, base64) => {
    set((state) => ({
      pdfs: state.pdfs.map((p) => (p.id === id ? { ...p, base64 } : p)),
    }));

    try {
      const record = await db.pdfs.get(id);
      if (record) {
        record.base64 = base64;
        await db.pdfs.put(record);
      }
    } catch (err) {
      console.warn('Error saving PDF base64 cache to IndexedDB:', err);
    }
  },

  getPdf: (id) => get().pdfs.find((p) => p.id === id),

  getActivePdf: () => get().pdfs.find((p) => p.id === get().activePdfId),
}));
