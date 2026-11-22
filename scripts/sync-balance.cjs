// Keep the portable single-file HTML playable while maintaining JSON as the numeric source of truth.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const configPath = path.join(root, 'balance/v052-baseline.json');
const htmlPath = path.join(root, 'Border-Guard-v0.52.html');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
if (config.schemaVersion !== 1) throw new Error('Unsupported balance schemaVersion');
const begin = '/* BALANCE_CONFIG_START — generated from balance/v052-baseline.json */';
const end = '/* BALANCE_CONFIG_END */';
const html = fs.readFileSync(htmlPath, 'utf8');
const a = html.indexOf(begin), b = html.indexOf(end, a);
if (a < 0 || b < 0 || html.indexOf(begin, a + begin.length) >= 0) throw new Error('Invalid/missing BALANCE_CONFIG markers');
const replacement = begin + '\nconst BALANCE = ' + JSON.stringify(config, null, 2) + ';\n' + end;
const output = html.slice(0, a) + replacement + html.slice(b + end.length);
const labPath = path.join(root, 'balance/v052-lab.html');
const lab = fs.readFileSync(labPath, 'utf8');
const labBegin = '<script id="baselineData" type="application/json">';
const labEnd = '</script>';
const x = lab.indexOf(labBegin), y = lab.indexOf(labEnd, x + labBegin.length);
if (x < 0 || y < 0) throw new Error('Missing lab baselineData marker');
const labOutput = lab.slice(0, x + labBegin.length)
  + JSON.stringify(config).replace(/</g, '\\u003c')
  + lab.slice(y);
if (process.argv.includes('--check')) {
  if (output !== html || labOutput !== lab) { console.error('Balance snapshots out of sync. Run node scripts/sync-balance.cjs'); process.exit(1); }
  console.log('PASS: embedded balance matches balance/v052-baseline.json');
} else {
  fs.writeFileSync(htmlPath, output);
  fs.writeFileSync(labPath, labOutput);
  console.log('Updated embedded balance config in game and browser lab');
}
