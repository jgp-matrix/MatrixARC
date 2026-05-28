// tools/check-scope.js — Static scope checker for src/app.jsx
//
// Parses the JSX source using @babel/core + @babel/preset-react and walks
// the AST with @babel/traverse to find identifiers that are referenced but
// not in scope at their usage site. Catches the class of bugs where a prop
// name is used inside a component but missing from the destructured params
// (e.g., the v1.20.23 regression where `onArchive` was referenced inside
// PanelListView but not in the destructured props — compiled fine, crashed
// at runtime).
//
// Verification: This checker was validated against the exact v1.20.23 bug
// by temporarily removing `onArchive` from PanelListView's destructured
// props at line ~30146 of src/app.jsx, running the checker, confirming it
// reported the undefined reference at lines ~31498-31499, then reverting.
//
// Usage:  node tools/check-scope.js [--strict]
// Exit:   0 = no new violations (baseline violations are warned)
//         1 = new violations found (not in baseline) or error
// Flags:  --strict  exits 1 on ANY violation, including baseline ones
//
// Zero new dependencies — uses @babel/core, @babel/preset-react, and
// @babel/traverse (transitive dep of @babel/core).

const fs = require('fs');
const babel = require('@babel/core');
const traverse = require('@babel/traverse').default || require('@babel/traverse');

const SRC_PATH = 'src/app.jsx';
const STRICT = process.argv.includes('--strict');

