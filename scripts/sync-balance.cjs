// Keep the portable single-file HTML playable while maintaining JSON as the numeric source of truth.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');

function argVal(flag) {
  const idx = process.argv.indexOf(flag);
  return idx >= 0 && idx + 1 < process.argv.length ? process.argv[idx + 1] : null;
}

const isCheck = process.argv.includes('--check');
const onlyV060 = process.argv.includes('--v060');
const customConfig = argVal('--config');
const customHtml = argVal('--html');

function syncGameHtml(relConfig, relHtml, checkOnly) {
  const configPath = path.resolve(root, relConfig);
  const htmlPath = path.resolve(root, relHtml);
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  if (config.schemaVersion !== 1) throw new Error('Unsupported balance schemaVersion in ' + relConfig);
  const normRelConfig = relConfig.replace(/\\/g, '/');
  const begin = `/* BALANCE_CONFIG_START — generated from ${normRelConfig} */`;
  const end = '/* BALANCE_CONFIG_END */';
  const html = fs.readFileSync(htmlPath, 'utf8');
  const a = html.indexOf(begin), b = html.indexOf(end, a);
  if (a < 0 || b < 0 || html.indexOf(begin, a + begin.length) >= 0) {
    throw new Error(`Invalid/missing BALANCE_CONFIG markers in ${relHtml} (expected "${begin}")`);
  }
  const eol = html.includes('\r\n') ? '\r\n' : '\n';
  const replacement = (begin + '\nconst BALANCE = ' + JSON.stringify(config, null, 2) + ';\n' + end).replace(/\n/g, eol);
  const output = html.slice(0, a) + replacement + html.slice(b + end.length);
  return { config, htmlPath, html, output, matched: output === html };
}

if (customConfig && customHtml) {
  const res = syncGameHtml(customConfig, customHtml, isCheck);
  if (isCheck) {
    if (!res.matched) {
      console.error(`Balance snapshot out of sync for ${customHtml}. Run node scripts/sync-balance.cjs --config ${customConfig} --html ${customHtml}`);
      process.exit(1);
    }
    console.log(`PASS: embedded balance matches ${customConfig}`);
  } else {
    fs.writeFileSync(res.htmlPath, res.output);
    console.log(`Updated embedded balance config in ${customHtml}`);
  }
  process.exit(0);
}

if (!onlyV060) {
  const v52RelHtml = fs.existsSync(path.join(root, 'Border-Guard-v0.52.html'))
    ? 'Border-Guard-v0.52.html'
    : 'archive/versions/Border-Guard-v0.52.html';
  const v52 = syncGameHtml('balance/v052-baseline.json', v52RelHtml, isCheck);
  const labPath = path.join(root, 'balance/v052-lab.html');
  const lab = fs.readFileSync(labPath, 'utf8');
  const labBegin = '<script id="baselineData" type="application/json">';
  const labEnd = '</script>';
  const x = lab.indexOf(labBegin), y = lab.indexOf(labEnd, x + labBegin.length);
  if (x < 0 || y < 0) throw new Error('Missing lab baselineData marker');
  const labOutput = lab.slice(0, x + labBegin.length)
    + JSON.stringify(v52.config).replace(/</g, '\\u003c')
    + lab.slice(y);
  if (isCheck) {
    if (!v52.matched || labOutput !== lab) {
      console.error('Balance snapshots out of sync. Run node scripts/sync-balance.cjs');
      process.exit(1);
    }
    console.log('PASS: embedded balance matches balance/v052-baseline.json');
  } else {
    fs.writeFileSync(v52.htmlPath, v52.output);
    fs.writeFileSync(labPath, labOutput);
    console.log('Updated embedded balance config in game and browser lab');
  }
}

const v60ConfigPath = path.join(root, 'balance/v060-baseline.json');
const v60HtmlPath = path.join(root, 'Border-Guard-v0.60.html');
if (onlyV060 || (fs.existsSync(v60ConfigPath) && fs.existsSync(v60HtmlPath))) {
  const v60 = syncGameHtml('balance/v060-baseline.json', 'Border-Guard-v0.60.html', isCheck);
  if (isCheck) {
    if (!v60.matched) {
      console.error('v0.60 balance snapshot out of sync. Run node scripts/sync-balance.cjs');
      process.exit(1);
    }
    console.log('PASS: embedded balance matches balance/v060-baseline.json');
  } else {
    fs.writeFileSync(v60.htmlPath, v60.output);
    console.log('Updated embedded balance config in Border-Guard-v0.60.html');
  }
}

