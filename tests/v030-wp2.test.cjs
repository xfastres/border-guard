// WP2 回归：城墙 DPS 估算（纯函数）、失败诊断倒塌三字段、六步提示链 / 推荐格 / 目的地文案。
// 用法：默认加载仓库里的 Border-Guard-v0.29.html。
//   WP2_HTML_FILE=<相对仓库根的 HTML 路径> 可指向基线副本，用于「先红后绿」的红色复现。
// 本文件为纯新增；不修改 / 不删除任何既有测试断言。
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {bootV029} = require('./helpers/v029-vm.cjs');

const FILE = process.env.WP2_HTML_FILE || 'Border-Guard-v0.29.html';
const boot = (opts = {}) => bootV029({file: FILE, seed: 42, ...opts});

// 标准夹具：沿用 v030-flow / v029-ui 的建城流程，保证 game.castle / 圈墙 / fronts 齐备。
const PREP = `(()=>{
  document.getElementById('dialog').close();
  game.started = true; game.settings.sound = false;
  for (const t of game.tiles) t.visible = true;
  game.hero.x = 8.5; game.hero.y = 5.5;
  chooseSite(0); game.cardPending = false;
})()`;
function prepared(extra = ''){
  const b = boot();
  b.execute(PREP + extra);
  return b;
}
// 造一个已开发的生产建筑（含懒加载 Map 记录），返回格索引；用于 S4 → S5 的推进。
const MAKE_PRODUCTION = `(()=>{
  const t = game.tiles.find(t => t.owned && t.node && !t.node.developed && !t.building);
  if (!t) return -1;
  t.node.developed = true;
  t.building = {type: productionTypeForNode(t.node.kind) || 'lumber', productionId: 'wp2-p1'};
  game.productionBuildings = new Map([['wp2-p1', {
    id:'wp2-p1', type:t.building.type, tileId:at(t.x,t.y), active:true, docks:[], assignedResidentIds:[]
  }]]);
  return at(t.x,t.y);
})()`;
const hintState = b => b.execute(`(()=>{
  const e = document.getElementById('mapHint');
  return {text:e.textContent, next:e.classList.contains('next')};
})()`);

// ══════════════════ A. 城墙破防时间估算（§4.2 / §4.5 五组固定序列） ══════════════════

test('DPS-1 固定序列：窗口 (5,10] 内 14 点，DPS=2.8，N=36，>=30 秒不显示', () => {
  const est = boot().fw.estimateWallBreach;
  const r = est(100, 'intact', [{t:5.1,dmg:7},{t:6.0,dmg:7}], 10);
  assert.equal(r.dps, 2.8);
  assert.equal(r.seconds, 100/2.8);
  assert.equal(r.N, 36);
  assert.equal(r.show, false);
  assert.equal(r.critical, false);
  assert.equal(r.text, '');
});

test('DPS-2 窗口边界：t === now-W 严格排除，首条不计入 → DPS=1.4，N=72', () => {
  const est = boot().fw.estimateWallBreach;
  const r = est(100, 'intact', [{t:5.0,dmg:7},{t:6.0,dmg:7}], 10);
  assert.equal(r.dps, 1.4);
  assert.equal(r.seconds, 100/1.4);
  assert.equal(r.N, 72);
  assert.equal(r.show, false);
});

test('DPS-3 零伤害样本不显示估算，秒数为 Infinity', () => {
  const est = boot().fw.estimateWallBreach;
  const r = est(100, 'intact', [], 10);
  assert.equal(r.dps, 0);
  assert.equal(r.seconds, Infinity);
  assert.equal(r.show, false);
  assert.equal(r.critical, false);
  assert.equal(r.N, 0);
});

test('DPS-4 刚入夜 now<5 数据不足，即使有伤害样本也不显示', () => {
  const est = boot().fw.estimateWallBreach;
  const r = est(100, 'intact', [{t:4.0,dmg:30}], 4.9);
  assert.equal(r.show, false);
  assert.equal(r.seconds, Infinity);
  assert.equal(r.text, '');
});

