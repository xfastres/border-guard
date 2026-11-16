// v0.30 流程阻断回归：夜战清场卡死（QA-STALL-01）与穿角误判。
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {bootV029} = require('./helpers/v029-vm.cjs');

function nightWithTowers(seed, towers){
  const vm = bootV029({seed});
  return vm.execute(`(()=>{
    document.getElementById('dialog').open=false; game.started=true;
    for(const t of game.tiles)if(Math.abs(t.x-5)<=3&&Math.abs(t.y-4)<=3)t.visible=true;
    game.hero.x=8.5;game.hero.y=5.5; chooseSite(0); game.cardPending=false;
    for(const [x,y] of ${JSON.stringify(towers)}){const t=tileAt(x,y);t.building={type:'tower',hp:90,max:90,level:0,cooldown:0};}
    invalidateNavigation();
    startNight();
    for(let i=0;i<5000&&game.phase==='night';i++)tickCampaign(0.045);
    return {phase:game.phase,clock:game.clock,left:game.enemies.map(e=>[e.x,e.y])};
  })()`);
}

test('单塔守西门时，首夜一定会结束（天亮或失守），不会卡在清场', ()=>{
  for(const seed of [7, 1234, 42]){
    const r = nightWithTowers(seed, [[3,4]]);
    assert.notEqual(r.phase, 'night', 'seed '+seed+' 卡在夜战 clock='+r.clock.toFixed(1)+' 残敌='+JSON.stringify(r.left));
  }
});

test('偏离格心的敌军可以斜着回到同行相邻格，不被当成穿角', ()=>{
  const vm = bootV029({seed: 7});
  const ok = vm.execute(`(()=>{
    for(const t of game.tiles){t.ground='grass';t.cover='none';t.building=null;}
    const forest=tileAt(2,5); forest.ground='trees'; forest.cover='forest';
    const e={x:1.2,y:5.14,radius:.2,faction:'enemy',movement:'enemy'};
    // 同行回到格心偏右：只跨列边界 → 合法
    const sameRow=canTraverse(e,{x:1.2,y:5.14},{x:1.5,y:6.5});
    // 真正穿角（同时跨列与行，且旁边是森林）仍然禁止
    const e2={x:1.5,y:4.5,radius:.2,faction:'enemy',movement:'enemy'};
    const diag=canTraverse(e2,{x:1.5,y:4.5},{x:2.5,y:5.5});
    return [sameRow, diag];
  })()`);
  assert.equal(JSON.stringify(ok), JSON.stringify([true, false]));
});
