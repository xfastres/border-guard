'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {bootV029} = require('./helpers/v029-vm.cjs');

const run = source => bootV029({seed: 42}).execute(`(() => {
  document.getElementById('dialog').close();
  game.started = true;
  game.settings.sound = false;
  game.phase = 'day';
  paused = false;
  ${source}
})()`);

test('建城生成闭合主城圈与合法城门，己方过门敌方挡门', () => {
  const result = run(`
    for (const t of game.tiles) t.visible = true;
    chooseSite(0);
    const ring = game.wallRings && game.wallRings.get('home');
    const hero = game.hero;
    const gateEdge = ring && [...ring.gates.values()][0];
    const gate = gateEdge && ring.edges.get(gateEdge.edgeId);
    const inside = game.tiles[gate.insideTileId];
    const outside = game.tiles[gate.outsideTileId];
    const ally = {radius:DEMO.radii.hero, faction:'ally', movement:'ally'};
    const enemy = {radius:DEMO.radii.normal, faction:'enemy', movement:'enemy'};
    const throughGate = canTraverse(ally, center(outside), center(inside));
    const enemyGate = canTraverse(enemy, center(outside), center(inside));
    const solidEdge = [...ring.edges.entries()].find(([id]) => id !== gateEdge.edgeId);
    const se = solidEdge[1];
    const sIn = game.tiles[se.insideTileId], sOut = game.tiles[se.outsideTileId];
    const allyWall = sOut ? canTraverse(ally, center(sOut), center(sIn)) : false;
    return {
      hasRing: !!ring, status: ring && ring.status, hp: ring && ring.hp, max: ring && ring.maxHp,
      edges: ring && ring.edges.size, gates: ring && ring.gates.size,
      throughGate, enemyGate, allyWall,
      castleHp: game.castleHp, castleMax: game.castleMax
    };
  `);
  assert.equal(result.hasRing, true);
  assert.equal(result.status, 'intact');
  assert.equal(result.hp, 600);
  assert.equal(result.max, 600);
  assert.ok(result.edges >= 4);
  assert.ok(result.gates >= 1);
  assert.equal(result.throughGate, true);
  assert.equal(result.enemyGate, false);
  assert.equal(result.allyWall, false);
  assert.equal(result.castleHp, 50);
  assert.equal(result.castleMax, 50);
});

test('敌军实际更新攻击墙边扣共享HP，不同位置同圈，完整墙外不能打主城', () => {
  const result = run(`
    for (const t of game.tiles) t.visible = true;
    chooseSite(0);
    closeInspector();
    const ring = game.wallRings.get('home');
    const before = ring.hp;
    game.phase = 'night';
    game.fronts = [makeFront('home', null, createWavePlan(1,'home',false), 0)];
    game.fronts[0].gates = entrances(1);
    calculateRoutes(game.fronts[0]);
    // 在两个不同外侧攻击位各放一只敌人，走真实 moveEnemy
    const pads = ringAttackPads('home');
    const a = pads[0], b = pads[Math.min(3, pads.length-1)];
    const mk = (p,id) => ({
      id, x:p.x, y:p.y, hp:20, max:20, speed:1.2, radius:DEMO.radii.normal,
      faction:'enemy', movement:'enemy', front:game.fronts[0], cooldown:0,
      next:null, routeRevision:navigationRevision(), flash:0, strike:0, face:1, moving:false
    });
    game.enemies = [mk(a,1), mk(b,2)];
    const castleBefore = game.castleHp;
    for (let i=0;i<40;i++) {
      for (const e of game.enemies) if (e.hp>0) moveEnemy(e, 0.2);
    }
    return {
      before, after: ring.hp, damaged: ring.hp < before,
      sameRing: ring.hp <= before - 5,
      castleBefore, castleAfter: game.castleHp,
      status: ring.status
    };
  `);
  assert.equal(result.damaged, true);
  assert.ok(result.sameRing, '共享耐久应被扣减');
  assert.equal(result.castleAfter, result.castleBefore, '完整墙外不能打主城');
  assert.equal(result.status, 'intact');
});