test('DPS-5 回血只改分子：hp 100→200 秒数加倍，critical 按新值重判', () => {
  const est = boot().fw.estimateWallBreach;
  const samples = [{t:5.1,dmg:30}];
  const low = est(100, 'intact', samples, 10);
  const healed = est(200, 'intact', samples, 10);
  assert.equal(low.dps, 6);
  assert.equal(low.seconds, 100/6);
  assert.equal(low.N, 17);
  assert.equal(low.show, true);
  assert.equal(low.critical, true);
  assert.equal(low.text, ' · 约 17 秒破墙');
  assert.equal(healed.seconds, low.seconds * 2, '样本不变、分子翻倍 → 秒数必须精确翻倍');
  assert.equal(healed.show, false, '回升后 >=30 秒应移除追加文案');
  assert.equal(healed.critical, false);
  assert.equal(healed.text, '');
});

test('DPS-6 已倒塌 / 零血不估算；t===now 计入，t>now 与 NaN 伤害排除', () => {
  const est = boot().fw.estimateWallBreach;
  assert.equal(est(0, 'broken', [{t:9,dmg:30}], 10).show, false);
  assert.equal(est(0, 'broken', [{t:9,dmg:30}], 10).seconds, Infinity);
  assert.equal(est(100, 'intact', [{t:10,dmg:7}], 10).dps, 1.4);
  assert.equal(est(100, 'intact', [{t:10.1,dmg:7}], 10).dps, 0);
  assert.equal(est(100, 'intact', [{t:7,dmg:NaN}], 10).dps, 0);
});

test('DPS-7 采样挂在 damageWallRing()：净伤害 dealt 入样本、夜修回血不入样本、入夜重置', () => {
  const b = prepared();
  b.execute(`(()=>{createHomeWallRing();startNight();game.clock=17.3;
    damageWallRing('home',20);})()`);
  const samples = b.execute('JSON.parse(JSON.stringify(game.wallDamageSamples))');
  assert.equal(samples.length, 1);
  assert.equal(samples[0].t, 17.3);
  assert.equal(samples[0].dmg, 20, '必须记净伤害 dealt，不是意图伤害');
  const hpBefore = b.execute("game.wallRings.get('home').hp");
  b.execute("game.wallRings.get('home').hp+=10;"); // 模拟夜修回血
  assert.equal(b.execute('game.wallDamageSamples.length'), 1, '回血不得产生负样本');
  assert.equal(b.execute("game.wallRings.get('home').hp"), hpBefore + 10);
  b.execute("game.phase='day';startNight();"); // startNight() 只在白天触发；回到白天再入夜验证重置
  assert.deepEqual(b.execute('JSON.parse(JSON.stringify(game.wallDamageSamples))'), []);
});

test('DPS-8 updateBattleHud() 低于 30 秒时同一 critical 胶囊含「城墙」与「约 N 秒破墙」', () => {
  const b = prepared();
  b.execute(`(()=>{createHomeWallRing();startNight();game.clock=10;
    const ring=game.wallRings.get('home');ring.hp=100;
    game.wallDamageSamples=[{t:5.1,dmg:30}];
    document.getElementById('battleText').dataset.label='';
    updateBattleHud();})()`);
  const spans = b.execute(`(()=>[...document.getElementById('battleText').children]
    .map(s=>({cls:s.className,txt:s.textContent})))()`);
  const hits = spans.filter(s => s.cls.includes('critical') && s.txt.includes('城墙') && s.txt.includes('约'));
  assert.equal(hits.length, 1, '必须恰好一个红色城墙胶囊');
  assert.match(hits[0].txt, /约 (?:[1-9]|1\d|2\d) 秒破墙/, 'N 必须是 1–29 的整数');
  assert.match(hits[0].txt, /约 17 秒破墙/);
  // 零伤害 + 城墙满血：不追加估算、不因估算标红（既有低耐久 critical 也不应出现）
  b.execute(`(()=>{game.wallDamageSamples=[];game.wallRings.get('home').hp=game.wallRings.get('home').maxHp;
    document.getElementById('battleText').dataset.label='';updateBattleHud();})()`);
  const spans2 = b.execute(`(()=>[...document.getElementById('battleText').children]
    .map(s=>({cls:s.className,txt:s.textContent})))()`);
  assert.equal(spans2.filter(s => s.txt.includes('约') && s.txt.includes('秒破墙')).length, 0);
  assert.equal(spans2.filter(s => s.cls.includes('critical') && s.txt.includes('城墙')).length, 0);
});

