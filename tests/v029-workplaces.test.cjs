'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {bootV029} = require('./helpers/v029-vm.cjs');

const run = source => bootV029({seed: 42}).execute(`(() => {
  document.getElementById('dialog').close();
  game.started = true;
  game.settings.sound = false;
  game.phase = 'day';
  for (const t of game.tiles) Object.assign(t, {ground:'grass', cover:'none', node:null, building:null, campSolid:false, owned:true, visible:true});
  game.residents = [];
  game.camps = [];
  const home = tileAt(5,5);
  home.building = {type:'castle'};
  game.castle = home;
  Object.assign(game.hero, center(tileAt(5,4)));
  game.actions = 7;
  game.resources = {material:30,gold:30,food:30,rare:0};
  if(!game.productionBuildings) game.productionBuildings = new Map();
  if(!game.dockReservations) game.dockReservations = new Map();
  ${source}
})()`);

test('工人派遣通过正常居民更新实际抵达工作建筑，不回主城两旁', () => {
  const result = run(`
    const r = addResident();
    const t = tileAt(10,5);
    const id = 'lumber-test';
    game.productionBuildings = new Map([[id,{id,type:'lumber',tileId:at(t.x,t.y),active:true,docks:[at(t.x,t.y)],assignedResidentIds:[]}]]);
    game.dockReservations = new Map();
    const accepted = assignWorker(r.id,id).ok;
    let travelWorkMax = r.work.workSeconds||0, sawTravel = r.work.state==='travel';
    for(let i=0;i<600;i++){
      if(r.work.state==='travel'){ sawTravel = true; travelWorkMax = Math.max(travelWorkMax, r.work.workSeconds||0); }
      updateResidents(.045);
      if(r.work.state==='travel') travelWorkMax = Math.max(travelWorkMax, r.work.workSeconds||0);
    }
    const after = {x:r.x,y:r.y};
    for(let i=0;i<40;i++) updateResidents(.045);
    return {
      accepted, working:r.work.state==='working', atDock:workerAtDock(r),
      distance:distance(r,center(t)), travelWorkMax, sawTravel,
      stayed:distance(r,after)<=.02, castleDist:distance(r,center(game.castle))
    };
  `);
  assert.equal(result.accepted, true);
  assert.equal(result.working, true);
  assert.equal(result.atDock, true);
  assert.ok(result.distance <= .085, `工人离工作格还有 ${result.distance} 格`);
  assert.ok(result.sawTravel, '应真实赶路过');
  assert.equal(result.travelWorkMax, 0, '到岗前不计工作秒数');
  assert.ok(result.stayed, '到岗后更新不应被拉回主城');
  assert.ok(result.castleDist > .5, '工人不应停在主城两旁');
});

test('资源开发会清除原树石覆盖并创建对应生产建筑', () => {
  const result = run(`
    const t = tileAt(8,5);
    Object.assign(t,{ground:'trees',cover:'forest',node:{kind:'wood',developed:false}});
    develop(t);
    return {developed:t.node.developed,cover:tileCover(t),type:t.building?.type||null,kind:t.node.kind};
  `);
  assert.equal(result.developed, true);
  assert.equal(result.cover, 'none');
  assert.ok(result.type && result.type !== 'tower', '林场必须有自己的生产建筑类型');
  assert.equal(result.kind, 'wood', '必须保留资源节点身份');
});

test('居民详情必须提供可操作的移动入口', () => {
  const result = run(`
    const r = addResident();
    openInspector(tileOf(r),r.id);
    sync();
    return document.getElementById('inspectBody').textContent;
  `);
  assert.match(result, /移动/);
});

