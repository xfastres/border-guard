'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..');
const HTML_PATH = path.join(ROOT, 'release', 'Border-Guard-v0.60-modular-shell.html');
const CHROME_BIN = process.env.CHROME_BIN || '/usr/bin/google-chrome';

function openWithChrome(width, height) {
  assert.ok(fs.existsSync(CHROME_BIN), `Chrome binary not found: ${CHROME_BIN}`);
  assert.ok(fs.existsSync(HTML_PATH), 'Modular shell build output does not exist; run npm run build first.');

  return execFileSync(
    CHROME_BIN,
    [
      '--headless=new',
      '--no-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      `--window-size=${width},${height}`,
      '--virtual-time-budget=1200',
      '--dump-dom',
      pathToFileURL(HTML_PATH).href,
    ],
    {
      encoding: 'utf8',
      maxBuffer: 4 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
}

test('Modular shell opens from file:// and runs bootstrap on desktop and mobile viewports', () => {
  for (const viewport of [
    { name: 'desktop', width: 1440, height: 900 },
    { name: 'mobile', width: 390, height: 844 },
  ]) {
    const dom = openWithChrome(viewport.width, viewport.height);

    assert.match(dom, /data-build-kind="modular-shell"/, `${viewport.name}: build marker should remain in DOM`);
    assert.match(dom, /data-booted="true"/, `${viewport.name}: bootstrap should execute`);
    assert.match(dom, /模块化工程骨架已就绪/, `${viewport.name}: shell content should render`);
    assert.match(dom, /不是可玩的游戏版本/, `${viewport.name}: non-playable warning should remain visible`);
  }
});
