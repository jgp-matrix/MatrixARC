// ─── Drawing Analyzer ────────────────────────────────────────────────────────
// AI-driven analysis of layout, backpanel, enclosure, and schematic pages.
// Extracted from monolith index.html lines ~4439-4990.

import { apiCall, visionCall } from '@/services/anthropic/client';
import { resizeForAnalysis } from '@/scanning/pdfExtractor';

// ── AI Prompts ──────────────────────────────────────────────────────────────

export const SCHEMATIC_PROMPT = `You are reading a UL508A electrical control panel schematic page.

Extract and return ONLY valid JSON:
{
  "tags": [{"tag":"CB100","type":"breaker"}, {"tag":"PB1","type":"pushbutton"}],
  "wires": [
    {"w":"L1 bus to CB1 top","internal":true},
    {"w":"CB1 bottom to T1 H1","internal":true},
    {"w":"TB1-3 to output signal","internal":false}
  ]
}

Rules:
- tags: array of objects with "tag" (alphanumeric device ID) and "type" (one of: breaker, contactor, overload, relay, transformer, fuse, disconnect, drive, plc_io, terminal_block, pushbutton, pilot_light, selector_switch, hmi, e_stop, horn, power_supply, surge, meter, other)

Wire listing rules (CRITICAL — follow exactly):
- List every solid-line connection as an object with "w" (description) and "internal" (boolean).
- "internal": true means BOTH endpoints are devices, terminal blocks, or busses INSIDE the panel.
- "internal": false means one or both endpoints leave the panel (output signals, incoming supplies, field wires, external destinations).

Examples of internal=TRUE: bus to breaker, breaker to contactor, switch to terminal block, bus to switch.
Examples of internal=FALSE: terminal block to "output signal", "incoming supply" to terminal block, anything to/from a named signal like "high torque shutdown", "clarifier start", "alarm output", anything described as an output or external signal.

- The vertical bus lines themselves (L1, L2, L3, N) are NOT wires — do not list them.
- Dashed lines are NOT wires — do not list them.
- Ground symbols and internal device connections are NOT wires.
- If a line branches at a junction, each branch is a separate wire.
- Be conservative. When in doubt, mark internal: false.
- Return JSON only, no explanation`;

export const LAYOUT_PROMPT = `You are reading a UL508A control panel layout/arrangement drawing page.

Extract and return ONLY valid JSON:
{
  "enclosure": {"width":36,"height":48,"depth":12,"unit":"in"},
  "doorCutouts": [
    {"tag":"PB1","type":"pushbutton","widthIn":1.2,"heightIn":1.2},
    {"tag":"HMI1","type":"hmi","widthIn":6,"heightIn":4}
  ],
  "backpanelDevices": [
    {"tag":"CB100","type":"breaker"},
    {"tag":"VFD1","type":"drive"}
  ],
  "ductRuns": [{"lengthFt":3.5},{"lengthFt":2.0}],
  "dinRails": [{"lengthFt":3.0},{"lengthFt":2.5}],
  "sideTopDevices": [
    {"tag":"AC1","type":"air_conditioner","widthIn":14,"heightIn":14},
    {"tag":"FAN1","type":"fan","widthIn":4,"heightIn":4}
  ]
}

Rules:
- enclosure: overall panel dimensions if visible
- doorCutouts: ONLY devices that are mounted through the enclosure DOOR with cutout holes — these are operator-interface devices like pushbuttons, pilot lights, selector switches, HMIs, e-stops, horns, meters. The door layout typically shows circular or rectangular cutout holes. If you see a flat panel with DIN rails, wire duct, breakers, terminal blocks, contactors, relays — that is a BACKPANEL, not a door.
- backpanelDevices: devices mounted on the backpanel/mounting plate inside the enclosure — breakers, contactors, relays, overloads, PLCs, terminal blocks, power supplies, transformers, drives, fuses, DIN-rail mounted devices. If the drawing shows DIN rails, wire duct, or devices arranged on a flat mounting plate, ALL those devices go here — NOT in doorCutouts.
- ductRuns: each wire duct run with estimated length in feet
- dinRails: each DIN rail with estimated length in feet
- sideTopDevices: devices mounted on the SIDE PANELS or TOP of the enclosure (not the door or backpanel). These appear as smaller views or silhouettes drawn to the side or above the main panel view. Common examples: air conditioners, exhaust fans, conduit hubs, gland plates, auxiliary boxes. Estimate widthIn and heightIn in inches based on relative scale to the enclosure dimensions. If the drawing shows a side/top view with a device that appears SMALLER than 6 inches square, classify it normally. If it appears LARGER than 6 inches square (likely an air conditioner or fan unit), still capture it — the size drives labor calculations.
- IMPORTANT: Most layout pages show the backpanel. Only put devices in doorCutouts if you can clearly see they are door-mounted operator interface devices with cutout holes. When in doubt, put devices in backpanelDevices.
- Use device types: breaker, contactor, overload, relay, transformer, fuse, disconnect, drive, plc_io, terminal_block, pushbutton, pilot_light, selector_switch, hmi, e_stop, horn, power_supply, surge, meter, air_conditioner, fan, fan_shroud, conduit_hub, other
- fan_shroud: ventilation shroud/filter mounted on side panel. Always estimate widthIn and heightIn.
- Return JSON only, no explanation`;

