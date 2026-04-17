// ─── IndexedDB Image Cache ───────────────────────────────────────────────────
// Stores drawing page images in IndexedDB (not Firestore) to avoid document size limits.

import { IDB_NAME, IDB_STORE } from '@/core/constants';
import type { Panel, Page } from '@/core/types';

function openImageDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(IDB_STORE)) {
        req.result.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Save all page images from panels into IndexedDB.
 */
export async function saveImages(panels: Panel[]): Promise<void> {
  const db = await openImageDB();
  const tx = db.transaction(IDB_STORE, 'readwrite');
  const store = tx.objectStore(IDB_STORE);
  for (const panel of panels) {
    for (const pg of panel.pages) {
      if (pg.dataUrl) {
        store.put(pg.dataUrl, pg.id);
      }
    }
  }
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

/**
 * Hydrate missing dataUrl fields from IndexedDB.
 */
export async function loadImages(panels: Panel[]): Promise<Panel[]> {
  const db = await openImageDB();
  const tx = db.transaction(IDB_STORE, 'readonly');
  const store = tx.objectStore(IDB_STORE);

  const hydrated = await Promise.all(
    panels.map(async panel => ({
      ...panel,
      pages: await Promise.all(
        panel.pages.map(pg => {
          if (pg.dataUrl) return Promise.resolve(pg);
          return new Promise<Page>(resolve => {
            const req = store.get(pg.id);
            req.onsuccess = () => resolve({ ...pg, dataUrl: req.result || undefined });
            req.onerror = () => resolve(pg);
          });
        })
      ),
    }))
  );

  db.close();
  return hydrated;
}

/**
 * Delete images for all pages in the given panels.
 */
export async function deleteImages(panels: Panel[]): Promise<void> {
  const db = await openImageDB();
  const tx = db.transaction(IDB_STORE, 'readwrite');
  const store = tx.objectStore(IDB_STORE);
  for (const panel of panels) {
    for (const pg of panel.pages) {
      store.delete(pg.id);
    }
  }
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}
