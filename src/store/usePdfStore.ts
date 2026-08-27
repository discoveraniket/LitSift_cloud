import { create } from 'zustand';
import { db, StoredPdf } from '../db/litsiftDb';
import { PaperDocumentInfo, GroundingMode } from '../types/paper';

export type { PaperDocumentInfo as PdfDocumentInfo, GroundingMode };

interface PdfState {
  pdfs: PaperDocumentInfo[];
  activePdfId: string;
  isHydrated: boolean;

  // Actions
  hydrateFromDb: () => Promise<void>;
  addPdfFile: (file: File) => Promise<PaperDocumentInfo>;
  addPaperDocument: (paper: PaperDocumentInfo) => Promise<PaperDocumentInfo>;
  addPdf: (paper: PaperDocumentInfo) => Promise<PaperDocumentInfo>;
  updatePaperDocument: (id: string, updates: Partial<PaperDocumentInfo>) => Promise<void>;
  setPaperGroundingMode: (id: string, mode: GroundingMode) => Promise<void>;
  addPdfUrl: (id: string, name: string, url: string) => Promise<void>;
  removePdf: (id: string) => Promise<void>;
  clearAllPdfs: () => Promise<void>;
  setActivePdf: (id: string) => void;
  setPdfBase64: (id: string, base64: string) => Promise<void>;
  getPdf: (id: string) => PaperDocumentInfo | undefined;
  getActivePdf: () => PaperDocumentInfo | undefined;
}