export const BACKPANEL_PROMPT = `You are reading a UL508A control panel BACKPANEL (mounting plate) drawing page.
This is the INTERIOR mounting surface of the enclosure — NOT the door and NOT the sides/top.

Extract and return ONLY valid JSON:
{
  "backpanelDevices": [
    {"tag":"CB100","type":"breaker"},
    {"tag":"VFD1","type":"drive"},
    {"tag":"PLC1","type":"plc_io"}
  ],
  "ductRuns": [{"lengthFt":3.5},{"lengthFt":2.0}],
  "dinRails": [{"lengthFt":3.0},{"lengthFt":2.5}]
}

Rules:
- backpanelDevices: ALL devices mounted on the backpanel/mounting plate — breakers, contactors, relays, overloads, PLCs, terminal blocks, power supplies, transformers, drives, fuses, DIN-rail mounted devices, motor starters. List every device you can identify with a tag.
- ductRuns: each wire duct / wireway run with estimated length in feet
- dinRails: each DIN rail run with estimated length in feet
- IGNORE the door entirely — do NOT list pushbuttons, pilot lights, HMIs, e-stops, or selector switches as backpanel devices
- IGNORE side panels and top — do NOT list air conditioners or fans here
- Use device types: breaker, contactor, overload, relay, transformer, fuse, disconnect, drive, plc_io, terminal_block, power_supply, surge, meter, other
- Return JSON only, no explanation`;

export const ENCLOSURE_PROMPT = `You are reading a UL508A control panel ENCLOSURE drawing page.
This shows the DOOR (front face), SIDE PANELS, or TOP of the enclosure — NOT the interior backpanel.

Extract and return ONLY valid JSON:
{
  "enclosure": {"width":36,"height":48,"depth":12,"unit":"in"},
  "doorCutouts": [
    {"tag":"PB1","type":"pushbutton","widthIn":1.2,"heightIn":1.2},
    {"tag":"HMI1","type":"hmi","widthIn":6,"heightIn":4}
  ],
  "sideTopDevices": [
    {"tag":"AC1","type":"air_conditioner","location":"side","widthIn":14,"heightIn":14},
    {"tag":"FAN1","type":"fan","location":"side","widthIn":4,"heightIn":4},
    {"tag":"FS1","type":"fan_shroud","location":"side","widthIn":6,"heightIn":6},
    {"tag":"HRN1","type":"horn","location":"side","widthIn":4,"heightIn":4},
    {"tag":"BEA1","type":"beacon","location":"top","widthIn":3,"heightIn":3}
  ]
}

Rules:
- enclosure: overall panel dimensions if visible
- doorCutouts: ONLY devices mounted through the DOOR FACE with cutout holes — pushbuttons, pilot lights, selector switches, HMIs, e-stops, horns, meters. These appear as circular or rectangular cutouts on the front face of the door. Do NOT include beacons or stack lights here — those go in sideTopDevices.
- sideTopDevices: ALL devices on side panels or top. Always include a "location" field:
    1. location "side": Square or rectangular devices on the left or right side panel — fans (e.g. 4"x4"), air conditioners (e.g. 10"x14" or bigger), fan shrouds/filters (ventilation shroud mounted on side), horns or alarm boxes (square cutout). Estimate widthIn and heightIn in inches.
    2. location "top": Any device shown on top of the front view or on the roof of the enclosure — beacons, stack lights, warning lights. Each requires ONE hole through the top panel. Use type "beacon".
- IGNORE the backpanel entirely — do NOT list breakers, contactors, relays, PLCs, drives, terminal blocks, or DIN-rail devices
- IGNORE wire duct and DIN rails — those are backpanel items
- Use device types: pushbutton, pilot_light, selector_switch, hmi, e_stop, horn, meter, air_conditioner, fan, fan_shroud, beacon, conduit_hub, other
- fan_shroud: ventilation shroud/filter mounted on side panel. Always estimate widthIn and heightIn.
- Return JSON only, no explanation`;

