// ─── Legacy Globals ──────────────────────────────────────────────────────────
// Temporary bridge module for functions/state not yet extracted into services.
// As migration progresses, items move from here into proper service modules.
// When this file is empty, the migration is complete.

import { useState, useEffect } from 'react';
import firebase from 'firebase/compat/app';
import 'firebase/compat/auth';
import 'firebase/compat/firestore';
import 'firebase/compat/functions';
import 'firebase/compat/storage';
import type { Project, Panel, BomRow, AppContext as AppCtxType } from './types';

const reactHooks = { useState, useEffect };

// ─── Firebase Init (must happen before any service is used) ──────────────────
import { FIREBASE_CONFIG } from './constants';
if (!firebase.apps.length) {
  firebase.initializeApp(FIREBASE_CONFIG);
}

// ─── Firebase Instances ──────────────────────────────────────────────────────
export const fbAuth = firebase.auth();
export const fbDb = firebase.firestore();
export const fbFunctions = firebase.functions();
export const fbStorage = firebase.storage();

// ─── App Version ─────────────────────────────────────────────────────────────
export const APP_VERSION = 'v1.18.163';

// ─── Mutable Global State (to be replaced by React Context) ──────────────────
export let _apiKey: string | null = null;
export let _appCtx: AppCtxType & { company?: any } = {
  uid: null, companyId: null, role: null, projectsPath: null, configPath: null,
};
export let _pricingConfig = { contingencyBOM: 1500, contingencyConsumables: 400, budgetaryContingencyPct: 20 };
export let _bcToken: string | null = null;
export let _bcConfig: any = { env: null, companyName: null, clientId: null };
export let _tooltipsEnabled = true;
export let _defaultBomItems: any[] = [];
export let _appProjectUpdateFn: ((p: Project) => void) | null = null;
export let _bcQueueCountSetter: ((n: number) => void) | null = null;

// ─── Setters (for mutations from components) ─────────────────────────────────
export function setApiKey(k: string | null) { _apiKey = k; }
export function setBcToken(t: string | null) { _bcToken = t; }
export function setAppProjectUpdateFn(fn: ((p: Project) => void) | null) { _appProjectUpdateFn = fn; }
export function setBcQueueCountSetter(fn: ((n: number) => void) | null) { _bcQueueCountSetter = fn; }
export function setTooltipsEnabled(v: boolean) { _tooltipsEnabled = v; }
export function clearNiqCache() { _niqCache = null; }
export function setDefaultBomItems(items: any[]) { _defaultBomItems = items; }
export function setAppCtxField(field: string, value: any) { (_appCtx as any)[field] = value; }

// ─── Project CRUD ────────────────────────────────────────────────────────────
export async function saveProject(uid: string, project: any): Promise<any> {
  const path = _appCtx.projectsPath || `users/${uid}/projects`;
  const ref = project.id ? fbDb.doc(`${path}/${project.id}`) : fbDb.collection(path).doc();
  const stripped = {
    ...project,
    id: ref.id,
    updatedAt: Date.now(),
    panels: (project.panels || []).map((p: any) => ({
      ...p,
      pages: (p.pages || []).map((pg: any) => { const { dataUrl, ...rest } = pg; return rest; }),
    })),
  };
  await ref.set(stripped);
  return { ...project, id: ref.id, updatedAt: stripped.updatedAt };
}