export const usePdfStore = create<PdfState>((set, get) => ({
  pdfs: [],
  activePdfId: '',
  isHydrated: false,

  hydrateFromDb: async () => {
    try {
      const stored = await db.pdfs.toArray();
      if (stored.length > 0) {
        const loadedPdfs: PaperDocumentInfo[] = stored.map((item) => {
          let blobUrl = '';
          if (item.blob && item.blob.size > 0) {
            try {
              blobUrl = URL.createObjectURL(item.blob);
            } catch (e) {
              console.warn('Failed to create blob URL for', item.name, e);
            }
          }
          return {
            id: item.id,
            name: item.name || item.title || 'Untitled Paper',
            url: blobUrl,
            status: item.status || 'Ready',
            file: item.blob,
            base64: item.base64,
            doi: item.doi,
            pmcid: item.pmcid,
            title: item.title,
            authors: item.authors,
            journal: item.journal,
            year: item.year,
            citationCount: item.citationCount,
            oaStatus: item.oaStatus || 'unknown',
            sourceType: item.sourceType || (item.blob ? 'pdf_upload' : 'doi_abstract_only'),
            groundingMode: item.groundingMode || 'auto',
            abstractText: item.abstractText,
            sections: item.sections,
            tables: item.tables,
            figures: item.figures,
            landingPageUrl: item.landingPageUrl,
            pdfDownloadUrl: item.pdfDownloadUrl,
            uploadedAt: item.uploadedAt || Date.now(),
            errorMessage: item.errorMessage,
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

    const newPdf: PaperDocumentInfo = {
      id: newPdfId,
      name: file.name,
      title: file.name.replace(/\.pdf$/i, ''),
      url: blobUrl,
      status: 'Ready',
      file,
      oaStatus: 'unknown',
      sourceType: 'pdf_upload',
      groundingMode: 'auto',
      uploadedAt: Date.now(),
    };

    // Save to IndexedDB
    try {
      const storedPdf: StoredPdf = {
        id: newPdfId,
        name: file.name,
        title: newPdf.title,
        blob: file,
        status: 'Ready',
        oaStatus: 'unknown',
        sourceType: 'pdf_upload',
        groundingMode: 'auto',
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

  addPaperDocument: async (paper: PaperDocumentInfo) => {
    const fullPaper: PaperDocumentInfo = {
      ...paper,
      groundingMode: paper.groundingMode || 'auto',
    };

    // Save to IndexedDB
    try {
      const storedPdf: StoredPdf = {
        id: fullPaper.id,
        name: fullPaper.name,
        title: fullPaper.title,
        blob: fullPaper.file,
        base64: fullPaper.base64,
        status: fullPaper.status,
        doi: fullPaper.doi,
        pmcid: fullPaper.pmcid,
        authors: fullPaper.authors,
        journal: fullPaper.journal,
        year: fullPaper.year,
        citationCount: fullPaper.citationCount,
        oaStatus: fullPaper.oaStatus,
        sourceType: fullPaper.sourceType,
        groundingMode: fullPaper.groundingMode || 'auto',
        abstractText: fullPaper.abstractText,
        sections: fullPaper.sections,
        tables: fullPaper.tables,
        figures: fullPaper.figures,
        landingPageUrl: fullPaper.landingPageUrl,
        pdfDownloadUrl: fullPaper.pdfDownloadUrl,
        errorMessage: fullPaper.errorMessage,
        uploadedAt: fullPaper.uploadedAt || Date.now(),
      };
      await db.pdfs.put(storedPdf);
      await db.settings.put({ key: 'activePdfId', value: fullPaper.id });
    } catch (err) {
      console.error('Error saving Paper Document to IndexedDB:', err);
    }

    set((state) => ({
      pdfs: [...state.pdfs.filter((p) => p.id !== fullPaper.id), fullPaper],
      activePdfId: fullPaper.id,
    }));

    return fullPaper;
  },

  addPdf: async (paper: PaperDocumentInfo) => {
    return get().addPaperDocument(paper);
  },

  updatePaperDocument: async (id: string, updates: Partial<PaperDocumentInfo>) => {
    set((state) => ({
      pdfs: state.pdfs.map((p) => (p.id === id ? { ...p, ...updates } : p)),
    }));

    try {
      const existing = await db.pdfs.get(id);
      if (existing) {
        const updated: StoredPdf = {
          ...existing,
          ...updates,
          blob: updates.file !== undefined ? updates.file : existing.blob,
        };
        await db.pdfs.put(updated);
      }
    } catch (err) {
      console.warn('Error updating paper document in IndexedDB:', err);
    }
  },

  setPaperGroundingMode: async (id: string, mode: GroundingMode) => {
    await get().updatePaperDocument(id, { groundingMode: mode });
  },

  addPdfUrl: async (id, name, url) => {
    set((state) => {
      if (state.pdfs.some((p) => p.id === id)) return state;
      return {
        pdfs: [
          ...state.pdfs,
          {
            id,
            name,
            url,
            status: 'Ready',
            oaStatus: 'unknown',
            sourceType: 'pdf_upload',
            groundingMode: 'auto',
            uploadedAt: Date.now(),
          },
        ],
      };
    });
  },

  removePdf: async (id: string) => {
    const remaining = get().pdfs.filter((p) => p.id !== id);
    const nextActiveId = remaining.length > 0 ? remaining[0].id : '';

    set({
      pdfs: remaining,
      activePdfId: nextActiveId,
    });

    try {
      await db.pdfs.delete(id);
      await db.chatMessages.where('pdfId').equals(id).delete();
      await db.settings.put({ key: 'activePdfId', value: nextActiveId });
    } catch (err) {
      console.warn('Error deleting PDF from IndexedDB:', err);
    }
  },

  clearAllPdfs: async () => {
    // Revoke object URLs to free memory
    get().pdfs.forEach((p) => {
      if (p.url && p.url.startsWith('blob:')) {
        try {
          URL.revokeObjectURL(p.url);
        } catch (_) {}
      }
    });

    set({
      pdfs: [],
      activePdfId: '',
    });

    try {
      await db.pdfs.clear();
      await db.chatMessages.clear();
      await db.settings.put({ key: 'activePdfId', value: '' });
    } catch (err) {
      console.warn('Error clearing PDFs from IndexedDB:', err);
    }
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