// ── Region / Notes Builders ─────────────────────────────────────────────────

/**
 * Build region annotation notes for a single page (appended to AI prompts).
 */
export function buildPageRegionNotes(pg: any): string {
  if (!pg.regions?.length) return '';
  const descs = pg.regions.filter((r: any) => r.note).map((r: any) => {
    const label = r.label || r.type;
    const pos = `${Math.round(r.x * 100)}%-${Math.round((r.x + r.w) * 100)}% horiz, ${Math.round(r.y * 100)}%-${Math.round((r.y + r.h) * 100)}% vert`;
    return `\u2022 [${label}] ${r.note} (at ${pos})`;
  });
  return descs.length
    ? '\n\nUSER REGION ANNOTATIONS ON THIS PAGE (use these to improve accuracy \u2014 user has identified specific components, counts, and locations):\n' + descs.join('\n')
    : '';
}

/**
 * Build all-pages region summary for labor/device context.
 */
export function buildAllRegionSummary(pages: any[]): string {
  const entries: { page: string; type: string; note: string }[] = [];
  for (const pg of pages) {
    if (!pg.regions?.length) continue;
    for (const r of pg.regions) {
      if (!r.note) continue;
      entries.push({ page: pg.name || 'Page', type: r.label || r.type, note: r.note });
    }
  }
  if (!entries.length) return '';
  return '\n\nUSER REGION OBSERVATIONS (these are ground-truth observations from the user reviewing the drawings \u2014 trust these for device counts, component identification, and labor estimation):\n'
    + entries.map(e => `\u2022 [${e.type}] on ${e.page}: ${e.note}`).join('\n');
}

// ── Learning Hint Builders ──────────────────────────────────────────────────

/**
 * Build layout learning hint from past panel-hole correction entries.
 */
export function buildLayoutLearningHint(entries: any[]): string {
  if (!entries || !entries.length) return '';
  const relevant = entries.slice(-15);
  const lines = relevant.map((e: any) => {
    const details: string[] = [];
    if (e.doorCutoutCount != null) details.push('doorCutouts=' + e.doorCutoutCount);
    if (e.topBeaconCount != null) details.push('topBeacons=' + e.topBeaconCount);
    if (e.aiPanelHoles != null) details.push('ARC AI calculated ' + e.aiPanelHoles + ' panel holes');
    if (e.userPanelHoles != null) details.push('user corrected to ' + e.userPanelHoles + ' panel holes');
    if (e.note) details.push('note: ' + e.note);
    return '- ' + details.join(', ');
  });
  return `\n\nLearning from past panel hole corrections by this user:\n${lines.join('\n')}\nUse these patterns to improve door cutout vs backpanel device classification. Common errors: miscounting door cutouts by including backpanel devices, or missing door-mounted devices.`;
}

/**
 * Build page-type learning hint from past corrections.
 */
export function buildLearningHint(examples: any[]): string {
  if (!examples || !examples.length) return '';
  const relevant = examples.slice(-12);
  const lines = relevant.map((e: any) => {
    const ai = (e.aiTypes || []).join(',') || 'none';
    const conf = (e.confirmedTypes || []).join(',') || 'none';
    const reason = e.reason ? ` (reason: ${e.reason})` : '';
    return `- AI detected [${ai}] \u2192 user confirmed [${conf}]${reason}`;
  });
  return `\n\nLearning from past corrections by this user:\n${lines.join('\n')}\nApply these patterns when classifying.`;
}

/**
 * Build device classification hint from user-corrected device categories.
 */
export function buildDeviceClassificationHint(data: any): string {
  const entries = (data?.entries || []).slice(-25);
  if (!entries.length) return '';
  const lines = entries.map((e: any) => {
    const pn = e.partNumber ? `Part "${e.partNumber}"` : 'Unknown part';
    const desc = e.description ? ` (${e.description.slice(0, 60)})` : '';
    const note = e.userNote ? `: "${e.userNote.slice(0, 80)}"` : '';
    return `- ${pn}${desc} \u2192 ${e.category}${note}`;
  });
  return `\n\nKNOWN DEVICE CLASSIFICATIONS (from user corrections \u2014 treat these as TRACEABLE internal components, do NOT flag as missing):\n${lines.join('\n')}`;
}

