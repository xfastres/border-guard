import {
  copyFileSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = dirname(fileURLToPath(import.meta.url));
const distDir = resolve(projectRoot, '../dist');
const expectedName = 'Border-Guard-v0.60-modular-shell.html';
const builtFile = resolve(distDir, expectedName);
const releaseDir = resolve(projectRoot, '../release');
const releaseFile = resolve(releaseDir, expectedName);

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

let entries;
try {
  entries = readdirSync(distDir, { withFileTypes: true });
} catch {
  fail('dist/ does not exist. Run npm run build first.');
}

if (
  entries.length !== 1 ||
  !entries[0].isFile() ||
  entries[0].name !== expectedName
) {
  fail(
    `Expected exactly one output file (${expectedName}); found: ${entries.map((entry) => entry.name).join(', ') || '(empty)'}`,
  );
}

const html = readFileSync(builtFile, 'utf8');
if (!html.includes('name="bg-build-kind" content="modular-shell"')) {
  fail('Build marker is missing; the output may not come from the modular shell entry.');
}

const scriptTags = html.match(/<script\b[^>]*>/gi) ?? [];
if (scriptTags.length === 0 || scriptTags.some((tag) => /\bsrc\s*=/i.test(tag))) {
  fail('JavaScript is missing or an external script reference remains.');
}

const linkTags = html.match(/<link\b[^>]*>/gi) ?? [];
const externalStylesheets = linkTags.filter(
  (tag) => /\brel\s*=\s*["']stylesheet["']/i.test(tag) && /\bhref\s*=/i.test(tag),
);
if (externalStylesheets.length > 0) {
  fail('An external stylesheet reference remains.');
}

if (html.includes('/src/main.js') || html.includes('/assets/')) {
  fail('A development or external asset path remains in the output.');
}

mkdirSync(releaseDir, { recursive: true });
copyFileSync(builtFile, releaseFile);

const stats = statSync(releaseFile);
console.log(`PASS: one-file HTML build verified: release/${expectedName}`);
console.log(`PASS: ${stats.size.toLocaleString('en-US')} bytes; inline script tags: ${scriptTags.length}`);