// ─── Allowlist: globals and browser APIs that are legitimate at runtime ───
// These are either browser built-ins, or globals defined in public/index.html
// before the bundle script tag executes.
const GLOBAL_ALLOWLIST = new Set([
  // React (loaded via CDN in index.html)
  'React', 'ReactDOM',

  // React hooks (destructured at line 2 of app.jsx from React, but Babel
  // sees the destructuring in Program scope so they should be in scope —
  // listed here as safety net)
  'useState', 'useEffect', 'useRef', 'useCallback', 'useMemo',

  // Browser globals & Web APIs
  'console', 'window', 'document', 'globalThis',
  'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval',
  'requestAnimationFrame', 'cancelAnimationFrame',
  'Promise', 'Date', 'JSON', 'Math', 'Array', 'Object', 'String',
  'Number', 'Boolean', 'Error', 'TypeError', 'RangeError', 'SyntaxError',
  'ReferenceError', 'URIError', 'EvalError',
  'Map', 'Set', 'WeakMap', 'WeakSet', 'RegExp', 'Symbol', 'Proxy', 'Reflect',
  'parseInt', 'parseFloat', 'isNaN', 'isFinite',
  'undefined', 'NaN', 'Infinity',
  'encodeURIComponent', 'decodeURIComponent', 'encodeURI', 'decodeURI',
  'atob', 'btoa', 'fetch', 'alert', 'confirm', 'prompt',
  'location', 'navigator', 'history', 'performance', 'screen',
  'URL', 'URLSearchParams', 'FormData', 'Blob', 'File', 'FileReader',
  'Image', 'Audio', 'XMLHttpRequest', 'Headers', 'Request', 'Response',
  'MutationObserver', 'IntersectionObserver', 'ResizeObserver',
  'getComputedStyle', 'matchMedia',
  'localStorage', 'sessionStorage',
  'structuredClone', 'queueMicrotask',
  'crypto', 'AbortController', 'AbortSignal',
  'TextEncoder', 'TextDecoder',
  'DOMParser', 'CustomEvent', 'Event', 'MouseEvent', 'KeyboardEvent',
  'HTMLElement', 'Node', 'Element', 'DocumentFragment', 'NodeList',
  'ArrayBuffer', 'Uint8Array', 'Int8Array', 'Uint16Array', 'Int16Array',
  'Uint32Array', 'Int32Array', 'Float32Array', 'Float64Array',
  'DataView', 'SharedArrayBuffer',
  'Worker', 'ServiceWorker', 'BroadcastChannel', 'MessageChannel',
  'MessagePort', 'EventSource', 'WebSocket',
  'ReadableStream', 'WritableStream', 'TransformStream',
  'Intl', 'BigInt',
  'CSS', 'CSSStyleSheet',
  'PointerEvent', 'TouchEvent', 'FocusEvent', 'WheelEvent',
  'ClipboardEvent', 'DragEvent', 'AnimationEvent', 'TransitionEvent',
  'MediaQueryList', 'MediaQueryListEvent',
  'OffscreenCanvas', 'ImageData', 'ImageBitmap',
  'Notification', 'PushManager',
  'SpeechSynthesis', 'SpeechRecognition',
  'Selection', 'Range',
  'TreeWalker', 'NodeIterator',
  'requestIdleCallback', 'cancelIdleCallback',
  'reportError',

  // ─── Project-specific globals (AUDITED v1.20.27) ───────────────────────────
  // Every entry below was verified against its declaration site. When adding a
  // new entry, include the source file and line number. A phantom entry here
  // masks real bugs (see v1.20.26 "db" incident).
  //
  // NOTE: 'db' was deliberately removed — the Firestore instance is 'fbDb'.
  // Keeping 'db' masked the v1.20.26 bug. See TODO #60 / v1.20.27 hotfix.

  // Firebase SDK + app instances — public/index.html:202-203 (CDN), 260-272
  'firebase',       // index.html: loaded via CDN script tag
  'firebaseConfig', // index.html:260 — const firebaseConfig={...}
  'fbAuth',         // index.html:269 — const fbAuth=firebase.auth()
  'fbDb',           // index.html:270 — const fbDb=firebase.firestore()
  'fbFunctions',    // index.html:271 — const fbFunctions=firebase.functions()
  'fbStorage',      // index.html:272 — const fbStorage=firebase.storage()
  'fbMessaging',    // index.html:377 — let fbMessaging=null (lazy-loaded via ensureFcm)

  // App version constants — public/index.html:238, 257
  'APP_VERSION',        // index.html:238 — const APP_VERSION="v1.20.XX"
  'APP_SCHEMA_VERSION', // index.html:257 — const APP_SCHEMA_VERSION=3

  // Business Central window properties — src/app.jsx:332-336
  // Created via Object.defineProperty(window,...). Babel scope analysis doesn't
  // track defineProperty-created globals; they're accessible as bare names
  // because sourceType is 'script'.
  'BC_API_BASE',     // app.jsx:332 — Object.defineProperty(window,'BC_API_BASE',...)
  'BC_ODATA_BASE',   // app.jsx:333 — Object.defineProperty(window,'BC_ODATA_BASE',...)
  'BC_ENV',          // app.jsx:334 — Object.defineProperty(window,'BC_ENV',...)
  'BC_COMPANY_NAME', // app.jsx:335 — Object.defineProperty(window,'BC_COMPANY_NAME',...)
  'BC_CLIENT_ID',    // app.jsx:336 — Object.defineProperty(window,'BC_CLIENT_ID',...)

  // MSAL — dynamically loaded via script tag in app.jsx loadMsalScript()
  'msal', // window.msal after https://alcdn.msauth.net/browser/2.28.1/js/msal-browser.min.js loads

  // Debug infrastructure — public/index.html:278-332
  '_debugBreadcrumbs',  // index.html:278 — const _debugBreadcrumbs=[]
  'DEBUG_BREADCRUMB_MAX', // index.html:279 — const DEBUG_BREADCRUMB_MAX=30
  '_currentProjectId',  // index.html:280 — let _currentProjectId=null
  '_currentPanelId',    // index.html:281 — let _currentPanelId=null
  '_debugDedup',        // index.html:282 — const _debugDedup=new Map()
  '_debugSelfError',    // index.html:283 — let _debugSelfError=false
  'addBreadcrumb',      // index.html:284 — function addBreadcrumb(type,message,data)
  'logDebugEntry',      // index.html:290 — async function logDebugEntry(opts)
  '_debugEmit',         // index.html:320 — function _debugEmit(source,message,stack)
  '_origConsoleError',  // index.html:331 — const _origConsoleError=console.error.bind(console)
  '_origConsoleWarn',   // index.html:332 — const _origConsoleWarn=console.warn.bind(console)

  // Push notification infrastructure — public/index.html:377-462
  '_pushSupported',              // index.html:378 — const _pushSupported='Notification' in window...
  '_swRegistration',             // index.html:417 — let _swRegistration=null
  '_fcmLoadPromise',             // index.html:379 — let _fcmLoadPromise=null
  'ensureFcm',                   // index.html:380 — function ensureFcm()
  '_hashToken',                  // index.html:427 — function _hashToken(token)
  'initPushNotifications',       // index.html:433 — async function initPushNotifications(uid)
  'unsubscribePushNotifications', // index.html:452 — async function unsubscribePushNotifications(uid)

  // PDF.js lazy-load — public/index.html:223
  'pdfjsReady', // index.html:223 — window.pdfjsReady=function(){...}

  // Common iteration/control identifiers that appear as bare names
  'arguments', 'eval', 'this', 'super',
]);