// ── Page Analysis Functions ─────────────────────────────────────────────────

/**
 * Analyze a schematic page for device tags and wire count.
 * Uses the monolith version which includes wire termination counting.
 */
export async function analyzeSchematicPage(
  dataUrl: string,
  userNotes = '',
  deviceClassHint = ''
): Promise<{ tags: { tag: string; type: string }[]; wireCount: number; wireTerminations: number }> {
  const small = await resizeForAnalysis(dataUrl, 1568);
  const b64 = small && small.split(',')[1];
  if (!b64) {
    console.warn('analyzeSchematicPage: skipping \u2014 empty or invalid dataUrl');
    return { tags: [], wireCount: 0, wireTerminations: 0 };
  }
  const notesAppend = (userNotes ? `\n\nUSER NOTES ABOUT THESE DRAWINGS:\n${userNotes}` : '') + (deviceClassHint || '');
  const raw = await apiCall({
    model: 'claude-sonnet-4-6',
    max_tokens: 4000,
    messages: [{ role: 'user', content: [
      { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64 } },
      { type: 'text', text: SCHEMATIC_PROMPT + notesAppend },
    ] }],
  });
  console.log('Schematic Claude response:', raw);
  try {
    const cleaned = raw.replace(/```json|```/g, '').trim();
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (!m) { console.warn('No JSON object found in schematic response'); return { tags: [], wireCount: 0, wireTerminations: 0 }; }
    const parsed = JSON.parse(m[0]);
    // Normalize tags: accept both old ["CB100",...] and new [{tag,type},...] formats
    const rawTags = Array.isArray(parsed.tags) ? parsed.tags : [];
    const tags = rawTags.map((t: any) => typeof t === 'string' ? { tag: t, type: 'other' } : ({ tag: t.tag || '', type: t.type || 'other' }));
    const wires = Array.isArray(parsed.wires) ? parsed.wires : [];
    const internalWires = wires.filter((w: any) => typeof w === 'object' ? w.internal : true);
    const externalWires = wires.filter((w: any) => typeof w === 'object' && !w.internal);
    const wireCount = internalWires.length || +parsed.wireCount || 0;
    const wireTerminations = wireCount * 2;
    console.log(`WIRE COUNT: ${internalWires.length} internal, ${externalWires.length} external, ${wires.length} total`);
    console.log('Wires INTERNAL (counted):', internalWires.map((w: any) => w.w || w));
    console.log('Wires EXTERNAL (excluded):', externalWires.map((w: any) => w.w || w));
    return { tags, wireCount, wireTerminations };
  } catch (e) { console.error('Schematic JSON parse error:', e, raw); return { tags: [], wireCount: 0, wireTerminations: 0 }; }
}

/**
 * Analyze a layout/arrangement drawing page.
 */
export async function analyzeLayoutPage(
  dataUrl: string,
  layoutLearningHint = '',
  userNotes = ''
): Promise<any | null> {
  const b64 = dataUrl && dataUrl.split(',')[1];
  if (!b64) { console.warn('analyzeLayoutPage: skipping \u2014 empty or invalid dataUrl'); return null; }
  const notesAppend = userNotes ? `\n\nUSER NOTES ABOUT THESE DRAWINGS:\n${userNotes}` : '';
  const raw = await apiCall({
    model: 'claude-sonnet-4-6',
    max_tokens: 4000,
    messages: [{ role: 'user', content: [
      { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64 } },
      { type: 'text', text: LAYOUT_PROMPT + layoutLearningHint + notesAppend },
    ] }],
  });
  console.log('Layout Claude response:', raw);
  try {
    const cleaned = raw.replace(/```json|```/g, '').trim();
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (!m) { console.warn('No JSON object found in layout response'); return null; }
    return JSON.parse(m[0]);
  } catch (e) { console.error('Layout JSON parse error:', e, raw); return null; }
}

/**
 * Analyze a backpanel (mounting plate) drawing page.
 */
