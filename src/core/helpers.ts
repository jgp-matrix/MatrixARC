// ─── Core Helpers ────────────────────────────────────────────────────────────
// Shared utility functions used across the application.

import type { Panel, EngineeringQuestion } from '@/core/types';

// Re-export normPart and partMatch from deduplicator for convenience
export { normPart, partMatch } from '@/bom/deduplicator';

// ─── Page Types Helper ──────────────────────────────────────────────────────

/**
 * Get page types array from page object.
 * Handles backward compatibility: old pages have type string, new have types array.
 */
export function getPageTypes(page: any): string[] {
  if (Array.isArray(page.types)) return page.types;
  if (page.type && page.type !== 'untagged') return [page.type];
  return [];
}

// ─── Append Default BOM Items ───────────────────────────────────────────────

// Lazy import to avoid circular dependency — we read from globals
async function getDefaultBomItems(): Promise<any[]> {
  const { _defaultBomItems } = await import('@/core/globals');
  return _defaultBomItems;
}

// Labor BOM part numbers to skip when appending defaults
const LABOR_PNS = new Set(['1012', '1013', '1014']);

/**
 * Append default BOM items (configured by admin) to a BOM after extraction.
 * Skips items that already exist in the BOM (by description) and labor rows.
 */
export async function appendDefaultBomItems(bom: any[]): Promise<any[]> {
  const defaultItems = await getDefaultBomItems();
  console.log('APPEND DEFAULTS: _defaultBomItems=', defaultItems.length, 'items:', defaultItems.map((d: any) => d.description));
  if (!defaultItems.length) {
    console.log('APPEND DEFAULTS: skipped — no defaults configured');
    return bom;
  }

  const lower = new Set(bom.map((r: any) => (r.description || '').trim().toLowerCase()));
  console.log('APPEND DEFAULTS: existing BOM descriptions:', [...lower]);

  const items: any[] = [];
  for (const tpl of defaultItems) {
    if (LABOR_PNS.has((tpl.partNumber || '').trim())) continue;
    const desc = (tpl.description || '').trim().toLowerCase();
    if (desc && lower.has(desc)) {
      console.log('APPEND DEFAULTS: skipped (duplicate):', tpl.description);
      continue;
    }
    items.push({
      id: Date.now() + Math.random(),
      qty: tpl.qty || 1,
      partNumber: tpl.partNumber || '',
      description: tpl.description || '',
      manufacturer: tpl.manufacturer || '',
      notes: '',
      unitPrice: tpl.unitPrice || 0,
      priceSource: tpl.priceSource || null,
      priceDate: Date.now(),
      autoLoaded: true,
    });
    console.log('APPEND DEFAULTS: adding:', tpl.description, '$' + tpl.unitPrice);
  }

  console.log('APPEND DEFAULTS: appended', items.length, 'of', defaultItems.length, 'defaults. BOM total:', bom.length + items.length);
  return items.length ? [...bom, ...items] : bom;
}

// ─── Merge Engineering Questions ────────────────────────────────────────────

/**
 * Merge BOM and compliance questions into unified engineering questions list.
 * Avoids duplicates by question text.
 */
export function mergeEngineeringQuestions(
  existing: EngineeringQuestion[] | null,
  bomQs: any[] | null,
  complianceQs: any[] | null
): EngineeringQuestion[] {
  const eq: EngineeringQuestion[] = [...(existing || [])];
  const existingTexts = new Set(eq.map(q => q.question));

  // Add BOM questions
  (bomQs || []).forEach((q: any) => {
    if (existingTexts.has(q.question)) return;
    eq.push({
      id: String(Date.now() + Math.random()),
      source: 'bom',
      category: 'part_ambiguity',
      severity: 'info',
      question: q.question,
      options: q.options || [],
      rowRef: q.rowRef || q.pageName || 'BOM',
      pageName: q.pageName || 'BOM',
      answer: null,
      answeredBy: undefined,
      answeredAt: undefined,
      status: 'open',
      createdAt: Date.now(),
    });
    existingTexts.add(q.question);
  });

  // Add compliance questions
  (complianceQs || []).forEach((q: any) => {
    if (existingTexts.has(q.question)) return;
    eq.push({
      id: String(Date.now() + Math.random()),
      source: 'compliance',
      category: q.category || 'general',
      severity: q.severity || 'warning',
      question: q.question,
      options: q.options || [],
      rowRef: q.rowRef || 'Compliance',
      pageName: 'Compliance Review',
      answer: null,
      answeredBy: undefined,
      answeredAt: undefined,
      status: 'open',
      createdAt: Date.now(),
    });
    existingTexts.add(q.question);
  });

  return eq;
}

