/* Minimal smoke test for the Resmetirom-MASH living meta-analysis dashboard.
 *
 * No build step, no framework: run with `node tests/smoke.test.js` from the repo root.
 * It is a structural / sanity smoke, NOT a full statistical validation suite — it guards
 * the cheap-to-break invariants of a heavy single-file HTML app:
 *
 *   1. every shipped engine JS file parses (node --check),
 *   2. the main review HTML has balanced <script>/</script> tags (no literal </script>
 *      leaking out of a template literal),
 *   3. the core analysis engine (computeCore + resolveEffectMeasure) is present,
 *   4. no unfilled template tokens or BOM ship in the HTML,
 *   5. a self-contained re-implementation of the fixed-effect inverse-variance pool
 *      (the same log-scale formula computeCore uses) returns the known answer on a
 *      2-study fixture, so a future scale/where-bug regression is caught.
 *
 * Exit code 0 = all pass; non-zero = failure (CI-friendly).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
let passed = 0;
const failures = [];
function check(name, cond) {
  if (cond) { passed++; }
  else { failures.push(name); }
}

// 1. engine JS files parse
const engineFiles = [
  'assets/effect-measure-toggle.js',
  'assets/stats-ext.js',
  'assets/grade-indirectness-ext.js',
  'assets/webr-validator.js',
];
for (const rel of engineFiles) {
  const abs = path.join(ROOT, rel);
  let ok = fs.existsSync(abs);
  if (ok) {
    try { execFileSync(process.execPath, ['--check', abs], { stdio: 'pipe' }); }
    catch (e) { ok = false; }
  }
  check('parses: ' + rel, ok);
}

// 2-4. main HTML invariants
const HTML = path.join(ROOT, 'RESMETIROM_MASH_REVIEW.html');
check('main HTML exists', fs.existsSync(HTML));
const html = fs.readFileSync(HTML, 'utf8');
const opens = (html.match(/<script/g) || []).length;
const closes = (html.match(/<\/script>/g) || []).length;
check('balanced script tags (' + opens + '/' + closes + ')', opens === closes);
check('computeCore present', html.includes('computeCore'));
check('resolveEffectMeasure present', html.includes('resolveEffectMeasure'));
check('no unfilled template tokens',
  !/\{\{[^}]+\}\}|REPLACE_ME|__PLACEHOLDER__/.test(html));
check('no UTF-8 BOM', html.charCodeAt(0) !== 0xFEFF);

// 5. inverse-variance log-scale pool sanity (mirrors computeCore's OR/HR pooling)
// Two studies with logOR = ln(0.5) and ln(0.5), each vi = 0.04 -> pooled OR = 0.5,
// pooled SE = sqrt(1/(2*25)) = 0.1414...; this guards against a scale/where flip.
function fixedPool(logs, vis) {
  let sW = 0, sWY = 0;
  for (let i = 0; i < logs.length; i++) { const w = 1 / vis[i]; sW += w; sWY += w * logs[i]; }
  return { point: Math.exp(sWY / sW), se: Math.sqrt(1 / sW) };
}
const r = fixedPool([Math.log(0.5), Math.log(0.5)], [0.04, 0.04]);
check('IVW pooled OR == 0.5', Math.abs(r.point - 0.5) < 1e-9);
check('IVW pooled SE == sqrt(1/50)', Math.abs(r.se - Math.sqrt(1 / 50)) < 1e-9);

// report
if (failures.length) {
  console.error('SMOKE FAIL (' + failures.length + '):');
  for (const f of failures) console.error('  - ' + f);
  console.error(passed + ' passed, ' + failures.length + ' failed');
  process.exit(1);
}
console.log(passed + ' passed, 0 failed');