// ══════════════════ B. 失败诊断含倒塌三字段（§5.2 / §5.3 / §5.4） ══════════════════

const DIAG_FULL = '第 3 夜 23 秒城墙倒塌（敌军从 西 侧集中拆墙），当时箭塔 0 座。下局在该侧城墙内放 2 座箭塔，入夜前修满城墙。';

test('DIAG-1 三字段齐全 → 完整模板逐字输出', () => {
  const b = prepared();
  b.execute("game.ledger={3:{collapseAt:23,collapseSide:'west',towersAtCollapse:0}};");
  assert.equal(b.execute('failureDiagnosis()'), DIAG_FULL);
});

test('DIAG-2 缺 collapseSide → 省略方向从句、用「敌袭侧」，不出现 undefined', () => {
  const b = prepared();
  b.execute('game.ledger={3:{collapseAt:23,towersAtCollapse:2}};');
  const d = b.execute('failureDiagnosis()');
  assert.equal(d, '第 3 夜 23 秒城墙倒塌，当时箭塔 2 座。下局在敌袭侧城墙内放 2 座箭塔，入夜前修满城墙。');
  assert.ok(!d.includes('undefined'));
});

test('DIAG-3 缺 towersAtCollapse → 省略塔数，不出现 NaN', () => {
  const b = prepared();
  b.execute("game.ledger={3:{collapseAt:23,collapseSide:'east'}};");
  const d = b.execute('failureDiagnosis()');
  assert.equal(d, '第 3 夜 23 秒城墙倒塌（敌军从 东 侧集中拆墙）。下局在该侧城墙内放 2 座箭塔，入夜前修满城墙。');
  assert.ok(!d.includes('NaN'));
});

test('DIAG-4 只有 collapseAt → 只保留时间与建议', () => {
  const b = prepared();
  b.execute('game.ledger={3:{collapseAt:23}};');
  assert.equal(b.execute('failureDiagnosis()'),
    '第 3 夜 23 秒城墙倒塌。下局在敌袭侧城墙内放 2 座箭塔，入夜前修满城墙。');
});

test('DIAG-5 旧账本无三字段 → 完全走既有 6 条分支，不出现新模板', () => {
  const b = prepared();
  b.execute('game.ledger={1:{castleDamage:0,castleRepair:0,buildingsLost:0,campsLost:[],hurt:0,dead:0}};');
  const d = b.execute('failureDiagnosis()');
  assert.ok(!d.includes('城墙倒塌（'), '旧账本不得出现倒塌模板');
  assert.ok(!d.includes('undefined') && !d.includes('NaN'));
  assert.equal(d, '本局没有留下可用箭塔。下局先在夜袭入口布防，并留一点维修资源。');
});

test('DIAG-6 多夜多次倒塌 → 取 collapseAt 有效且夜号最大的一笔', () => {
  const b = prepared();
  b.execute(`game.ledger={1:{collapseAt:5,collapseSide:'east',towersAtCollapse:1},
    4:{collapseAt:30,collapseSide:'west',towersAtCollapse:2}};`);
  assert.equal(b.execute('failureDiagnosis()'),
    '第 4 夜 30 秒城墙倒塌（敌军从 西 侧集中拆墙），当时箭塔 2 座。下局在该侧城墙内放 2 座箭塔，入夜前修满城墙。');
});