test('工作时点击移动会到达新位置并停留，随后可改派到另一建筑', () => {
  const result = run(`
    const r = addResident();
    const a = tileAt(10,5), b = tileAt(12,5), dest = tileAt(8,7);
    game.productionBuildings = new Map([
      ['A',{id:'A',type:'lumber',tileId:at(a.x,a.y),active:true,docks:[at(a.x,a.y)],assignedResidentIds:[]}],
      ['B',{id:'B',type:'farm',tileId:at(b.x,b.y),active:true,docks:[at(b.x,b.y)],assignedResidentIds:[]}]
    ]);
    game.dockReservations = new Map();
    assignWorker(r.id,'A');
    for(let i=0;i<600;i++) updateResidents(.045);
    const atA = workerAtDock(r) && r.work.state==='working';
    const moved = orderResidentMove(r.id, dest).ok;
    for(let i=0;i<600;i++) updateResidents(.045);
    const afterMove = {dist:distance(r,center(dest)), work:r.work.state, x:r.x, y:r.y};
    for(let i=0;i<30;i++) updateResidents(.045);
    const stayed = distance(r,{x:afterMove.x,y:afterMove.y})<=.02;
    const reassigned = assignWorker(r.id,'B').ok;
    for(let i=0;i<600;i++) updateResidents(.045);
    return {atA, moved, afterMove, stayed, reassigned, atB:workerAtDock(r)&&r.work.buildingId==='B',
      docksA:game.dockReservations.get(at(a.x,a.y)), docksB:game.dockReservations.get(at(b.x,b.y))};
  `);
  assert.equal(result.atA, true);
  assert.equal(result.moved, true);
  assert.ok(result.afterMove.dist <= .085, '移动未到达');
  assert.equal(result.afterMove.work, 'idle');
  assert.ok(result.stayed, '移动结束后被拉走');
  assert.equal(result.reassigned, true);
  assert.equal(result.atB, true);
  assert.equal(result.docksA, undefined);
  assert.equal(result.docksB, 1, '改派后应独占新岗');
});

test('六种资源开发前后己方均可穿行，且开发后旧图标与箭塔兜底不参与同格绘制', () => {
  const result = run(`
    const kinds = ['farm','wood','stone','mine','rich','iron'];
    const probe = addResident();
    Object.assign(probe, center(tileAt(6,5)));
    const startId = at(6,5);
    const pass = [];
    const draws = [];
    for(let i=0;i<kinds.length;i++){
      const t = tileAt(7+i, 8);
      const cover = ['wood'].includes(kinds[i]) ? 'forest' : ['farm'].includes(kinds[i]) ? 'none' : 'mountain';
      const ground = cover==='forest'?'trees':cover==='mountain'?'rock':'grass';
      Object.assign(t,{ground,cover,node:{kind:kinds[i],developed:false},building:null,field:kinds[i]==='farm'});
      const before = findPathFor(probe, startId, at(t.x,t.y));
      develop(t);
      const around = dirs.map(([dx,dy])=>tileAt(t.x+dx,t.y+dy)).find(n=>n&&canStand(probe,center(n)));
      const after = around ? findPathFor(probe, startId, at(around.x,around.y)) : {ok:false};
      pass.push({kind:kinds[i], before:before.ok, after:after.ok, cover:tileCover(t), type:t.building?.type, node:t.node.kind, developed:t.node.developed});
    }
    const log = [];
    const _structure = structure, _nodeArt = nodeArt, _foliage = drawFoliage;
    structure = function(t){ log.push(['structure', t.building&&t.building.type]); return _structure(t); };
    nodeArt = function(t){ log.push(['nodeArt', t.node&&t.node.kind]); return _nodeArt(t); };
    drawFoliage = function(t){ log.push(['foliage', t.x+','+t.y]); return _foliage(t); };
    draw();
    for(const t of game.tiles){
      if(!t.node||!t.node.developed) continue;
      const cell = log.filter(e => (e[0]==='structure'||e[0]==='nodeArt'||e[0]==='foliage'));
      draws.push({
        kind:t.node.kind, type:t.building.type,
        structure:log.some(e=>e[0]==='structure'&&e[1]===t.building.type),
        nodeArt:log.some(e=>e[0]==='nodeArt'&&e[1]===t.node.kind),
        foliage:log.some(e=>e[0]==='foliage'&&e[1]===(t.x+','+t.y)),
        tower:log.some(e=>e[0]==='structure'&&e[1]==='tower'&&t.building.type!=='tower')
      });
    }
    structure=_structure; nodeArt=_nodeArt; drawFoliage=_foliage;
    return {pass, draws};
  `);
  for(const row of result.pass){
    assert.equal(row.before, true, row.kind+' 开发前应可走');
    assert.equal(row.after, true, row.kind+' 开发后邻格应可走');
    assert.equal(row.cover, 'none', row.kind+' 应清 cover');
    assert.ok(row.type && row.type !== 'tower', row.kind+' 应有专属建筑');
    assert.equal(row.node, row.kind);
    assert.equal(row.developed, true);
  }
  for(const row of result.draws){
    assert.equal(row.structure, true, row.kind+' 应走专属 structure');
    assert.equal(row.nodeArt, false, row.kind+' 开发后不应再画旧资源图标');
    assert.equal(row.foliage, false, row.kind+' 开发后不应再画树石 foliage');
    assert.equal(row.tower, false, row.kind+' 不得落入箭塔兜底');
  }
});

