// DECISION(v1.19.767): JSX source lives at `src/app.jsx`. This script:
//   1. Validates JSX syntax via @babel/parser (fast).
//   2. Compiles JSX → JS via @babel/core + @babel/preset-react (classic runtime,
//      same JSX semantics as the in-browser babel-standalone the project used to use).
//   3. Writes the compiled output to `public/index.bundle.js`.
//
// `public/index.html` references the bundle via <script src="index.bundle.js"></script>.
// Edits to JSX go in `src/app.jsx`. Run this script (or `bash deploy.sh`) to rebuild
// the bundle before deploying.
//
// Failure modes:
//   • Parse error → print line + message, exit 1, deploy aborts.
//   • Babel transform error → print, exit 1.
//   • Filesystem error → print, exit 1.
//
// History: first attempted in v1.19.762; reverted in v1.19.765 due to a Temporal Dead
// Zone violation that was tolerated by babel-standalone but exposed by strict transform.
// Underlying bug fixed in v1.19.766; bundle approach re-enabled in v1.19.767.

const parser = require('./node_modules/@babel/parser');
const babel = require('@babel/core');
const fs = require('fs');

const SRC_PATH = 'src/app.jsx';
const BUNDLE_PATH = 'public/index.bundle.js';

if (!fs.existsSync(SRC_PATH)) {
  console.error(`Source not found at ${SRC_PATH}.`);
  process.exit(1);
}
const js = fs.readFileSync(SRC_PATH, 'utf8');
console.log('Source length:', js.length, 'first 60:', JSON.stringify(js.substring(0, 60)));

// Step 1: parse — fast syntax check.
try {
  parser.parse(js, { plugins: ['jsx'], sourceType: 'module' });
  console.log('JSX OK');
} catch (e) {
  console.error('JSX ERROR line', e.loc && e.loc.line, ':', e.message.substring(0, 200));
  process.exit(1);
}

// Step 2: transform JSX → JS. preset-react with `runtime: 'classic'` matches
// behavior of the previously-used in-browser babel-standalone for JSX semantics.
let compiled;
try {
  const result = babel.transformSync(js, {
    presets: [['@babel/preset-react', { runtime: 'classic' }]],
    sourceType: 'script', // not module — bundle runs as a classic script tag, must share global scope with inline scripts
    babelrc: false,
    configFile: false,
    filename: 'src/app.jsx',
  });
  compiled = result.code;
  console.log('Compiled bundle length:', compiled.length);
} catch (e) {
  console.error('Babel transform ERROR:', e.message.substring(0, 400));
  process.exit(1);
}

// Step 3: write bundle file.
fs.writeFileSync(BUNDLE_PATH, compiled, 'utf8');
console.log('Wrote', BUNDLE_PATH);