// ─── Known violations baseline ──────────────────────────────────────────────
// Pre-existing scope issues in the codebase. These are REAL bugs but existed
// before the scope checker was introduced. Keyed by "identifier:enclosingFn"
// so the baseline survives line-number shifts from unrelated edits.
//
// Each entry documents the bug for future fix tracking. When a bug is fixed,
// remove the entry — the checker will confirm it's gone. If it reappears in
// a different function, it will be caught as a NEW violation.
//
// Run with --strict to fail on baseline violations too (useful for a cleanup
// sprint targeting these known issues).
const KNOWN_VIOLATIONS = new Set([
  // PanelListView ship-date popover calls `update(...)` but PanelListView has
  // no `update` in scope — should be `persistProject(...)`.
  'update:PanelListView',

  // EcoEditor's handleEcoFiles references `projectId` (should be `project.id`)
  // and `_logRemote` (defined in addFiles, not in EcoEditor scope).
  'projectId:handleEcoFiles',
  '_logRemote:handleEcoFiles',

  // reExtractWithFeedback: `let fbQs` is declared inside a try{} block but
  // referenced after the catch — block-scoped `let` is not accessible outside
  // the try block. Works only because the catch returns early on error.
  'fbQs:reExtractWithFeedback',

  // ProjectView's applyPortalPrices references `selectedPanelId` which is
  // defined in PanelListView, not ProjectView.
  'selectedPanelId:applyPortalPrices',

  // ProjectView references `onUpdate` (from _doInlineQuoteSend and the
  // EcoEditor prop) but its props have `onChange`, not `onUpdate`.
  'onUpdate:_doInlineQuoteSend',
  'onUpdate:ProjectView',

  // VendorsPanel's runMigration calls `setMigrateStatus` but no corresponding
  // useState declaration exists. The migration tool would crash if invoked.
  'setMigrateStatus:runMigration',
]);

// ─── Parse ───────────────────────────────────────────────────────────────────

if (!fs.existsSync(SRC_PATH)) {
  console.error(`Source not found at ${SRC_PATH}.`);
  process.exit(1);
}

const source = fs.readFileSync(SRC_PATH, 'utf8');
console.log(`Parsing ${SRC_PATH} (${(source.length / 1024 / 1024).toFixed(1)} MB)...`);

const startTime = Date.now();

let ast;
try {
  const result = babel.transformSync(source, {
    ast: true,
    code: false,
    presets: [['@babel/preset-react', { runtime: 'classic' }]],
    sourceType: 'script',
    babelrc: false,
    configFile: false,
    filename: SRC_PATH,
  });
  ast = result.ast;
} catch (e) {
  console.error('Parse/transform error:', e.message.substring(0, 400));
  process.exit(1);
}

const parseMs = Date.now() - startTime;
console.log(`Parsed in ${(parseMs / 1000).toFixed(1)}s`);

// ─── Traverse & check ────────────────────────────────────────────────────────

const violations = [];

// We use Babel's built-in scope analysis. For each Identifier node, we check
// whether path.scope.hasBinding(name) is true. If not, it must be on the
// allowlist or it's a violation.
//
// Key nuance: Babel scope analysis automatically handles:
//   - let/const/var declarations in enclosing blocks
//   - function parameters (including destructured)
//   - function declarations (hoisted)
//   - for-loop variables
//   - catch clause params
//   - class declarations
//   - import bindings (if sourceType were 'module')
//
// What it does NOT cover (hence our allowlist):
//   - Globals from the browser environment
//   - Globals from index.html scripts that run before the bundle
//   - Window properties created via Object.defineProperty

const traverseStart = Date.now();

