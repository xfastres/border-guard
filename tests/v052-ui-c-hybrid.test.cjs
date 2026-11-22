const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'Border-Guard-v0.52.html'), 'utf8');

test('C-Hybrid HUD keeps the existing game canvas and core HUD regions', () => {
  assert.match(html, /<canvas id="gameCanvas"><\/canvas>/);
  assert.match(html, /id="topbar"/);
  assert.match(html, /id="subbar"/);
  assert.match(html, /id="dock"/);
  assert.match(html, /id="battleHud"/);
  assert.match(html, /id="leftHud"/);
  assert.match(html, /id="battleHudBody"/);
  assert.match(html, /id="leftHudBody"/);
});

test('battle panel renders live wave, threat, health and run telemetry', () => {
  assert.match(html, /function renderBattleHud\(force\)/);
  assert.match(html, /剩余敌人/);
  assert.match(html, /威胁监测/);
  assert.match(html, /领主状态/);
  assert.match(html, /累计击杀/);
  assert.match(html, /累计伤害/);
  assert.match(html, /renderBattleHud\(force\);/);
});

test('build panel uses compact hybrid cards and preserves detail entry points', () => {
  assert.match(html, /function renderLeftHud\(force\)/);
  assert.match(html, /灵印阵盘/);
  assert.match(html, /五行羁绊/);
  assert.match(html, /构装与套装/);
  assert.match(html, /神通与组合技/);
  assert.match(html, /data-open-seal/);
  assert.match(html, /data-open-hero/);
  assert.match(html, /data-lh-unequip/);
});

test('compact screens collapse side panels and preserve the Tab shortcut', () => {
  assert.match(html, /@media \(max-width:980px\)/);
  assert.match(html, /function syncHudResponsiveMode\(\)/);
  assert.match(html, /function toggleBattleHud\(\)/);
  assert.match(html, /if \(k === 'tab'\) \{ e\.preventDefault\(\); toggleLeftHud\(\); return; \}/);
});

test('the original inspector and game QA API remain available', () => {
  assert.match(html, /id="inspector"/);
  assert.match(html, /id="inspClose"/);
  assert.match(html, /window\.BG52 = \{/);
  assert.match(html, /toggleLeftHud, toggleBattleHud/);
});