// ─── Compute BOM Hash ───────────────────────────────────────────────────────

/**
 * Hash BOM state for change detection (quote revision tracking).
 * Uses djb2 hash algorithm.
 */
export function computeBomHash(panels: Panel[]): string {
  const data = (panels || []).map(p =>
    (p.bom || [])
      .filter(r => !r.isLaborRow)
      .map(r => ({ pn: (r.partNumber || '').trim(), q: r.qty || 0, up: r.unitPrice || 0 }))
  );
  const str = JSON.stringify(data);
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h) + str.charCodeAt(i);
    h = h & h; // Convert to 32-bit integer
  }
  return String(h);
}

// ─── Parallel Map ───────────────────────────────────────────────────────────

/**
 * Parallel async map with concurrency limit.
 */
export async function parallelMap<T, R>(
  items: T[],
  fn: (item: T, index: number) => Promise<R>,
  concurrency = 4
): Promise<R[]> {
  const results: R[] = [];
  let idx = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (idx < items.length) {
        const i = idx++;
        results[i] = await fn(items[i], i);
      }
    }
  );
  await Promise.all(workers);
  return results;
}

// ─── Jokes ──────────────────────────────────────────────────────────────────

interface Joke {
  setup: string;
  punchline: string;
}

const _ARC_JOKES: Joke[] = [
  { setup: 'Why did the electrician break up with the neutral wire?', punchline: 'There was no spark between them.' },
  { setup: 'What did the control panel say to the VFD?', punchline: '"You really drive me crazy."' },
  { setup: "Why don't electricians ever get lost?", punchline: 'They always follow the current.' },
  { setup: "What's a panel builder's favorite exercise?", punchline: 'Circuit training.' },
  { setup: 'Why was the wire so stressed?', punchline: 'It was under too much tension.' },
  { setup: 'What did the breaker say to the short circuit?', punchline: '"You trip me up every time!"' },
  { setup: 'Why did the PLC go to therapy?', punchline: 'It had too many unresolved faults.' },
  { setup: 'How do control panels stay cool?', punchline: 'They have a lot of fans.' },
  { setup: 'What did the DIN rail say to the contactor?', punchline: '"Snap out of it!"' },
  { setup: 'Why did the terminal block file a complaint?', punchline: 'It was getting too many bad connections.' },
  { setup: "What's a wire duct's life motto?", punchline: '"Keep it all inside."' },
  { setup: 'Why did the panel shop hire a comedian?', punchline: 'To improve their delivery.' },
  { setup: 'What do you call a control panel with no labels?', punchline: 'An UL violation.' },
  { setup: 'Why did the motor starter go on vacation?', punchline: 'It needed to de-energize.' },
  { setup: 'What did the inspector say to the messy panel?', punchline: '"Wire you like this?"' },
  { setup: "Why don't transformers ever win arguments?", punchline: 'They always step down.' },
  { setup: 'What did the relay say at the party?', punchline: '"I\'m normally open to new things."' },
  { setup: 'Why was the BOM so long?', punchline: 'The engineer couldn\'t resistor adding more parts.' },
  { setup: "What's a panel builder's least favorite music?", punchline: 'Heavy metal — too much grounding.' },
  { setup: 'Why did the E-stop break up with the start button?', punchline: 'The relationship was too push-and-pull.' },
  { setup: 'What do you call a panel with perfect wire routing?', punchline: 'A work of art — said no inspector ever.' },
  { setup: 'Why did the fuse go to school?', punchline: 'To get a little more capacity.' },
  { setup: "What's the difference between a panel builder and an artist?", punchline: "The panel builder's mistakes actually trip something." },
  { setup: 'Why did the contactor go to the doctor?', punchline: 'It kept getting stuck in the closed position.' },
  { setup: 'What did the ground wire say to the chassis?', punchline: '"I\'ve got you covered."' },
  { setup: 'Why do panel builders make great detectives?', punchline: "They're experts at tracing circuits." },
  { setup: "What's a capacitor's favorite pickup line?", punchline: '"I\'ve been storing up the courage to talk to you."' },
  { setup: 'Why did the junction box feel left out?', punchline: 'Everyone just passed through without stopping.' },
  { setup: 'What did the overload relay say after a long day?', punchline: '"I\'m tripped out."' },
  { setup: 'Why did the panel builder bring a ladder to work?', punchline: 'The project specs were over their head.' },
  { setup: 'What do you call a wire that tells jokes?', punchline: 'A live wire.' },
  { setup: 'Why did the ammeter break up with the voltmeter?', punchline: 'They had too much resistance between them.' },
  { setup: "What's a conduit's favorite type of music?", punchline: 'Pipe organ.' },
  { setup: 'Why did the engineer spec a bigger enclosure?', punchline: 'They needed more room for activities.' },
  { setup: 'What do panel builders and comedians have in common?', punchline: 'Timing is everything.' },
  { setup: "Why don't switches ever win at poker?", punchline: 'They always show their hand — ON or OFF.' },
  { setup: 'What did the wire nut say to the wire?', punchline: '"Let\'s twist and stay together."' },
  { setup: 'Why was the power supply always invited to parties?', punchline: 'It really knew how to convert the energy in the room.' },
  { setup: 'What did the panel builder name their dog?', punchline: 'Ohm. Because he had low resistance.' },
  { setup: 'Why did the servo motor win the dance competition?', punchline: 'It had the best feedback loop.' },
  { setup: "What's an electrician's favorite ice cream flavor?", punchline: 'Shock-olate.' },
  { setup: 'Why did the neutral bus bar feel underappreciated?', punchline: 'Nobody ever gives it credit — they only talk about the hot side.' },
  { setup: 'What did the old panel say to the new panel?', punchline: '"Back in my day, we didn\'t need all these fancy drives."' },
  { setup: 'Why did the wire lug get promoted?', punchline: 'It made a solid connection with management.' },
  { setup: "What's the hardest part about being a wire?", punchline: "Everyone's always stripping you." },
  { setup: 'Why do panel builders hate knock-knock jokes?', punchline: "They've punched enough knockouts for one day." },
  { setup: 'What did the label maker say to the panel builder?', punchline: '"I\'m your type."' },
  { setup: 'Why did the safety relay go on a diet?', punchline: 'Too many redundant contacts.' },
  { setup: 'What did the estimator say about the 200-device panel?', punchline: '"This is going to cost a few bucks... hundred thousand."' },
  { setup: 'Why did the HMI screen go blank?', punchline: "It couldn't handle the user's touch." },
  { setup: "What's a panel builder's favorite holiday?", punchline: 'Ground-hog Day.' },
  { setup: 'Why did the 480V bus bar go to jail?', punchline: 'Assault and battery.' },
  { setup: 'What did the apprentice say after their first panel?', punchline: '"That was riveting." The journeyman said: "No, those were screws."' },
  { setup: 'Why did the control transformer feel small?', punchline: 'It was always stepping down.' },
  { setup: "What's the worst thing about a panel with no drawings?", punchline: "You have to wing it — and that's not UL approved." },
  { setup: 'Why was the crimp tool feeling confident?', punchline: 'It had a firm grip on the situation.' },
  { setup: 'What do you call a panel that passes inspection on the first try?', punchline: 'A myth.' },
  { setup: 'Why did the wire ferrule blush?', punchline: 'It got inserted in front of everyone.' },
  { setup: 'What did one phase say to the other two?', punchline: '"Without me, you two can\'t even rotate."' },
  { setup: 'Why did the interposing relay feel important?', punchline: 'It was the middleman in every deal.' },
];