test('DIAG-7 collapseWall() 写三字段：只增不改、方向取入口、秒数取夜内 clock', () => {
  const b = prepared();
  b.execute(`(()=>{createHomeWallRing();startNight();game.clock=17.3;
    damageWallRing('home',99999);})()`);
  const book = b.execute('game.ledger[1]');
  assert.equal(book.collapseAt, 18, 'X = Math.ceil(game.clock)');
  assert.equal(book.collapseSide, 'west', '第一夜入口在 x=0 → 西');
  assert.equal(book.towersAtCollapse, 0);
  assert.equal(book.day, 1, '既有字段不得被改');
  assert.equal(book.castleDamage, 0, '既有字段不得被改');
  // 二次倒塌（幂等 / 修复后再倒）不得覆盖首次记录
  b.execute("game.ledger[1].collapseAt=99;collapseWall('home');");
  assert.equal(b.execute('game.ledger[1].collapseAt'), 99);
  // 诊断与复盘面板都带上新模板
  assert.equal(b.execute("game.phase='lost';failureDiagnosis()"),
    '第 1 夜 99 秒城墙倒塌（敌军从 西 侧集中拆墙），当时箭塔 0 座。下局在该侧城墙内放 2 座箭塔，入夜前修满城墙。');
});

test('DIAG-8 败局复盘面板 #primary .diagnosis 首行是「败局诊断」，战报仍在其后', () => {
  const b = prepared();
  b.execute(`(()=>{game.phase='lost';
    game.ledger={2:{collapseAt:19,collapseSide:'east',towersAtCollapse:1}};
    note('第 2 夜城堡耐久归零');renderUI();})()`);
  const box = b.execute(`(()=>{
    const p=document.getElementById('primary');
    const found=p.children.find(c=>c.className==='diagnosis');
    return found?found.children.map(c=>c.textContent):null;
  })()`);
  assert.ok(Array.isArray(box) && box.length >= 4);
  assert.equal(box[0], '败局诊断');
  assert.equal(box[1], '第 2 夜 19 秒城墙倒塌（敌军从 东 侧集中拆墙），当时箭塔 1 座。下局在该侧城墙内放 2 座箭塔，入夜前修满城墙。');
  assert.equal(box[2], '本局发生了什么');
  assert.match(box[3], /^· /);
});

// ══════════════════ C. 六步提示链 / 推荐格 / 目的地文案（5 项裁定） ══════════════════

test('GUIDE-1 六条固定文案逐字、不含 ▶、不含虚构资源名', () => {
  const b = boot();
  const texts = {
    S1:'从底部选 A 或 B 前往探路',
    S2:'先选择一项开局强化',
    S3:'点领地内带金色 + 的资源点，开发成生产建筑',
    S4:'点生产建筑，派遣居民去工作',
    S5:'今夜敌军从西侧来：在该侧城墙内建 1–2 座箭塔',
    S6:'准备好了可以提前入夜'
  };
  assert.equal(b.execute('tutorialStep()'), texts.S1);
  assert.ok(!Object.values(texts).some(t=>t.includes('▶')));
  assert.ok(!Object.values(texts).some(t=>/木材|石料|石头/.test(t)));
  b.execute(PREP);
  assert.equal(b.execute('tutorialStep()'), texts.S3);
  b.execute('game.cardPending=true;');
  assert.equal(b.execute('tutorialStep()'), texts.S2);
});

test('GUIDE-2 P5：未建城 + 卡牌待选异常并存时 S1 未建城优先', () => {
  const b = boot();
  b.execute('game.cardPending=true;game.cardModal=false;');
  assert.equal(b.execute('guideStep()'), 'S1');
  assert.equal(b.execute('tutorialStep()'), '从底部选 A 或 B 前往探路');
  assert.equal(b.execute('!!game.castle'), false);
});

