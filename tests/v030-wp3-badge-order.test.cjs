// WP3 P7 ①b′ 回归：工人数徽章从 structure() 抽出、改为 sprites 之后的晚绘 pass。
// 口径 A（quality-lead 裁定）：红源 = 绘制序断言；计数 / visible 守卫为护栏。
// 用法：默认加载仓库内 Border-Guard-v0.29.html（绿跑）。
//   WP2_HTML_FILE=../bg-scratch/wp3-p7-baseline.html node --test tests/v030-wp3-badge-order.test.cjs
// 可用于红色复现（相对仓库根路径，helper 用 path.join，绝对路径会被拼坏）。
// 名称契约：drawProductionBadge 为顶层函数声明；身份 test 与守卫 test 的特性探测依赖此名。
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {bootV029, ROOT} = require('./helpers/v029-vm.cjs');

const FILE = process.env.WP2_HTML_FILE || 'Border-Guard-v0.29.html';
const boot = (opts = {}) => bootV029({file: FILE, seed: 42, ...opts});

const BADGE_RE = /^(👤\d+|空)$/u;
const BUBBLE_RE = /^(⛏|🪓|⚒|→|!|休|\?)$/u;

// 全可见 + 1 名到岗居民（working 停 dock）→ 既有工作气泡出现在 fillText 序列中。
const ARRIVED_PREP = `(()=>{
  document.getElementById('dialog').close();
  game.started = true; game.settings.sound = false;
  for (const t of game.tiles) t.visible = true;
  game.hero.x = 8.5; game.hero.y = 5.5;
  chooseSite(0); game.cardPending = false;
  game.resources.material += 40; game.resources.gold += 30;
  for (const t of game.tiles) if (t.owned && t.node && !t.node.developed) develop(t);
  while (game.residents.filter(r => r.state !== 'dead').length < 1) addResident();
  const prod = [...game.productionBuildings.values()][0];
  const r = game.residents.find(x => x.state !== 'dead');
  if (prod && r) assignWorker(r.id, prod.id);
  for (let i = 0; i < 900; i++) updateResidents(.045);
})()`;

// 只钩全局主 ctx.fillText（let ctx；cachedLayer() 的 finally 恢复同一对象）。
function captureFillText(b){
  return b.execute(`(()=>{
    window.__wp3Log = [];
    const c = ctx, orig = c.fillText;
    c.fillText = function(txt){ window.__wp3Log.push(String(txt)); };
    try { draw(); } finally { c.fillText = orig; }
    return JSON.parse(JSON.stringify(window.__wp3Log));
  })()`);
}
const indexes = (log, re) => log.map((txt, i) => re.test(txt) ? i : -1).filter(i => i >= 0);

test('P7 绘制序：所有气泡先于所有徽章（min(badgeIndices) > max(bubbleIndices)）', () => {
  const b = boot();
  b.execute(ARRIVED_PREP);
  const log = captureFillText(b);
  const badge = indexes(log, BADGE_RE);
  const bubble = indexes(log, BUBBLE_RE);
  assert.ok(bubble.length > 0, '夹具须产生工作气泡文本');
  assert.ok(badge.length > 0, '夹具须产生徽章文本');
  const minBadge = Math.min(...badge), maxBubble = Math.max(...bubble);
  assert.ok(minBadge > maxBubble,
    '徽章绘制序：min(badgeIndices)=' + minBadge + ' 必须 > max(bubbleIndices)=' + maxBubble +
    '（所有气泡先于所有徽章；用 lastBadgeIdx 会在基线假绿）');
});

test('baseline skip：待 P7 晚绘 pass 实现后启用 · 徽章计数与 t.visible 守卫', (t) => {
  const b = boot();
  // 条件性、特性探测式跳过；禁止无条件 / 静默跳过。
  if (b.execute('typeof drawProductionBadge') !== 'function') {
    t.skip('基线无守卫语义');
    return;
  }
  b.execute(ARRIVED_PREP);
  b.execute(`(()=>{
    const prods = game.tiles.filter(t => t.building && isProductionBuilding(t.building));
    const counts = [0, 2, 3, 0];
    const ids = prods.map((t, i) => t.building.productionId || ('p' + i));
    prods.forEach((t, i) => {
      if (!t.building.productionId) t.building.productionId = ids[i];
      t.visible = true;
    });
    game.productionBuildings = new Map(prods.map((t, i) => [t.building.productionId, {
      id: t.building.productionId, type: t.building.type, tileId: at(t.x, t.y),
      active: true, docks: [], assignedResidentIds: Array.from({length: counts[i] || 0}, (_, k) => 'r' + i + k)
    }]));
    if (prods[2]) prods[2].visible = false; // 不可见 + N>0（👤3 不得泄露）
  })()`);
  const visibleCount = b.execute(`game.tiles.filter(t => t.visible && t.building && isProductionBuilding(t.building)).length`);
  assert.ok(visibleCount >= 3, '混合态夹具须至少 3 个可见生产建筑');

  const mixed = captureFillText(b);
  const badgeCalls = mixed.filter(txt => BADGE_RE.test(txt));
  assert.equal(badgeCalls.length, visibleCount, '徽章 fillText 次数必须等于可见生产建筑数（不双绘、不泄露）');
  assert.ok(!badgeCalls.includes('👤3'), '不可见格 N=3 不得产生 👤3');
  assert.ok(badgeCalls.includes('空'), '须覆盖可见 + N=0 的灰色「空」');
  assert.ok(badgeCalls.some(x => /^👤\d+$/u.test(x)), '须覆盖可见 + N>0');

  b.execute(`(()=>{for(const t of game.tiles)if(t.building&&isProductionBuilding(t.building))t.visible=false;})()`);
  const hidden = captureFillText(b);
  assert.equal(hidden.filter(txt => BADGE_RE.test(txt)).length, 0, '全部不可见时不得产生任何徽章文本');
});

test('加载的 HTML 身份正证据（永不 skip，红/绿都执行都通过）', () => {
  const b = boot();
  const hasLate = b.execute('typeof drawProductionBadge');
  console.log('FILE =', FILE, '| resolved =', path.join(ROOT, FILE), '| typeof drawProductionBadge =', hasLate);
  if (process.env.WP2_HTML_FILE) {
    assert.equal(hasLate, 'undefined', '红跑必须加载 P7 未实现的基线 HTML');
    assert.ok(require('node:fs').existsSync(path.join(ROOT, FILE)), '基线快照文件必须存在');
  } else {
    assert.equal(hasLate, 'function', '绿跑必须加载已实现晚绘 pass 的 HTML');
  }
});
