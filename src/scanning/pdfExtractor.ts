// ─── PDF Page Extraction ─────────────────────────────────────────────────────
// Extract pages from PDFs using PDF.js, resize for analysis.

import type { Page } from '@/core/types';

declare const window: Window & { _pdfjs: any; pdfjsReady: Promise<void> };

/**
 * Extract pages from a PDF file as JPEG images.
 */
export async function extractPdfPages(file: File, scale = 4.0): Promise<Page[]> {
  await window.pdfjsReady;
  const pdfjs = window._pdfjs;
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
  const pages: Page[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d')!;
    await page.render({ canvasContext: ctx, viewport }).promise;

    // Rotate if portrait
    let dataUrl: string;
    if (canvas.height > canvas.width * 1.2) {
      const rotated = document.createElement('canvas');
      rotated.width = canvas.height;
      rotated.height = canvas.width;
      const rctx = rotated.getContext('2d')!;
      rctx.translate(rotated.width / 2, rotated.height / 2);
      rctx.rotate(Math.PI / 2);
      rctx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);
      dataUrl = rotated.toDataURL('image/jpeg', 0.92);
    } else {
      dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    }

    // Resize to max width
    const resized = await resizeImage(dataUrl, 3800);

    pages.push({
      id: `pg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: `${file.name} p${i}`,
      dataUrl: resized,
    });
  }

  return pages;
}

/**
 * Extract pages from an image file (JPG/PNG).
 */
export async function extractImagePage(file: File): Promise<Page> {
  const dataUrl = await readFileAsDataUrl(file);
  const resized = await resizeImage(dataUrl, 2800);
  return {
    id: `pg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: file.name,
    dataUrl: resized,
  };
}

/**
 * Resize an image to fit within maxWidth while maintaining aspect ratio.
 */
export function resizeImage(dataUrl: string, maxW = 2800): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      if (img.naturalWidth <= maxW) { resolve(dataUrl); return; }
      const scale = maxW / img.naturalWidth;
      const canvas = document.createElement('canvas');
      canvas.width = maxW;
      canvas.height = Math.round(img.naturalHeight * scale);
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.92));
    };
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = dataUrl;
  });
}

/**
 * Resize image for AI analysis (smaller for faster processing).
 */
export function resizeForAnalysis(dataUrl: string, maxW = 2400): Promise<string> {
  return resizeImage(dataUrl, maxW);
}

/**
 * Ensure a page has a dataUrl — loads from Firebase Storage if needed.
 * Returns the page with dataUrl populated, or unchanged if unavailable.
 */
export async function ensureDataUrl(page: any): Promise<any> {
  if (page.dataUrl) return page;
  if (!page.storageUrl) return page;
  try {
    // Get a fresh download URL from Firebase Storage SDK
    let url = page.storageUrl;
    const pathMatch = page.storageUrl.match(/\/o\/([^?]+)/);
    if (pathMatch) {
      const storagePath = decodeURIComponent(pathMatch[1]);
      const { fbStorage } = await import('@/core/globals');
      url = await fbStorage.ref(storagePath).getDownloadURL();
    }
    // Load via <img> + canvas to avoid CORS fetch issues
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        c.getContext('2d')!.drawImage(img, 0, 0);
        resolve(c.toDataURL('image/jpeg', 0.92));
      };
      img.onerror = () => reject(new Error('Image load failed'));
      img.src = url;
    });
    return { ...page, dataUrl };
  } catch (e) {
    console.warn('ensureDataUrl failed for page', page.id, e);
    return page;
  }
}

/**
 * Detect physical sheet dimensions in mm from pixel dimensions.
 * Identifies ANSI engineering sheet size using pixel area + aspect ratio.
 */
export function detectSheetMm(w: number, h: number): { mmW: number; mmH: number } {
  const landscape = w >= h;
  const [lw, lh] = landscape ? [w, h] : [h, w];
  const area = lw * lh;
  // Pixel-area thresholds calibrated so any reasonable scan DPI (72–300) maps to the right size.
  // ANSI: A=8.5×11, B=11×17, C=17×22, D=22×34, E=34×44 inches → mm × 25.4
  let mmL: number, mmS: number;
  if (area > 20000000) { mmL = 1117.6; mmS = 863.6; }       // E 44×34"
  else if (area > 8000000) { mmL = 863.6; mmS = 558.8; }     // D 34×22"
  else if (area > 3500000) { mmL = 558.8; mmS = 431.8; }     // C 22×17"
  else if (area > 1500000) { mmL = 431.8; mmS = 279.4; }     // B 17×11"
  else { mmL = 279.4; mmS = 215.9; }                          // A 11×8.5"
  return landscape ? { mmW: mmL, mmH: mmS } : { mmW: mmS, mmH: mmL };
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
