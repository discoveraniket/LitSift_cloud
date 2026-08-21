import { PdfDocumentInfo, usePdfStore } from '../store/usePdfStore';

export async function getPdfBase64(pdfInfo: PdfDocumentInfo): Promise<string> {
  if (pdfInfo.base64) {
    return pdfInfo.base64;
  }

  try {
    let blob: Blob;

    if (pdfInfo.file) {
      blob = pdfInfo.file;
    } else if (pdfInfo.url) {
      const res = await fetch(pdfInfo.url);
      if (!res.ok) {
        throw new Error(`Failed to fetch PDF from ${pdfInfo.url} (Status ${res.status})`);
      }
      blob = await res.blob();
    } else {
      throw new Error(`No PDF binary or URL available for paper "${pdfInfo.name}".`);
    }

    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        const base64String = result.includes(',') ? result.split(',')[1] : result;
        resolve(base64String);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });

    // Cache base64 in store
    usePdfStore.getState().setPdfBase64(pdfInfo.id, base64);
    return base64;
  } catch (err: any) {
    console.error(`Error converting PDF (${pdfInfo.name}) to Base64:`, err);
    throw err;
  }
}