export async function loadProjects(uid: string): Promise<any[]> {
  const path = _appCtx.projectsPath || `users/${uid}/projects`;
  const snap = await fbDb.collection(path).orderBy('updatedAt', 'desc').get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function deleteProject(uid: string, id: string): Promise<void> {
  const path = _appCtx.projectsPath || `users/${uid}/projects`;
  await fbDb.doc(`${path}/${id}`).delete();
}

// ─── User Profile ────────────────────────────────────────────────────────────
export async function loadUserProfile(uid: string) {
  try {
    const d = await fbDb.doc(`users/${uid}/config/profile`).get();
    return d.exists ? d.data() : null;
  } catch { return null; }
}

// ─── API Key ─────────────────────────────────────────────────────────────────
export async function loadApiKey(uid: string) {
  try {
    const d = await fbDb.doc(`users/${uid}/config/api`).get();
    if (d.exists) _apiKey = d.data()?.key || null;
  } catch {}
}

// ─── Pricing Config ──────────────────────────────────────────────────────────
export async function loadPricingConfig(uid: string) {
  try {
    const path = _appCtx.configPath ? `${_appCtx.configPath}/pricing` : `users/${uid}/config/pricing`;
    const d = await fbDb.doc(path).get();
    if (d.exists) {
      const c = d.data()!;
      _pricingConfig = {
        contingencyBOM: c.contingencyBOM ?? 1500,
        contingencyConsumables: c.contingencyConsumables ?? 400,
        budgetaryContingencyPct: c.budgetaryContingencyPct ?? 20,
      };
    }
  } catch {}
}

// ─── Company Members ─────────────────────────────────────────────────────────
export async function loadCompanyMembers(companyId: string) {
  const snap = await fbDb.collection(`companies/${companyId}/members`).get();
  return snap.docs.map(d => ({ uid: d.id, ...d.data() }));
}

// ─── Labor Rates ─────────────────────────────────────────────────────────────
let _laborRates: any = null;
export async function loadLaborRates(uid: string) {
  try {
    const path = _appCtx.configPath ? `${_appCtx.configPath}/laborRates` : `users/${uid}/config/laborRates`;
    const d = await fbDb.doc(path).get();
    if (d.exists) _laborRates = d.data();
  } catch {}
}

// ─── Default BOM Items ───────────────────────────────────────────────────────
export async function loadDefaultBomItems(uid: string) {
  try {
    const path = _appCtx.configPath ? `${_appCtx.configPath}/defaultBomItems` : `users/${uid}/config/defaultBomItems`;
    const d = await fbDb.doc(path).get();
    if (d.exists) _defaultBomItems = d.data()?.items || [];
  } catch {}
}

export async function saveDefaultBomItems(uid: string, items: any[]) {
  const path = _appCtx.configPath ? `${_appCtx.configPath}/defaultBomItems` : `users/${uid}/config/defaultBomItems`;
  await fbDb.doc(path).set({ items });
}

// ─── Push Notifications ──────────────────────────────────────────────────────
export async function initPushNotifications(uid: string) {
  // Stub — full implementation requires FCM setup
  console.log('initPushNotifications stub called for', uid);
}

export async function unsubscribePushNotifications(uid: string) {
  console.log('unsubscribePushNotifications stub called for', uid);
}

// ─── BC Config ───────────────────────────────────────────────────────────────
export async function loadBcConfig(companyId: string) {
  try {
    const d = await fbDb.doc(`companies/${companyId}/config/bcEnvironment`).get();
    if (d.exists) {
      _bcConfig = d.data();
      console.log('BC CONFIG loaded:', _bcConfig?.env, _bcConfig?.companyName);
      // Propagate config to service modules
      const { setClientConfig } = await import('@/services/businessCentral/client');
      const { setBcConfig } = await import('@/services/businessCentral/auth');
      setClientConfig(_bcConfig);
      setBcConfig(_bcConfig);
    } else {
      console.warn('BC CONFIG not found at companies/' + companyId + '/config/bcEnvironment');
    }
  } catch (e) { console.error('loadBcConfig error:', e); }
}

// ─── BC Token ────────────────────────────────────────────────────────────────
export async function acquireBcToken(interactive = true): Promise<string | null> {
  // Ensure service modules have the latest config before acquiring token
  if (_bcConfig) {
    const { setBcConfig } = await import('@/services/businessCentral/auth');
    const { setClientConfig } = await import('@/services/businessCentral/client');
    setBcConfig(_bcConfig);
    setClientConfig(_bcConfig);
  }
  const { acquireToken } = await import('@/services/businessCentral/auth');
  const token = await acquireToken(interactive);
  _bcToken = token;
  return token;
}

// ─── BC Operations (delegating to service modules) ──────────────────────────
export async function bcFetchCompanyInfo() {
  try {
    const mod = await import('@/services/businessCentral/projects');
    const info = await mod.bcFetchCompanyInfo();
    if (info) {
      _appCtx.company = { name: info.name, logoUrl: _appCtx.company?.logoUrl || null, address: info.address, phone: info.phone };
    }
    return info;
  } catch (e) { console.error('bcFetchCompanyInfo error:', e); return null; }
}

// BC offline queue — stored in localStorage
const BC_QUEUE_KEY = '_arc_bc_queue';
function _bcQueueLoad(): any[] {
  try { return JSON.parse(localStorage.getItem(BC_QUEUE_KEY) || '[]'); } catch { return []; }
}
function _bcQueueSave(q: any[]) { localStorage.setItem(BC_QUEUE_KEY, JSON.stringify(q)); }

export function bcEnqueue(type: string, params: any, description: string) {
  const q = _bcQueueLoad();
  q.push({ type, params, description, addedAt: Date.now(), retries: 0 });
  _bcQueueSave(q);
  if (_bcQueueCountSetter) _bcQueueCountSetter(q.length);
}
export function _bcQGet(): any[] { return _bcQueueLoad(); }

export async function bcProcessQueue() {
  const q = _bcQueueLoad();
  if (!q.length) return;
  const remaining: any[] = [];
  for (const item of q) {
    try {
      // Process each queue item based on type
      if (item.type === 'patchJob') {
        const mod = await import('@/services/businessCentral/projects');
        await mod.bcPatchJobOData(item.params.jobNo, item.params.fields);
      } else {
        // Unknown type — keep in queue
        remaining.push(item);
        continue;
      }
    } catch {
      item.retries = (item.retries || 0) + 1;
      if (item.retries < 5) remaining.push(item);
    }
  }
  _bcQueueSave(remaining);
  if (_bcQueueCountSetter) _bcQueueCountSetter(remaining.length);
}

export async function bcLoadAllProjects() {
  try {
    const mod = await import('@/services/businessCentral/projects');
    return await mod.bcLoadAllProjects();
  } catch (e) { console.error('bcLoadAllProjects error:', e); return []; }
}
export async function bcLoadAllCustomers() {
  try {
    const mod = await import('@/services/businessCentral/projects');
    return await mod.bcLoadAllCustomers();
  } catch (e) { console.error('bcLoadAllCustomers error:', e); return []; }
}
export async function bcLoadAllProjectsOData() {
  try {
    const mod = await import('@/services/businessCentral/projects');
    return await mod.bcLoadAllProjectsOData();
  } catch (e) { console.error('bcLoadAllProjectsOData error:', e); return []; }
}
export async function bcPatchJobOData(jobNo: string, fields: any) {
  const mod = await import('@/services/businessCentral/projects');
  return await mod.bcPatchJobOData(jobNo, fields);
}
export async function bcDeleteProject(bcProjectId: string) {
  const mod = await import('@/services/businessCentral/projects');
  return await mod.bcDeleteProject(bcProjectId);
}

// ─── NIQ (Knowledge Base) ────────────────────────────────────────────────────
let _niqCache: any[] | null = null;
export async function loadNIQ() {
  if (_niqCache) return _niqCache;
  try {
    const path = _appCtx.companyId ? `companies/${_appCtx.companyId}/knowledgeBase` : null;
    if (!path) return [];
    const snap = await fbDb.collection(path).get();
    _niqCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    return _niqCache;
  } catch { return []; }
}

export function searchNIQ(docs: any[], terms: string[]) {
  if (!docs?.length || !terms?.length) return '';
  const matches = docs.filter(d => {
    const content = (d.content || '').toLowerCase();
    return terms.some(t => content.includes(t));
  }).slice(0, 5);
  return matches.map(d => d.content).join('\n\n---\n\n');
}

// ─── Project Status ──────────────────────────────────────────────────────────
export function projectStatus(project: any): string {
  if (!project.panels?.length) return 'draft';
  const statuses = project.panels.map((p: any) => p.status || 'draft');
  if (statuses.every((s: string) => s === 'complete')) return 'complete';
  if (statuses.some((s: string) => s === 'pushed_to_bc')) return 'pushed_to_bc';
  if (statuses.some((s: string) => s === 'costed')) return 'costed';
  if (statuses.some((s: string) => s === 'validated')) return 'validated';
  if (statuses.some((s: string) => s === 'extracted')) return 'extracted';
  return 'draft';
}

// ─── Background Tasks ────────────────────────────────────────────────────────
export const _bgTasks: Record<string, any> = {};
const _bgListeners: (() => void)[] = [];
function _notifyBg() { _bgListeners.forEach(fn => fn()); }

export function bgStart(id: string, panelName: string, projectId: string) {
  _bgTasks[id] = { status: 'running', msg: 'Starting...', pct: 0, panelName, projectId };
  _notifyBg();
}
export function bgSetPct(id: string, pct: number) {
  if (_bgTasks[id]) { _bgTasks[id].pct = pct; _notifyBg(); }
}
export function bgUpdate(id: string, msg: string) {
  if (_bgTasks[id]) { _bgTasks[id].msg = msg; _notifyBg(); }
}
export function bgDone(id: string) {
  if (_bgTasks[id]) { _bgTasks[id].status = 'complete'; _bgTasks[id].pct = 100; _notifyBg(); }
}
export function bgError(id: string, msg: string) {
  if (_bgTasks[id]) { _bgTasks[id].status = 'error'; _bgTasks[id].msg = msg; _notifyBg(); }
}
export function bgDismiss(id: string) { delete _bgTasks[id]; _notifyBg(); }

export function useBgTasks() {
  const [, force] = reactHooks.useState(0);
  reactHooks.useEffect(() => {
    const fn = () => force((n: number) => n + 1);
    _bgListeners.push(fn);
    return () => { const i = _bgListeners.indexOf(fn); if (i >= 0) _bgListeners.splice(i, 1); };
  }, []);
  return { ..._bgTasks };
}

// ─── Project Migration ──────────────────────────────────────────────────────
/**
 * Migrate flat project format to panels format.
 */
export function migrateProject(p: any): any {
  if (p.panels) return p;
  const panel = {
    id: 'panel-1', name: 'Panel 1',
    pages: p.pages || [], bom: p.bom || [],
    validation: p.validation || null, pricing: p.pricing || null,
    budgetaryQuote: p.budgetaryQuote || null, status: p.status || 'draft',
  };
  const { pages, bom, validation, pricing, budgetaryQuote, ...rest } = p;
  return { ...rest, panels: [panel] };
}

// ─── Project Live Update System ─────────────────────────────────────────────
const _projectListeners: Record<string, (p: any) => void> = {};

/**
 * Register a listener for project updates (used by background extraction).
 * Returns an unsubscribe function.
 */
export function onProjectUpdated(projectId: string, cb: (p: any) => void): () => void {
  _projectListeners[projectId] = cb;
  return () => { delete _projectListeners[projectId]; };
}

/**
 * Notify all listeners that a project has been updated.
 */
export function notifyProjectListeners(projectId: string, liveProject: any): void {
  if (_projectListeners[projectId]) _projectListeners[projectId](liveProject);
  if (_appProjectUpdateFn) _appProjectUpdateFn(liveProject);
}

// ─── Role Helpers ────────────────────────────────────────────────────────────

export function isAdmin(): boolean {
  return !!_appCtx.companyId && _appCtx.role === 'admin';
}

export function isReadOnly(): boolean {
  return _appCtx.role === 'view';
}

// ─── Save Project Panel ─────────────────────────────────────────────────────

/**
 * Save a single panel within a project (used by background extraction).
 */
export async function saveProjectPanel(
  uid: string,
  projectId: string,
  panelId: string,
  updatedPanel: any
): Promise<void> {
  const path = _appCtx.projectsPath || `users/${uid}/projects`;
  const ref = fbDb.collection(path).doc(projectId);
  const snap = await ref.get();
  if (!snap.exists) return;
  const proj: any = { id: ref.id, ...snap.data() };
  const panels = (proj.panels || []).map((p: any) => p.id === panelId ? updatedPanel : p);
  const liveProject = { ...proj, panels, updatedAt: Date.now() };
  const stripped = JSON.parse(JSON.stringify({
    ...liveProject,
    panels: panels.map((p: any) => ({
      ...p,
      pages: (p.pages || []).map((pg: any) => { const { dataUrl, ...r } = pg; return r; }),
    })),
  }));
  await ref.set(stripped);
  notifyProjectListeners(projectId, liveProject);
}

// ─── Copy Project ───────────────────────────────────────────────────────────

/**
 * Deep copy a project including BC project, tasks, images, and planning lines.
 */
export async function copyProject(
  uid: string,
  sourceProject: any,
  onProgress?: (p: any) => void
): Promise<any> {
  const pp = onProgress || (() => {});
  const src = sourceProject;
  const srcPanels = src.panels || [];

  const { bcCreateProject, bcCreatePanelTaskStructure, bcSyncPanelPlanningLines } = await import('@/services/businessCentral/projects');
  const { ensureDataUrl } = await import('@/scanning/pdfExtractor');

  // Step 1: Create new BC project with same customer
  pp({ step: 'bc', msg: 'Creating BC project...', pct: 5 });
  if (!_bcToken) await acquireBcToken(true);
  if (!_bcToken) throw new Error('Could not connect to Business Central');
  const bc = await bcCreateProject(src.name + ' (Copy)', src.bcCustomerNumber);

  // Step 2: Create panel task structure in BC
  pp({ step: 'tasks', msg: 'Creating BC tasks...', pct: 15 });
  const panelStubs = srcPanels.map((p: any, i: number) => ({ id: `panel-${i + 1}`, name: p.name || `Panel ${i + 1}` }));
  try { await bcCreatePanelTaskStructure(bc.number, src.name + ' (Copy)', panelStubs); } catch (e: any) { console.warn('Copy: task structure warning:', e.message); }

  // Step 3: Deep clone panels
  pp({ step: 'clone', msg: 'Cloning panel data...', pct: 25 });
  const newPanels = srcPanels.map((panel: any, i: number) => {
    const newPages = (panel.pages || []).map((pg: any) => ({
      ...pg,
      id: `pg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      dataUrl: undefined, storageUrl: undefined,
      _srcStorageUrl: pg.storageUrl || null, _srcPageId: pg.id,
    }));
    const newBom = (panel.bom || []).map((r: any) => ({
      ...r, id: `row-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    }));
    return { ...panel, id: `panel-${i + 1}`, pages: newPages, bom: newBom };
  });

  // Step 4: Save new project to Firestore
  pp({ step: 'save', msg: 'Saving project...', pct: 35 });
  const newProj = await saveProject(uid, {
    name: src.name + ' (Copy)',
    bcProjectId: bc.id, bcProjectNumber: bc.number,
    bcEnv: _bcConfig?.env,
    bcCustomerNumber: src.bcCustomerNumber,
    bcCustomerName: src.bcCustomerName,
    status: src.status || 'draft',
    panels: newPanels,
    quote: src.quote ? { ...src.quote } : undefined,
    createdAt: Date.now(), updatedAt: Date.now(),
  });

  // Step 5: Copy page images
  const allPages = newPanels.flatMap((panel: any, pi: number) =>
    (panel.pages || []).map((pg: any, pgi: number) => ({ pi, pgi, pg }))
  );
  const totalPages = allPages.filter((x: any) => x.pg._srcStorageUrl).length;
  let copied = 0;
  for (const { pi, pgi, pg } of allPages) {
    if (!pg._srcStorageUrl) continue;
    pp({ step: 'images', msg: `Copying drawing ${copied + 1}/${totalPages}...`, pct: 35 + Math.round((copied / Math.max(totalPages, 1)) * 40) });
    try {
      const loaded = await ensureDataUrl({ storageUrl: pg._srcStorageUrl });
      if (loaded.dataUrl) {
        const newUrl = await uploadPageImage(uid, newProj.id, pg.id, loaded.dataUrl);
        newPanels[pi].pages[pgi].storageUrl = newUrl;
        newPanels[pi].pages[pgi].dataUrl = loaded.dataUrl;
      }
    } catch (e: any) { console.warn('Copy image failed for page', pg._srcPageId, e.message); }
    copied++;
  }
  // Clean up temp fields
  newPanels.forEach((panel: any) => (panel.pages || []).forEach((pg: any) => { delete pg._srcStorageUrl; delete pg._srcPageId; }));

  // Step 6: Re-save with storage URLs
  pp({ step: 'save2', msg: 'Saving images...', pct: 80 });
  const finalProj = await saveProject(uid, { ...newProj, panels: newPanels, updatedAt: Date.now() });

  // Step 7: Sync planning lines
  pp({ step: 'sync', msg: 'Syncing planning lines to BC...', pct: 85 });
  for (let i = 0; i < newPanels.length; i++) {
    pp({ step: 'sync', msg: `Syncing panel ${i + 1}/${newPanels.length} to BC...`, pct: 85 + Math.round((i / newPanels.length) * 12) });
    try { await bcSyncPanelPlanningLines(bc.number, { ...newPanels[i], panelIndex: i + 1 }); } catch (e: any) { console.warn('Copy: planning line sync failed for panel', i + 1, e.message); }
  }

  pp({ step: 'done', msg: 'Project copied!', pct: 100 });
  return finalProj;
}

/**
 * Upload a page image to Firebase Storage.
 */
export async function uploadPageImage(uid: string, projectId: string, pageId: string, dataUrl: string): Promise<string> {
  const ref = fbStorage.ref(`pageImages/${uid}/${projectId}/${pageId}.jpg`);
  console.log('UPLOAD IMAGE: starting', pageId, 'to', ref.fullPath);
  const snap = await ref.putString(dataUrl, 'data_url');
  console.log('UPLOAD IMAGE: uploaded', pageId, 'state=' + snap.state);
  const url = await ref.getDownloadURL();
  console.log('UPLOAD IMAGE: got URL', pageId);
  return url;
}

// ─── Misc Helpers ────────────────────────────────────────────────────────────
export function apiCall(body: any): Promise<string> {
  return import('@/services/anthropic/client').then(m => m.apiCall(body));
}
