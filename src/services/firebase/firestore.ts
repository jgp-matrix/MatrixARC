// ─── Firestore Service ───────────────────────────────────────────────────────
// Centralized Firestore access. All reads/writes go through here.

import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';
import type { Project, Panel, PricingConfig, AppContext } from '@/core/types';

function db(): firebase.firestore.Firestore {
  return firebase.firestore();
}

// ─── Projects ────────────────────────────────────────────────────────────────

export async function saveProject(projectsPath: string, project: Project): Promise<Project> {
  const ref = project.id
    ? db().doc(`${projectsPath}/${project.id}`)
    : db().collection(projectsPath).doc();

  // Strip dataUrl from pages before saving (images live in IndexedDB)
  const stripped: Project = {
    ...project,
    id: ref.id,
    updatedAt: Date.now(),
    panels: project.panels.map(p => ({
      ...p,
      pages: p.pages.map(pg => {
        const { dataUrl, ...rest } = pg;
        return rest;
      }),
    })),
  };

  await ref.set(stripped);
  return { ...project, id: ref.id, updatedAt: stripped.updatedAt };
}

export async function loadProjects(projectsPath: string): Promise<Project[]> {
  const snap = await db().collection(projectsPath).orderBy('updatedAt', 'desc').get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as Project));
}

export async function deleteProject(projectsPath: string, id: string): Promise<void> {
  await db().doc(`${projectsPath}/${id}`).delete();
}

// ─── User Config ─────────────────────────────────────────────────────────────

export async function loadApiKey(uid: string): Promise<string | null> {
  try {
    const d = await db().doc(`users/${uid}/config/api`).get();
    return d.exists ? (d.data()?.key || null) : null;
  } catch {
    return null;
  }
}

export async function saveApiKey(uid: string, key: string): Promise<void> {
  await db().doc(`users/${uid}/config/api`).set({ key });
}

export async function loadPricingConfig(configPath: string): Promise<PricingConfig | null> {
  try {
    const d = await db().doc(`${configPath}/pricing`).get();
    if (!d.exists) return null;
    const c = d.data()!;
    return {
      contingencyBOM: c.contingencyBOM ?? 1500,
      contingencyConsumables: c.contingencyConsumables ?? 400,
      budgetaryContingencyPct: c.budgetaryContingencyPct ?? 20,
    };
  } catch {
    return null;
  }
}

export async function savePricingConfig(configPath: string, cfg: PricingConfig): Promise<void> {
  await db().doc(`${configPath}/pricing`).set(cfg);
}

// ─── User Profile ────────────────────────────────────────────────────────────

export async function loadUserProfile(uid: string): Promise<{ companyId: string | null; role: string | null }> {
  try {
    const d = await db().doc(`users/${uid}/config/profile`).get();
    if (!d.exists) return { companyId: null, role: null };
    const data = d.data()!;
    return { companyId: data.companyId || null, role: data.role || null };
  } catch {
    return { companyId: null, role: null };
  }
}

// ─── Company ─────────────────────────────────────────────────────────────────

export async function createCompany(uid: string, email: string, name: string): Promise<string> {
  const ref = db().collection('companies').doc();
  const batch = db().batch();
  batch.set(ref, { name, createdBy: uid, createdAt: Date.now() });
  batch.set(ref.collection('members').doc(uid), { email, role: 'admin', addedAt: Date.now() });
  batch.set(db().doc(`users/${uid}/config/profile`), { companyId: ref.id, role: 'admin' });
  await batch.commit();
  return ref.id;
}

export async function loadCompanyMembers(companyId: string): Promise<any[]> {
  const snap = await db().collection(`companies/${companyId}/members`).get();
  return snap.docs.map(d => ({ uid: d.id, ...d.data() }));
}

// ─── Part Library ────────────────────────────────────────────────────────────

export async function loadPartLibrary(configPath: string): Promise<any> {
  try {
    const d = await db().doc(`${configPath}/partLibrary`).get();
    return d.exists ? d.data() : { entries: [] };
  } catch {
    return { entries: [] };
  }
}

export async function savePartLibraryEntry(
  configPath: string,
  entry: { manufacturer: string; description: string; partNumber: string }
): Promise<void> {
  const key = `${(entry.manufacturer || '').trim().toLowerCase()}||${(entry.description || '').trim().toLowerCase()}`;
  const ref = db().doc(`${configPath}/partLibrary`);
  const d = await ref.get();
  const lib = d.exists ? d.data()! : { entries: [] };
  const entries = lib.entries || [];
  const idx = entries.findIndex((e: any) => e.key === key);
  const record = { key, ...entry, updatedAt: Date.now() };
  if (idx >= 0) entries[idx] = record;
  else entries.push(record);
  await ref.set({ entries }, { merge: true });
}

// ─── Part Corrections ────────────────────────────────────────────────────────

export async function loadPartCorrections(configPath: string): Promise<any[]> {
  try {
    const d = await db().doc(`${configPath}/partCorrections`).get();
    return d.exists ? (d.data()?.corrections || []) : [];
  } catch {
    return [];
  }
}

export async function savePartCorrection(
  configPath: string,
  correction: { wrongValue: string; correctValue: string; description: string; manufacturer: string }
): Promise<void> {
  const key = (correction.wrongValue || '').trim().toLowerCase();
  const ref = db().doc(`${configPath}/partCorrections`);
  const d = await ref.get();
  const corrections = d.exists ? (d.data()?.corrections || []) : [];
  const idx = corrections.findIndex((c: any) => (c.wrongValue || '').trim().toLowerCase() === key);
  const record = { ...correction, updatedAt: Date.now() };
  if (idx >= 0) corrections[idx] = record;
  else corrections.push(record);
  await ref.set({ corrections }, { merge: true });
}

// ─── BC Config ───────────────────────────────────────────────────────────────

export async function loadBcConfig(companyId: string): Promise<any | null> {
  try {
    const d = await db().doc(`companies/${companyId}/config/bcEnvironment`).get();
    return d.exists ? d.data() : null;
  } catch {
    return null;
  }
}

export async function saveBcConfig(companyId: string, config: any): Promise<void> {
  await db().doc(`companies/${companyId}/config/bcEnvironment`).set(config);
}

// ─── Cloud Functions ─────────────────────────────────────────────────────────

export function callFunction(name: string) {
  return firebase.functions().httpsCallable(name);
}