traverse(ast, {
  // Check every Identifier reference in the entire file. We don't limit
  // to JSX contexts because non-JSX undefined refs are equally dangerous.
  // Babel's ReferencedIdentifier visitor skips definition sites (declarations,
  // function names, import specifiers, etc.) automatically.
  ReferencedIdentifier(path) {
    const name = path.node.name;

    // Skip if it's on the global allowlist
    if (GLOBAL_ALLOWLIST.has(name)) return;

    // Skip if Babel's scope analysis finds a binding for this name
    if (path.scope.hasBinding(name)) return;

    // Skip member expression property access (obj.prop — prop is not a
    // standalone reference). But we DO check the object (obj).
    if (path.parent.type === 'MemberExpression' && path.parent.property === path.node && !path.parent.computed) {
      return;
    }

    // Skip if this is a property key in an object expression or pattern
    if (path.parent.type === 'ObjectProperty' && path.parent.key === path.node && !path.parent.computed) {
      return;
    }

    // Record the violation
    const loc = path.node.loc;
    const line = loc ? loc.start.line : '?';
    const col = loc ? loc.start.column : '?';

    violations.push({
      name,
      line,
      col,
      // Include the enclosing function name for context
      fn: getEnclosingFunctionName(path),
    });
  },
});

const traverseMs = Date.now() - traverseStart;
console.log(`Traversed in ${(traverseMs / 1000).toFixed(1)}s`);

// ─── Helper: find enclosing function name ────────────────────────────────────

function getEnclosingFunctionName(path) {
  let current = path.parentPath;
  while (current) {
    if (current.isFunctionDeclaration() && current.node.id) {
      return current.node.id.name;
    }
    if (current.isFunctionExpression() && current.node.id) {
      return current.node.id.name;
    }
    if (current.isArrowFunctionExpression() || current.isFunctionExpression()) {
      // Check if assigned to a variable: const Foo = () => ...
      if (current.parent.type === 'VariableDeclarator' && current.parent.id && current.parent.id.name) {
        return current.parent.id.name;
      }
    }
    current = current.parentPath;
  }
  return '<module>';
}

// ─── Deduplicate, classify, and report ───────────────────────────────────────

// Deduplicate by name+line (same identifier on same line reported once)
const seen = new Set();
const unique = violations.filter(v => {
  const key = `${v.name}:${v.line}`;
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
});

// Sort by line number
unique.sort((a, b) => (a.line === '?' ? Infinity : a.line) - (b.line === '?' ? Infinity : b.line));

// Split into baseline (known) and new violations
const baseline = [];
const fresh = [];
for (const v of unique) {
  const key = `${v.name}:${v.fn}`;
  if (KNOWN_VIOLATIONS.has(key)) {
    baseline.push(v);
  } else {
    fresh.push(v);
  }
}

const totalMs = Date.now() - startTime;

// Report baseline violations as warnings (unless --strict)
if (baseline.length > 0) {
  // Deduplicate baseline by name:fn for the warning summary
  const baselineSeen = new Set();
  const baselineUnique = baseline.filter(v => {
    const key = `${v.name}:${v.fn}`;
    if (baselineSeen.has(key)) return false;
    baselineSeen.add(key);
    return true;
  });
  console.log(`\n⚠ ${baselineUnique.length} known baseline violation(s) (pre-existing bugs):`);
  for (const v of baselineUnique) {
    console.log(`  line ${v.line}: '${v.name}' not in scope (in ${v.fn}) [baseline]`);
  }
}

// Report new violations as errors
if (fresh.length > 0) {
  console.log(`\n✗ ${fresh.length} NEW undefined-reference violation(s):\n`);
  for (const v of fresh) {
    console.log(`  line ${v.line}: '${v.name}' is not in scope (in ${v.fn})`);
  }
  console.log(`\n${(totalMs / 1000).toFixed(1)}s total`);
  process.exit(1);
}

// In strict mode, baseline violations also fail
if (STRICT && baseline.length > 0) {
  console.log(`\n✗ --strict mode: ${baseline.length} baseline violation(s) count as failures.`);
  console.log(`\n${(totalMs / 1000).toFixed(1)}s total`);
  process.exit(1);
}

if (unique.length === 0) {
  console.log(`\n✓ No undefined-reference violations found (${(totalMs / 1000).toFixed(1)}s total)`);
} else {
  console.log(`\n✓ No NEW violations — ${baseline.length} known baseline issue(s) only (${(totalMs / 1000).toFixed(1)}s total)`);
}
process.exit(0);