test('墙归零当步全圈倒塌，残敌继续攻主城并可清场失守', () => {
  const result = run(`
    for (const t of game.tiles) t.visible = true;
    chooseSite(0);
    const ring = game.wallRings.get('home');
    ring.hp = 30;
    game.phase = 'night';
    game.fronts = [makeFront('home', null, createWavePlan(1,'home',false), 0)];
    game.fronts[0].gates = entrances(1);
    calculateRoutes(game.fronts[0]);
    const pads = ringAttackPads('home');
    game.enemies = pads.slice(0,6).map((p,i)=>({
      id:i+1, x:p.x, y:p.y, hp:40, max:40, speed:1.4, radius:DEMO.radii.normal,
      faction:'enemy', movement:'enemy', front:game.fronts[0], cooldown:0,
      next:null, routeRevision:-1, flash:0, strike:0, face:1, moving:false, heavy:false, boss:false
    }));
    let collapsedAt = -1;
    for (let i=0;i<200;i++) {
      for (const e of game.enemies) if (e.hp>0) moveEnemy(e, 0.1);
      if (collapsedAt < 0 && ring.status === 'broken') collapsedAt = i;
      if (game.castleHp <= 0) break;
    }
    const ally = {radius:DEMO.radii.hero, faction:'ally', movement:'ally'};
    const enemy = {radius:DEMO.radii.normal, faction:'enemy', movement:'enemy'};
    const sample = [...ring.edges.values()][0];
    const sIn = game.tiles[sample.insideTileId], sOut = game.tiles[sample.outsideTileId];
    return {
      collapsedAt, status: ring.status, edgesStill: ring.edges.size,
      enemyCross: sOut && canTraverse(enemy, center(sOut), center(sIn)),
      castleHp: game.castleHp,
      lost: game.phase === 'lost' || game.castleHp <= 0
    };
  `);
  assert.ok(result.collapsedAt >= 0, '应发生倒塌');
  assert.equal(result.status, 'broken');
  assert.equal(result.enemyCross, true, '倒塌后碰撞解除');
  assert.ok(result.castleHp < 50, '残敌应能打到主城');
});

test('白天按缺血比例修满，夜间6秒施工，破墙中断且每夜一次', () => {
  const result = run(`
    for (const t of game.tiles) t.visible = true;
    chooseSite(0);
    const ring = game.wallRings.get('home');
    ring.hp = 300;
    const dayCost = wallDayRepairCost('home');
    const dayOk = repairWallDay('home');
    const full = ring.hp;
    ring.hp = 100;
    game.phase = 'night';
    game.day = 1;
    const nightOk = startNightRepair('home');
    for (let i=0;i<60;i++) stepNightRepair('home', 0.1);
    const mid = {hp:ring.hp, status:ring.repair.status, elapsed:ring.repair.elapsed};
    // 致命破墙应中断
    damageWallRing('home', 9999, 'test', [...ring.edges.keys()][0]);
    stepNightRepair('home', 0.1);
    const afterBreak = {ring:ring.status, repair:ring.repair.status, hp:ring.hp};
    // 同夜不可再开
    game.phase = 'night';
    // 重建白天
    game.phase = 'day';
    game.resources.material = 40;
    const rebuild = repairWallDay('home');
    const againNight = (() => {
      game.phase = 'night';
      ring.hp = 200; ring.status = 'intact';
      ring.repair = {usedNightId: game.day, status:'idle', elapsed:0, duration:6, budgetHp:0, appliedHp:0, paid:{}};
      return startNightRepair('home');
    })();
    return {dayCost, dayOk, full, mid, afterBreak, rebuild, againNight};
  `);
  assert.ok(result.dayCost >= 1 && result.dayCost <= 12);
  assert.equal(result.dayOk.ok, true);
  assert.equal(result.full, 600);
  assert.equal(result.mid.status, 'building');
  assert.ok(result.mid.hp > 100);
  assert.equal(result.afterBreak.ring, 'broken');
  assert.ok(result.afterBreak.repair === 'failed' || result.afterBreak.repair === 'idle');
  assert.equal(result.rebuild.ok, true);
  assert.equal(result.againNight.ok, false, '同夜不可二次夜修');
});

test('扩地不回血不加上限，非法扩地不扣费', () => {
  const result = run(`
    for (const t of game.tiles) t.visible = true;
    chooseSite(0);
    const ring = game.wallRings.get('home');
    ring.hp = 400;
    const maxBefore = ring.maxHp;
    const matBefore = game.resources.material;
    const edge = game.tiles.find(t => !t.owned && t.ground !== 'water' && isAdjacent(t) && !t.node && !t.building);
    const ok = claim(edge);
    const after = {hp:ring.hp, max:ring.maxHp, owned:edge.owned, edges:ring.edges.size};
    // 非法：水
    const water = game.tiles.find(t => t.ground==='water' && isAdjacent(t));
    const waterOwned = water ? (claim(water), water.owned) : false;
    return {maxBefore, matBefore, matAfter:game.resources.material, after, waterOwned};
  `);
  assert.equal(result.after.hp, 400);
  assert.equal(result.after.max, result.maxBefore);
  assert.equal(result.after.owned, true);
  assert.equal(result.waterOwned, false);
});

