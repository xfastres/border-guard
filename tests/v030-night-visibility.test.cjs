// Night movement regression: scouts and enemies remain visible to the moving lord.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {bootV029} = require('./helpers/v029-vm.cjs');

function moveIntoUnseenTileAtNight(){
  const vm = bootV029({seed:42});
  return vm.execute(`(()=>{
    document.getElementById('dialog').open=false; game.started=true;
    for(const t of game.tiles)if(Math.abs(t.x-5)<=3&&Math.abs(t.y-4)<=3)t.visible=true;
    game.hero.x=8.5;game.hero.y=5.5;chooseSite(0);game.cardPending=false;startNight();
    const steps=[[1,0,'d'],[-1,0,'a'],[0,1,'s'],[0,-1,'w']];
    let move=null;
    for(const t of game.tiles){
      if(!t.visible||!walkable(t))continue;
      for(const [dx,dy,key] of steps){
        const next=tileAt(t.x+dx,t.y+dy);
        if(next&&!next.visible&&walkable(next)){move={t,next,key};break;}
      }
      if(move)break;
    }
    if(!move)throw new Error('fixture has no visible-to-unseen walkable edge');
    Object.assign(game.hero,center(move.t));
    game.clock=2;game.panel=false;setCameraMode('manual');
    const enemy={...center(move.next),id:999,front:game.fronts[0],hp:20,max:20,boss:false,heavy:false,
      radius:.22,speed:0,cooldown:0,flash:0,next:null,face:1,moving:false,
      faction:'enemy',movement:'enemy',routeRevision:navigationRevision(),settled:false};
    game.enemies=[enemy];keys.add(move.key);tickCampaign(.25);keys.clear();
    return {phase:game.phase,visible:move.next.visible,enemyTile:move.next,hero:{x:game.hero.x,y:game.hero.y},cameraMode:camera.mode};
  })()`);
}

test('夜间领主走进迷雾时点亮新地块，使敌人不再被迷雾遮挡',()=>{
  const result=moveIntoUnseenTileAtNight();
  assert.equal(result.visible,true,'夜间移动应揭开领主周围的新地块，让该处敌人可见');
});

test('夜间领主移动会恢复相机跟随',()=>{
  const result=moveIntoUnseenTileAtNight();
  assert.equal(result.cameraMode,'follow','领主移动后相机应进入跟随模式');
});

test('领主仍在前往城址时建城，不会取消跟随镜头',()=>{
  const vm=bootV029({seed:42});
  const mode=vm.execute(`(()=>{
    document.getElementById('dialog').open=false;game.started=true;
    const site=tileAt(5,4);site.visible=true;
    Object.assign(game.hero,{x:1.5,y:4.5});
    setDestination(site);
    chooseSite(0);
    return {goal:!!game.hero.goal?.length,mode:camera.mode};
  })()`);
  assert.equal(mode.goal,true,'建城后领主应保留前往城堡外侧的路线');
  assert.equal(mode.mode,'follow','继续移动时相机应保持跟随');
});
