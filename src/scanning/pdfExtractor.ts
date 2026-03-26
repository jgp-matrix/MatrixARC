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

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