test('GUIDE-3 累积式六步状态机 S3→S4→S5→S6，P2 一座塔即完成', () => {
  const b = prepared();
  assert.equal(b.execute('guideStep()'), 'S3');
  assert.ok(b.execute(MAKE_PRODUCTION) >= 0);
  assert.equal(b.execute('guideStep()'), 'S4', '有建筑但 0 人');
  b.execute("game.productionBuildings.get('wp2-p1').assignedResidentIds=[1];");
  assert.equal(b.execute('guideStep()'), 'S5');
  assert.equal(b.fw.towersOnSide(b.fw.defenseSide()), 0);
  b.execute(`(()=>{const s=defenseSide();
    const t=game.tiles.find(t=>(s==='west'?t.x<16:t.x>=16)&&t.owned&&canBuildAt(t)&&!t.building);
    t.building={type:'tower',hp:90,max:90};})()`);
  assert.equal(b.execute('guideStep()'), 'S6', '该侧 1 座塔即进入完成态（P2）');
  b.execute(`(()=>{const s=defenseSide();
    const t=game.tiles.find(t=>(s==='west'?t.x<16:t.x>=16)&&t.owned&&canBuildAt(t)&&!t.building);
    if(t)t.building={type:'tower',hp:90,max:90};})()`);
  assert.equal(b.execute('guideStep()'), 'S6', '2 座仍为完成态');
});

test('GUIDE-4 P3：该侧合法格不足 2 个只减少圈数，0 个也不改 S5 文案', () => {
  const b = prepared();
  b.execute(MAKE_PRODUCTION);
  b.execute("game.productionBuildings.get('wp2-p1').assignedResidentIds=[1];");
  assert.equal(b.execute('guideStep()'), 'S5');
  const before = b.execute('recommendedDefenseTiles().length');
  assert.ok(before >= 0 && before <= 2, '最多 2 个');
  // 把该侧所有 owned 格都占成建筑 → 0 个合法格
  b.execute(`(()=>{const s=defenseSide();
    for(const t of game.tiles)if(t.owned&&(s==='west'?t.x<16:t.x>=16)&&!t.building)t.building={type:'wall'};})()`);
  assert.equal(b.execute('recommendedDefenseTiles().length'), 0);
  assert.equal(b.execute('guideStep()'), 'S5', '文案仍按原样显示，不引入第 7 条');
  assert.match(b.execute('tutorialStep()'), /^今夜敌军从[西东]侧来：在该侧城墙内建 1–2 座箭塔$/);
});

test('GUIDE-5 推荐格全部合法（canBuildAt && !building）、按入口距离升序、建塔后圈消失', () => {
  const b = prepared();
  b.execute(MAKE_PRODUCTION);
  b.execute("game.productionBuildings.get('wp2-p1').assignedResidentIds=[1];");
  const tiles = b.execute(`(()=>{
    const gate=entrances(game.day)[0], gx=gate.x+.5, gy=gate.y+.5;
    return {tiles:recommendedDefenseTiles().map(t=>({x:t.x,y:t.y,idx:at(t.x,t.y),
      legal:canBuildAt(t)&&!t.building,owned:t.owned,d:Math.hypot(t.x+.5-gx,t.y+.5-gy)})),
      side:defenseSide()};
  })()`);
  assert.ok(tiles.tiles.length > 0 && tiles.tiles.length <= 2);
  assert.ok(tiles.tiles.every(t => t.legal && t.owned), '不得圈已有建筑 / 非法格');
  for(let i=1;i<tiles.tiles.length;i++)assert.ok(tiles.tiles[i-1].d <= tiles.tiles[i].d);
  assert.ok(tiles.tiles.every(t => tiles.side==='west' ? t.x<16 : t.x>=16), '不得跨侧补齐');
  // 在该侧建第 1 座塔 → towersOnSide>=1 → 圈整体消失
  b.execute(`(()=>{const s=defenseSide();
    const t=game.tiles.find(t=>(s==='west'?t.x<16:t.x>=16)&&t.owned&&canBuildAt(t)&&!t.building);
    if(t)t.building={type:'tower',hp:90,max:90};})()`);
  assert.equal(b.execute('guideStep()'), 'S6');
  assert.equal(b.execute('recommendedDefenseTiles().length'), 0);
});