test('调回城堡按钮调用 recallHomeResident，不被营地 recallResident 覆写', () => {
  const result = run(`
    const r = addResident();
    const t = tileAt(9,5);
    Object.assign(t,{ground:'trees',cover:'forest',node:{kind:'wood',developed:false}});
    develop(t);
    assignWorker(r.id, t.building.productionId);
    for(let i=0;i<600;i++) updateResidents(.045);
    openInspector(tileOf(r), r.id);
    sync();
    const body = document.getElementById('inspectBody');
    const btn = [...body.querySelectorAll('button')].find(b => b.textContent.includes('调回'));
    if(!btn) return {hasBtn:false, text:body.textContent};
    let threw = null;
    try { btn.click(); } catch (e) { threw = String(e && e.message || e); }
    sync();
    return {
      hasBtn:true, threw,
      work:r.work.state,
      reserved:[...game.dockReservations.entries()].length,
      homeFn: typeof recallHomeResident,
      campFn: typeof recallResident,
      campArity: recallResident.length
    };
  `);
  assert.equal(result.hasBtn, true);
  assert.equal(result.threw, null, '点击调回不应抛错');
  assert.equal(result.homeFn, 'function');
  assert.equal(result.campFn, 'function');
  assert.equal(result.campArity, 2, '营地调回应仍是 (r,c)');
  assert.equal(result.work, 'idle');
  assert.equal(result.reserved, 0);
});

test('开发后工人站在该建筑可见工作区内，而不是邻格', () => {
  const result = run(`
    const r = addResident();
    const t = tileAt(10,5);
    Object.assign(t,{ground:'trees',cover:'forest',node:{kind:'wood',developed:false}});
    develop(t);
    const id = t.building.productionId;
    const accepted = assignWorker(r.id, id).ok;
    for(let i=0;i<700;i++) updateResidents(.045);
    const work = productionWorkPos(at(t.x,t.y));
    return {
      accepted, working:r.work.state==='working', atDock:workerAtDock(r),
      dock:r.work.dockTileId, buildingTile:at(t.x,t.y),
      dist:distance(r, work),
      onBuildingTile: Math.floor(r.x)===t.x && Math.floor(r.y)===t.y
    };
  `);
  assert.equal(result.accepted, true);
  assert.equal(result.working, true);
  assert.equal(result.atDock, true);
  assert.equal(result.dock, result.buildingTile);
  assert.ok(result.onBuildingTile, '工人应站在建筑格内');
  assert.ok(result.dist <= .085, '应贴近可见工作平台');
});

test('拆除生产建筑会释放岗位，不留双岗重复预约', () => {
  const result = run(`
    const r = addResident();
    const t = tileAt(9,5);
    Object.assign(t,{ground:'trees',cover:'forest',node:{kind:'wood',developed:false}});
    develop(t);
    const id = t.building.productionId;
    assignWorker(r.id, id);
    for(let i=0;i<600;i++) updateResidents(.045);
    const before = {working:r.work.state, reserved:[...game.dockReservations.keys()].length, assigned:game.productionBuildings.get(id).assignedResidentIds.slice()};
    salvage(t);
    return {before, work:r.work, reserved:[...game.dockReservations.entries()], buildings:game.productionBuildings.size, building:t.building};
  `);
  assert.equal(result.before.working, 'working');
  assert.equal(result.work.state, 'idle');
  assert.equal(result.reserved.length, 0);
  assert.equal(result.buildings, 0);
  assert.equal(result.building, null);
});