let _jokeQueue: number[] = [];
let _currentJoke: Joke | null = null;
let _jokeShowTime = 0;
const _JOKE_KEY = '_arc_seen_jokes';

/**
 * Get the next random electrician joke. Keeps the same joke for 30 seconds.
 * Tracks seen jokes in localStorage to avoid repeats.
 */
export function getNextJoke(): Joke {
  const now = Date.now();
  if (_currentJoke && (now - _jokeShowTime) < 30000) return _currentJoke;

  // Load seen list from localStorage
  let seen: number[] = [];
  try { seen = JSON.parse(localStorage.getItem(_JOKE_KEY) || '[]'); } catch { }

  // If all jokes seen, reset the list
  if (seen.length >= _ARC_JOKES.length) {
    seen = [];
    try { localStorage.setItem(_JOKE_KEY, '[]'); } catch { }
  }

  // Build queue of unseen jokes if needed
  if (!_jokeQueue.length) {
    const unseenIdxs = _ARC_JOKES.map((_, i) => i).filter(i => !seen.includes(i));
    // Fisher-Yates shuffle
    for (let i = unseenIdxs.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [unseenIdxs[i], unseenIdxs[j]] = [unseenIdxs[j], unseenIdxs[i]];
    }
    _jokeQueue = unseenIdxs;
  }

  if (!_jokeQueue.length) return _ARC_JOKES[0]; // fallback
  const idx = _jokeQueue.shift()!;
  seen.push(idx);
  try { localStorage.setItem(_JOKE_KEY, JSON.stringify(seen)); } catch { }
  _currentJoke = _ARC_JOKES[idx];
  _jokeShowTime = now;
  return _currentJoke;
}

