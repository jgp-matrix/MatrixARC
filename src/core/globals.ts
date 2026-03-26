// ─── Legacy Globals ──────────────────────────────────────────────────────────
// Temporary bridge module for functions/state not yet extracted into services.
// As migration progresses, items move from here into proper service modules.
// When this file is empty, the migration is complete.

import { useState, useEffect } from 'react';
import firebase from 'firebase/compat/app';
import 'firebase/compat/auth';
import 'firebase/compat/firestore';
import 'firebase/compat/functions';
import type { Project, Panel, BomRow, AppContext as AppCtxType } from './types';

const reactHooks = { useState, useEffect };

// ─── Firebase Instances ──────────────────────────────────────────────────────
export const fbAuth = firebase.auth();
export const fbDb = firebase.firestore();
export const fbFunctions = firebase.functions();

// ─── App Version ─────────────────────────────────────────────────────────────
export const APP_VERSION = 'v1.18.163';

// ─── Mutable Global State (to be replaced by React Context) ──────────────────
export let _apiKey: string | null = null;
export let _appCtx: AppCtxType & { company?: any } = {
  uid: null, companyId: null, role: null, projectsPath: null, configPath: null,
};
export let _pricingConfig = { contingencyBOM: 1500, contingencyConsumables: 400, budgetaryContingencyPct: 20 };
export let _bcToken: string | null = null;
export let _bcConfig: any = null;
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
    if (d.exists) _bcConfig = d.data();
  } catch {}
}

// ─── BC Token ────────────────────────────────────────────────────────────────
export async function acquireBcToken(interactive = true): Promise<string | null> {
  // Delegates to the service layer — importing here to avoid circular deps
  const { acquireToken } = await import('@/services/businessCentral/auth');
  const token = await acquireToken(interactive);
  _bcToken = token;
  return token;
}

// ─── BC Operations (stubs for functions not yet extracted) ───────────────────
export async function bcFetchCompanyInfo() { return null; }
export async function bcProcessQueue() {}
export async function bcLoadAllProjects() { return []; }
export async function bcLoadAllCustomers() { return []; }
export async function bcLoadAllProjectsOData() { return []; }
export async function bcPatchJobOData(jobNo: string, fields: any) {}
export async function bcDeleteProject(bcProjectId: string) {}
export function bcEnqueue(type: string, params: any, description: string) {}
export function _bcQGet(): any[] { return []; }

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
const _bgTasks: Record<string, any> = {};
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

// ─── Misc Helpers ────────────────────────────────────────────────────────────
export function apiCall(body: any): Promise<string> {
  return import('@/services/anthropic/client').then(m => m.apiCall(body));
}
