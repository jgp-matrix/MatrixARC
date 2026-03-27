// ─── Image Utilities ──────────────────────────────────────────────────────────
// Canvas overlay helpers for page image manipulation.

/**
 * Burn a stamp/watermark overlay onto a page image via canvas.
 * Adds a white semi-transparent bar at the top with red text (left, center, right).
 */
export async function burnStampCanvas(
  dataUrl: string,
  overlay: { left?: string; center?: string; right?: string }
): Promise<string> {
  return new Promise(resolve => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);
      const barH = Math.max(24, Math.round(img.height * 0.03));
      const fontSize = Math.max(12, Math.round(barH * 0.58));
      // White semi-transparent background strip — matches drawing paper look
      ctx.fillStyle = 'rgba(255,255,255,0.88)';
      ctx.fillRect(0, 0, img.width, barH);
      // Red border line at bottom of strip
      ctx.fillStyle = '#cc0000';
      ctx.fillRect(0, barH - 1, img.width, 1);
      ctx.font = `bold ${fontSize}px Arial,sans-serif`;
      ctx.fillStyle = '#cc0000';
      ctx.textBaseline = 'middle';
      const y = barH / 2;
      const pad = Math.max(10, Math.round(img.width * 0.012));
      ctx.textAlign = 'left';
      ctx.fillText((overlay.left || '').slice(0, 55), pad, y);
      ctx.textAlign = 'center';
      ctx.fillText(overlay.center || '', img.width / 2, y);
      ctx.textAlign = 'right';
      ctx.fillText((overlay.right || '').slice(0, 65), img.width - pad, y);
      resolve(canvas.toDataURL('image/jpeg', 0.93));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}
