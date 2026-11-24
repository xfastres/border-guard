'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..');
const HTML_PATH = path.join(ROOT, 'release', 'Border-Guard-v0.60-modular-preview.html');
const CHROME_BIN = process.env.CHROME_BIN || '/usr/bin/google-chrome';

test('Modular v0.60 game opens from file:// and boots on desktop and mobile viewports', () => {
  assert.ok(fs.existsSync(CHROME_BIN), `Chrome binary not found: ${CHROME_BIN}`);
  assert.ok(fs.existsSync(HTML_PATH), 'Modular game build output does not exist; run npm run build first.');

  for (const viewport of [
    { name: 'desktop', width: 1440, height: 900 },
    { name: 'mobile', width: 390, height: 844 },
  ]) {
    const dom = execFileSync(
      CHROME_BIN,
      [
        '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
        `--window-size=${viewport.width},${viewport.height}`, '--virtual-time-budget=1800', '--dump-dom',
        pathToFileURL(HTML_PATH).href,
      ],
      { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    assert.match(dom, /name="bg-build-kind" content="modular-game"/, `${viewport.name}: build marker missing`);
    assert.match(dom, /data-bg-game-booted="0\.60\.0-stage6"/, `${viewport.name}: game API did not boot`);
    assert.match(dom, /data-bg-game-wave="1"/, `${viewport.name}: initial run state missing`);
    assert.match(dom, /id="gameCanvas"/, `${viewport.name}: game canvas missing`);
    assert.match(dom, /id="topbar"/, `${viewport.name}: game HUD missing`);
  }
});
