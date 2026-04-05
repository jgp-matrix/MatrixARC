// @ts-nocheck
// Extracted from monolith public/index.html — safeSave, saveSnapshot, loadSnapshots, restoreSnapshot
// (lines 4311-4356)

declare const require: any;
let _g: any = null;
function g() { if (!_g) _g = require('@/core/globals'); return _g; }

let _saveFailBanner: any = null;
export function setSaveFailBanner(fn: any) { _saveFailBanner = fn; }

/**
 * Retry-wrapped save. Attempts up to `retries+1` times before giving up.
 */
export async function safeSave(uid: string, project: any, retries = 2): Promise<boolean> {
  const { saveProject } = g();
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      await saveProject(uid, project);
      return true;
    } catch (e: any) {
      console.warn(`Save failed (attempt ${attempt + 1}/${retries + 1}):`, e.message);
      if (attempt < retries) await new Promise(r => setTimeout(r, 2000));
    }
  }
  console.error("Save failed after all retries for project:", project?.id || project?.name);
  if (_saveFailBanner) _saveFailBanner("Save failed — changes may not be persisted. Check your connection.");
  return false;
}

/**
 * Save a snapshot of a panel's state before a destructive operation.
 * Stored in Firestore at {projectPath}/_snapshots/{timestamp}. Max 10 per project, auto-cleanup oldest.
 */
export async function saveSnapshot(uid: string, projectId: string, panel: any, reason: string): Promise<void> {
  const { _appCtx, fbDb } = g();
  try {
    const path = _appCtx.projectsPath || `users/${uid}/projects`;
    const snapPath = `${path}/${projectId}/_snapshots`;
    const snap = {
      panelId: panel.id,
      panelName: panel.name || "",
      reason,
      createdAt: Date.now(),
      bom: JSON.parse(JSON.stringify(panel.bom || [])),
      pricing: panel.pricing || null,
      validation: panel.validation || null,
      laborData: panel.laborData || null,
      status: panel.status || "draft",
    };
    await fbDb.collection(snapPath).add(snap);
    // Auto-cleanup: keep only last 10 snapshots per project
    const allSnaps = await fbDb.collection(snapPath).orderBy("createdAt", "desc").get();
    if (allSnaps.size > 10) {
      const toDelete = allSnaps.docs.slice(10);
      for (const d of toDelete) await d.ref.delete().catch(() => {});
    }
    console.log(`SNAPSHOT: saved "${reason}" for ${panel.name || panel.id}`);
  } catch (e: any) {
    console.warn("Snapshot save failed:", e.message);
  }
}

/**
 * Load the most recent snapshots for a project (up to 10).
 */
export async function loadSnapshots(uid: string, projectId: string): Promise<any[]> {
  const { _appCtx, fbDb } = g();
  try {
    const path = _appCtx.projectsPath || `users/${uid}/projects`;
    const snap = await fbDb.collection(`${path}/${projectId}/_snapshots`).orderBy("createdAt", "desc").limit(10).get();
    return snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
  } catch (e: any) {
    console.warn("Snapshot load failed:", e);
    return [];
  }
}

/**
 * Restore a panel from a snapshot.
 */
export async function restoreSnapshot(
  uid: string,
  projectId: string,
  snapshot: any,
  panel: any,
  onUpdate: (p: any) => void,
  onSaveImmediate?: (p: any) => void
): Promise<any> {
  const { saveProject } = g();
  const restored = {
    ...panel,
    bom: snapshot.bom || panel.bom,
    pricing: snapshot.pricing || panel.pricing,
    validation: snapshot.validation || panel.validation,
    laborData: snapshot.laborData || panel.laborData,
    status: snapshot.status || panel.status,
  };
  onUpdate(restored);
  try {
    if (onSaveImmediate) onSaveImmediate(restored);
    else await saveProject(uid, { ...restored });
  } catch (e) {}
  console.log(`SNAPSHOT: restored "${snapshot.reason}" from ${new Date(snapshot.createdAt).toLocaleString()}`);
  return restored;
}