test('GUIDE-6 .next 每次 renderUI 显式 toggle：激活加、让位 / day2 / 夜间 / 胜利移除', () => {
  const b = prepared();
  b.execute('renderUI();');
  let s = hintState(b);
  assert.equal(s.next, true);
  assert.equal(s.text, '点领地内带金色 + 的资源点，开发成生产建筑');
  assert.ok(!s.text.includes('▶'), '箭头由 CSS ::before 提供，文案不得手写');
  const cases = [
    ['选中工具', "game.mode='tower';"],
    ['卡牌模态', "game.mode=null;game.cardModal=true;"],
    ['入夜', "game.cardModal=false;game.phase='night';"],
    ['第 2 天', "game.phase='day';game.day=2;"],
    ['胜利', "game.day=1;game.phase='won';"]
  ];
  for(const [name, setup] of cases){
    b.execute(setup + 'renderUI();');
    s = hintState(b);
    assert.equal(b.execute('guideStep()'), null, name + ' 提示链应让位');
    assert.equal(s.next, false, name + ' .next 必须移除');
  }
  assert.equal(s.text, '拖动地图查看领地，点已探明的地点复盘。');
});

test('GUIDE-7 悬停预览只写索引；destinationLabel 各分支无 undefined / NaN / 空括号', () => {
  const b = prepared();
  assert.equal(b.execute('String(game.hoverTile)'), 'null');
  assert.equal(b.execute('typeof screenToGrid'), 'function');
  assert.equal(b.execute('at(5,4)'), 133);
  const lab = b.fw.destinationLabel;
  assert.equal(lab(null), '目的地不明');
  assert.equal(lab({x:NaN,y:2}), '目的地不明');
  assert.equal(lab(b.execute('game.castle')), '前往 主城（5,4）');
  assert.equal(lab(b.execute('tileAt(20,15)')), '前往 空地（20,15）');
  b.execute(`(()=>{const t=tileAt(20,15);t.node={kind:'wood',developed:false};})()`);
  assert.equal(lab(b.execute('tileAt(20,15)')), '前往 林场（20,15） · 待开发');
  b.execute(`(()=>{const t=tileAt(21,15);t.building={type:'tower'};})()`);
  assert.equal(lab(b.execute('tileAt(21,15)')), '前往 箭塔（21,15）');
  assert.ok(!/undefined|NaN|（）/.test([
    lab(null), lab(b.execute('game.castle')), lab(b.execute('tileAt(20,15)'))
  ].join('|')));
  // drawToolPreview 使用索引，不因悬停态抛异常
  assert.doesNotThrow(()=>b.execute("game.mode='tower';game.hoverTile=at(5,4);drawToolPreview();draw();"));
});

test('GUIDE-8 徽章人数口径与 S4 共用：0 人为「空」、派 1 人后不再是 S4', () => {
  const b = prepared();
  b.execute(MAKE_PRODUCTION);
  const t = b.execute("game.tiles.find(t=>t.building?.productionId==='wp2-p1')");
  assert.equal(b.fw.productionWorkerCountAt(t), 0);
  assert.equal(b.fw.productionWorkerCount().workers, 0);
  assert.equal(b.execute('guideStep()'), 'S4');
  b.execute("game.productionBuildings.get('wp2-p1').assignedResidentIds=[1,2];");
  assert.equal(b.fw.productionWorkerCountAt(t), 2);
  assert.equal(b.fw.productionWorkerCount().workers, 2);
  assert.notEqual(b.execute('guideStep()'), 'S4');
  // 徽章绘制只在 structure() 内追加，不破坏函数名契约
  assert.equal(b.execute('typeof structure'), 'function');
  assert.equal(b.execute('typeof nodeArt'), 'function');
  assert.equal(b.execute('typeof drawFoliage'), 'function');
  assert.doesNotThrow(()=>b.execute('draw();'));
});