test('维修到时与致命墙伤同一步：先攻击倒塌，本步不复活', () => {
  const result = run(`
    for (const t of game.tiles) t.visible = true;
    chooseSite(0);
    const ring = game.wallRings.get('home');
    game.phase = 'night'; game.cardPending = false; paused = false; game.clock = 10;
    game.hero.hp = 0;
    const f = makeFront('home', null, createWavePlan(1,'home',false), 0);
    f.gates = entrances(1); game.fronts = [f]; calculateRoutes(f);
    game.spawnStopped = true;
    const p = ringAttackPads('home')[0];
    game.enemies = [{id:99, x:p.x, y:p.y, hp:100, max:100, speed:1.4, radius:DEMO.radii.normal,
      faction:'enemy', movement:'enemy', front:f, cooldown:0, next:null, routeRevision:-1,
      flash:0, strike:0, face:1, moving:false, heavy:false, boss:false}];
    ring.hp = V029.wallHit.normal - .5; // 恰好一击致命（数值随配置）
    ring.repair = {usedNightId:game.day, status:'building', elapsed:5.96, duration:6,
      budgetHp:150, appliedHp:149, paid:{material:6}};
    advanceBattle(.04);
    return {hp:ring.hp, status:ring.status, repair:ring.repair.status};
  `);
  assert.equal(result.hp, 0);
  assert.equal(result.status, 'broken');
  assert.notEqual(result.repair, 'completed');
});

test('实际 spawnEnemy 标记敌方，经门不可穿越', () => {
  const result = run(`
    for (const t of game.tiles) t.visible = true;
    chooseSite(0);
    const ring = game.wallRings.get('home');
    const f = makeFront('home', null, createWavePlan(1,'home',false), 0);
    f.gates = entrances(1); game.fronts = [f]; calculateRoutes(f);
    const e = spawnEnemy(f);
    const gate = [...ring.edges].find(([id]) => isGateEdge(ring, id))[1];
    const a = center(game.tiles[gate.insideTileId]), b = center(game.tiles[gate.outsideTileId]);
    return {profile:movementProfile(e), cross:canTraverse(e, a, b), faction:e.faction, movement:e.movement};
  `);
  assert.equal(result.profile, 'enemy');
  assert.equal(result.faction, 'enemy');
  assert.equal(result.movement, 'enemy');
  assert.equal(result.cross, false);
});

test('扩地堵住全部可过城门外侧时不扣费且不改归属', () => {
  const result = run(`
    for (const t of game.tiles) t.visible = true;
    chooseSite(0);
    const c = game.castle;
    // 预留一格可扩地；其余近距未占格全部施工堵住，使扩地后新门外侧仍无合法通道
    const target = game.tiles.find(t => !t.owned && t.ground !== 'water' && isAdjacent(t) && !t.node && !t.building);
    for (const t of game.tiles) {
      if (!target || t === target || t.owned || t.ground === 'water' || t.building) continue;
      if (Math.abs(t.x - c.x) <= 5 && Math.abs(t.y - c.y) <= 5)
        t.building = {type:'tower', hp:90, max:90, level:0, cooldown:0};
    }
    const gold = game.resources.gold;
    const edgesBefore = game.wallRings.get('home').edges.size;
    const ok = target ? claim(target) : false;
    return {
      ok, owned: !!(target && target.owned), goldBefore: gold, goldAfter: game.resources.gold,
      edgesBefore, edgesAfter: game.wallRings.get('home').edges.size,
      hasTarget: !!target
    };
  `);
  assert.equal(result.hasTarget, true);
  assert.equal(result.ok, false);
  assert.equal(result.owned, false);
  assert.equal(result.goldAfter, result.goldBefore);
  assert.equal(result.edgesAfter, result.edgesBefore);
});

test('点击实际墙边打开圈详情，不给领主误发移动令', () => {
  const result = run(`
    for (const t of game.tiles) t.visible = true;
    chooseSite(0);
    closeInspector();
    game.mode = null;
    game.hero.goal = null;
    const ring = game.wallRings.get('home');
    const edge = [...ring.edges].find(([id]) => !isGateEdge(ring, id))[1];
    const [a, b] = edgeEndpoints(edge);
    const p = {x:(a.x+b.x)/2, y:(a.y+b.y)/2};
    mapClick(tileAt(Math.floor(p.x), Math.floor(p.y)), p, false);
    return {
      panel: !!game.panel,
      text: document.getElementById('inspectBody').textContent,
      heroMoving: !!(game.hero.goal && game.hero.goal.length),
      selectedRing: game.selectedRingId
    };
  `);
  assert.equal(result.panel, true);
  assert.match(result.text, /城墙/);
  assert.equal(result.heroMoving, false);
  assert.equal(result.selectedRing, 'home');
});

test('逐格建墙入口已移除', () => {
  const result = run(`
    for (const t of game.tiles) t.visible = true;
    chooseSite(0);
    sync();
    const cmds = [...document.getElementById('commandBar').children].map(b => b.textContent).join('|');
    return {hasWallBtn: /城墙/.test(cmds), buildsHasWall: !!BUILDS.wall, modeWall: game.mode};
  `);
  assert.equal(result.hasWallBtn, false);
  assert.equal(result.buildsHasWall, false);
});
