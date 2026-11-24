import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseSync } from 'vite';

const root = fileURLToPath(new URL('../../', import.meta.url));
const src = path.join(root, 'src');
const legacy = path.join(src, 'legacy');
const frozenHash = '46049dcc8ca119f79dcc7e8b6e482a797dd794e2';
const runtimeLayers = ['ui', 'app', 'debug', 'legacy'];
const forbiddenLayers = new Map([
  ['data', ['core', 'systems', ...runtimeLayers]],
  ['core', ['systems', ...runtimeLayers]],
  ['systems', runtimeLayers],
  ['ui', ['app', 'debug', 'legacy']],
  ['debug', ['app', 'legacy']],
]);
const pureLayers = new Set(['data', 'core', 'systems']);
const browserIdentifiers = new Set([
  'document', 'window', 'localStorage', 'sessionStorage',
  'requestAnimationFrame', 'cancelAnimationFrame', 'AudioContext', 'webkitAudioContext',
]);

function filesUnder(directory) {
  return readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter(entry => !entry.isDirectory())
    .map(entry => path.join(entry.parentPath, entry.name))
    .sort();
}

function assertPure(program, label) {
  const pending = [program];
  while (pending.length) {
    const node = pending.pop();
    if (node === null || typeof node !== 'object') continue;
    if (node.type === 'Identifier') {
      assert.ok(!browserIdentifiers.has(node.name), `${label} uses browser identifier ${node.name}`);
    }
    // The parser omits comments from the tree. Template expressions remain AST nodes.
    if (node.type === 'Literal' || node.type === 'TemplateElement') continue;
    pending.push(...Object.values(node));
  }
}

function assertAcyclic(graph) {
  const visited = new Set();
  const active = new Set();

  function visit(file) {
    assert.ok(!active.has(file), `Circular dependency: ${[...active, file].map(entry => path.relative(root, entry)).join(' -> ')}`);
    if (visited.has(file)) return;
    active.add(file);
    for (const target of graph.get(file)) visit(target);
    active.delete(file);
    visited.add(file);
  }

  for (const file of graph.keys()) visit(file);
}

test('src has no circular dependencies, forbidden layer imports, or browser identifiers in pure layers', () => {
  const graph = new Map(filesUnder(src).filter(file => path.extname(file) === '.js').map(file => [file, []]));
  assert.ok(graph.size > 0, 'No JavaScript files found under src');

  for (const [file, edges] of graph) {
    const label = path.relative(root, file);
    const layer = path.relative(src, file).split(path.sep)[0];
    const forbidden = forbiddenLayers.get(layer);
    const { program, errors } = parseSync(file, readFileSync(file, 'utf8'));
    assert.deepEqual(errors, [], `Failed to parse ${label}`);
    if (pureLayers.has(layer)) assertPure(program, label);

    for (const node of program.body) {
      // The source field is present on static imports and re-exports with a module specifier.
      const specifier = node.source?.value;
      if (!specifier || !/^\.{1,2}(?:\/|$)/.test(specifier)) continue;
      const resolved = fileURLToPath(new URL(specifier, pathToFileURL(file)));
      const target = [resolved, `${resolved}.js`, path.join(resolved, 'index.js')]
        .find(candidate => statSync(candidate, { throwIfNoEntry: false })?.isFile());
      assert.ok(target, `${label} cannot resolve ${specifier}`);
      const targetLayer = path.relative(src, target).split(path.sep)[0];
      assert.ok(!forbidden?.includes(targetLayer), `${label} must not import ${path.relative(root, target)}`);
      if (graph.has(target)) edges.push(target);
    }
  }

  assertAcyclic(graph);
});

test('legacy is retired and contains at most its README', () => {
  const files = existsSync(legacy) ? filesUnder(legacy).map(file => path.relative(legacy, file)) : [];
  assert.deepEqual(files.filter(file => file !== 'README.md'), []);
});

test('the original v0.60 HTML matches its frozen Git hash and archive, and balance schema is v1', () => {
  const original = 'Border-Guard-v0.60.html';
  const archived = 'archive/baselines/Border-Guard-v0.60-before-modular.html';
  const hashes = execFileSync('git', ['hash-object', original, archived], { cwd: root, encoding: 'utf8' });
  assert.deepEqual(hashes.trim().split(/\r?\n/), [frozenHash, frozenHash]);
  assert.ok(readFileSync(path.join(root, original)).equals(readFileSync(path.join(root, archived))),
    'Frozen original and archived baseline bytes differ');
  const balance = JSON.parse(readFileSync(path.join(root, 'balance', 'v060-baseline.json'), 'utf8'));
  assert.equal(balance.schemaVersion, 1);
});