export async function analyzeBackpanelPage(
  dataUrl: string,
  userNotes = ''
): Promise<any | null> {
  const small = await resizeForAnalysis(dataUrl, 1568);
  const b64 = small && small.split(',')[1];
  if (!b64) { console.warn('analyzeBackpanelPage: skipping \u2014 empty or invalid dataUrl'); return null; }
  const notesAppend = userNotes ? `\n\nUSER NOTES ABOUT THESE DRAWINGS:\n${userNotes}` : '';
  const raw = await apiCall({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2000,
    messages: [{ role: 'user', content: [
      { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64 } },
      { type: 'text', text: BACKPANEL_PROMPT + notesAppend },
    ] }],
  });
  console.log('Backpanel Claude response:', raw);
  try {
    const cleaned = raw.replace(/```json|```/g, '').trim();
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (!m) { console.warn('No JSON object found in backpanel response'); return null; }
    return JSON.parse(m[0]);
  } catch (e) { console.error('Backpanel JSON parse error:', e, raw); return null; }
}

/**
 * Analyze an enclosure (door/side/top) drawing page.
 */
export async function analyzeEnclosurePage(
  dataUrl: string,
  layoutLearningHint = '',
  userNotes = ''
): Promise<any | null> {
  const small = await resizeForAnalysis(dataUrl, 1568);
  const b64 = small && small.split(',')[1];
  if (!b64) { console.warn('analyzeEnclosurePage: skipping \u2014 empty or invalid dataUrl'); return null; }
  const notesAppend = userNotes ? `\n\nUSER NOTES ABOUT THESE DRAWINGS:\n${userNotes}` : '';
  const raw = await apiCall({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2000,
    messages: [{ role: 'user', content: [
      { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64 } },
      { type: 'text', text: ENCLOSURE_PROMPT + layoutLearningHint + notesAppend },
    ] }],
  });
  console.log('Enclosure Claude response:', raw);
  try {
    const cleaned = raw.replace(/```json|```/g, '').trim();
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (!m) { console.warn('No JSON object found in enclosure response'); return null; }
    return JSON.parse(m[0]);
  } catch (e) { console.error('Enclosure JSON parse error:', e, raw); return null; }
}

/**
 * Merge multiple layout analysis results, deduplicating by tag.
 */
export function mergeLayoutResults(layouts: any[]): any {
  console.log('MERGE LAYOUTS: ' + layouts.length + ' layout results to merge');
  layouts.forEach((l: any, i: number) => console.log('Layout result ' + i + ':', JSON.stringify({ doorCutouts: l?.doorCutouts?.length, backpanelDevices: l?.backpanelDevices?.length })));
  const merged: any = { doorCutouts: [], backpanelDevices: [], ductRuns: [], dinRails: [], sideTopDevices: [], enclosure: null };
  for (const l of layouts) {
    if (!l) continue;
    if (l.enclosure && !merged.enclosure) merged.enclosure = l.enclosure;
    if (Array.isArray(l.doorCutouts)) merged.doorCutouts.push(...l.doorCutouts);
    if (Array.isArray(l.backpanelDevices)) merged.backpanelDevices.push(...l.backpanelDevices);
    if (Array.isArray(l.ductRuns)) merged.ductRuns.push(...l.ductRuns);
    if (Array.isArray(l.dinRails)) merged.dinRails.push(...l.dinRails);
    if (Array.isArray(l.sideTopDevices)) merged.sideTopDevices.push(...l.sideTopDevices);
  }
  // Deduplicate door cutouts by tag
  const seenDoor = new Set<string>();
  merged.doorCutouts = merged.doorCutouts.filter((d: any) => {
    const key = (d.tag || '').toUpperCase();
    if (!key || seenDoor.has(key)) return false;
    seenDoor.add(key); return true;
  });
  // Deduplicate backpanel devices by tag
  const seenBack = new Set<string>();
  merged.backpanelDevices = merged.backpanelDevices.filter((d: any) => {
    const key = (d.tag || '').toUpperCase();
    if (!key || seenBack.has(key)) return false;
    seenBack.add(key); return true;
  });
  console.log('AFTER DEDUP: doorCutouts=' + merged.doorCutouts.length + ', backpanelDevices=' + merged.backpanelDevices.length);
  // Deduplicate side/top devices by tag
  const seenSide = new Set<string>();
  merged.sideTopDevices = merged.sideTopDevices.filter((d: any) => {
    const key = (d.tag || '').toUpperCase();
    if (!key || seenSide.has(key)) return false;
    seenSide.add(key); return true;
  });
  return merged;
}