// ─── Panel Budgetary Check ──────────────────────────────────────────────────

/**
 * A panel is BUDGETARY if it has at least one BOM item that is not confirmed in BC.
 * Panels with no BOM items are treated as non-budgetary (blank/not-yet-extracted).
 */
export function isPanelBudgetary(panel: any): boolean {
  const bom = (panel.bom || []).filter((r: any) => !r.isLaborRow && !r.isCrossed);
  if (!bom.length) return false;
  return !bom.every((r: any) => r.priceSource === 'bc');
}

// ─── Ensure jsPDF ───────────────────────────────────────────────────────────

let _jsPdfReady = false;

/**
 * Ensure jsPDF and autoTable plugin are loaded.
 * Returns the jsPDF constructor.
 */
export async function ensureJsPDF(): Promise<any> {
  const w = window as any;
  if (_jsPdfReady && w.jspdf) return w.jspdf.jsPDF;
  if (!w.jspdf) {
    await new Promise<void>((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
      s.onload = () => res();
      s.onerror = rej;
      document.head.appendChild(s);
    });
  }
  if (!w.jspdf?.jsPDF?.prototype?.autoTable) {
    await new Promise<void>((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js';
      s.onload = () => res();
      s.onerror = rej;
      document.head.appendChild(s);
    });
  }
  _jsPdfReady = true;
  return w.jspdf.jsPDF;
}

// ─── Categorize Part ────────────────────────────────────────────────────────

/**
 * Categorize a part by its part number and description.
 * Returns a human-readable category string.
 */
export function categorizePart(partNumber: string, description: string): string {
  const t = ((description || '') + (partNumber || '')).toLowerCase();
  if (/controllogix|compactlogix|micrologix|1756-l|1769-l|s7-\d{3}|plc.*cpu|cpu.*plc|processor.*module/.test(t)) return 'PLC Processor';
  if (/1756-[io]|1769-[io]|input.*module|output.*module|analog.*input|analog.*output|digital.*input|digital.*output|ai\d|ao\d|di\d|do\d|ib16|ob16|ia8|oa8/.test(t)) return 'PLC I/O Module';
  if (/\bvfd\b|variable.freq|powerflex|altivar|optidrive|micromaster|g120|g110|sv0/.test(t)) return 'VFD';
  if (/\bcontactor\b|iec.*motor|definite.purpose|dp.?contactor|100-[ccd]/.test(t)) return 'Contactor';
  if (/\brelay\b|ice\d|700-|750-|intermediate.relay|plug.in.relay|cr\d\d/.test(t)) return 'Relay';
  if (/mccb|molded.case|main.*breaker|hfd|hja|hjd|lal|main.*disconnect/.test(t)) return 'MCCB';
  if (/\bbreaker\b|ul.?489|qo\d|qob|hom|faz|c60n|miniature.circuit/.test(t)) return 'Circuit Breaker';
  if (/\bduct\b|wireway|panduit.*duct|wiring.duct|trunking/.test(t)) return 'Wire Duct';
  if (/din.?rail|ts.?35|top.hat|omega.rail|g-rail/.test(t)) return 'DIN Rail';
  if (/terminal|ptfix|sak\d|ut\d|pt \d|fence.*term|din.*term|terminal.*block/.test(t)) return 'Terminal Block';
  if (/enclosure.*heat|cabinet.*heat|strip.heat|ptc.heat|\bheater\b/.test(t)) return 'Heater';
  if (/air.cond|vortex|cooler|thermal.manag|cabinet.*cool/.test(t)) return 'Air Conditioner';
  if (/\bhorn\b|\bbeacon\b|\bsiren\b|\bstrobe\b|signal.tower|stack.?light|xvbc|k80l/.test(t)) return 'Horn/Beacon';
  if (/enclosure|nema.*\d|hoffman|rittal|junction.box|wireway.encl/.test(t)) return 'Enclosure';
  if (/\bhmi\b|panelview|pro-face|touch.*screen|operator.*interface|weintek/.test(t)) return 'HMI';
  if (/pilot.light|push.?button|selector|door.op|xb\d|800f|800h|illuminated/.test(t)) return 'Pilot Light/Operator';
  return 'Other';
}
