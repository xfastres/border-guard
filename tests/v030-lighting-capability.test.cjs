// v0.30 §5 契约回归：drawLighting 的渐变能力检测。
// 测试 VM 的 canvas 上下文是桩：createLinearGradient / createRadialGradient
// 可能返回空函数或 undefined。修复前白天分支与夜间 warm() 会抛 TypeError；
// 修复后应静默跳过对应绘制，且能力齐备时仍走原路径（色值 / 绘制顺序不变）。
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {bootV029} = require('./helpers/v029-vm.cjs');

// 与 v029-vm.cjs 的默认 2D 桩一致：未知属性 => 空函数；额外把绘制调用记入 log。
// 两个渐变工厂可注入 'ok' / 'undefined' / 'empty'（返回空函数，无 addColorStop）。
function contextStub(linear, radial, log, tag){
  const target = {};
  const stub = new Proxy(target, {
    get(o, key){
      if(key in o) return o[key];
      if(key === 'createLinearGradient') return (...args)=>{log.push(tag+':createLinearGradient'); return linear(...args);};
      if(key === 'createRadialGradient') return (...args)=>{log.push(tag+':createRadialGradient'); return radial(...args);};
      if(key === 'getTransform') return ()=>({e:0,f:0});
      return ()=>{};
    },
    set(o, key, value){o[key] = value; return true;}
  });
  for(const key of ['fillRect','clearRect','drawImage','save','restore','fill','stroke','fillText']){
    stub[key] = ()=>{log.push(tag+':'+key);};
  }
  return stub;
}

function gradient(kind, log){
  return ()=>({
    __grad: kind,
    addColorStop(stop, color){log.push(kind+':'+stop+':'+color);}
  });
}
const brokenUndefined = ()=>undefined;
const brokenEmptyFunction = ()=>()=>{};

// 标准夹具：沿用 v030-flow.test.cjs 的建城流程（保证 game.castle / 箭塔 warm() 可达）。
const PREP = `(()=>{
  document.getElementById('dialog').open=false; game.started=true;
  for(const t of game.tiles)if(Math.abs(t.x-5)<=3&&Math.abs(t.y-4)<=3)t.visible=true;
  game.hero.x=8.5;game.hero.y=5.5;chooseSite(0);game.cardPending=false;
})()`;

function bootDay(){const b = bootV029({seed:42}); b.execute(PREP); return b;}
function bootNight(){const b = bootV029({seed:42}); b.execute(PREP); b.execute('startNight();'); return b;}

// 把 VM 的全局 ctx 与夜间离屏 lightCanvas 换成受控桩。
function install(boot, caps){
  const log = [];
  const make = (cap, kind)=> cap === 'ok' ? gradient(kind, log)
    : cap === 'empty' ? brokenEmptyFunction : brokenUndefined;
  const main = contextStub(make(caps.mainLinear, 'day'), make(caps.mainRadial, 'warm'), log, 'main');
  const off  = contextStub(make(caps.offLinear , 'day'), make(caps.offRadial , 'hole'), log, 'off');
  boot.ctx.__v030Main = main;
  boot.ctx.__v030Off = off;
  boot.ctx.__v030LightCanvas = {width:0, height:0, getContext(){return off;}};
  boot.execute('ctx=globalThis.__v030Main;');
  return {
    log,
    setLight(){boot.execute('lightCanvas=globalThis.__v030LightCanvas;');}
  };
}

function marks(log, tag){
  const counts = {};
  for(const entry of log){
    if(!entry.startsWith(tag+':'))continue;
    const key = entry.slice(tag.length+1);
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}
function stops(log, kind){return log.filter(entry=>entry.startsWith(kind+':'));}

test('白天：createLinearGradient 能力缺失时静默跳过暖光 rect，不抛 TypeError、渲染流程走完', ()=>{
  for(const [label, cap] of [['返回 undefined','undefined'], ['返回空函数','empty']]){
    const boot = bootDay();
    const h = install(boot, {mainLinear:cap, mainRadial:'undefined'});
    assert.doesNotThrow(()=>boot.execute('draw()'), label+'：白天 draw() 不应抛 TypeError');
    const c = marks(h.log, 'main');
    assert.equal(c.clearRect, 1, label+'：draw() 应正常进入渲染');
    assert.ok(c.fillRect > 100, label+'：跳过白天暖光 rect 后其余绘制仍须执行');
    assert.deepEqual(stops(h.log, 'day'), [], label+'：不应调用白天渐变的 addColorStop');
    assert.equal(boot.execute('game.phase'), 'day');
  }
});

test('夜间：两种渐变能力都缺失（§5 canvas 桩场景）时 draw() 不抛异常、渲染流程走完', ()=>{
  const boot = bootNight();
  const h = install(boot, {
    mainLinear:'undefined', mainRadial:'undefined', offLinear:'undefined', offRadial:'undefined'
  });
  h.setLight();
  assert.doesNotThrow(()=>boot.execute('draw()'), '夜间 draw() 不应抛 TypeError');
  const c = marks(h.log, 'main');
  assert.equal(c.clearRect, 1, 'draw() 应正常进入渲染');
  assert.ok(c.fillRect > 0, '夜幕/其余绘制仍须执行');
  assert.equal(boot.execute('game.phase'), 'night');
});

test('夜间：离屏层能力齐备但主 ctx 径向渐变缺失时，warm() 整段跳过且不抛异常', ()=>{
  const boot = bootNight();
  const h = install(boot, {
    mainLinear:'undefined', mainRadial:'undefined', offLinear:'undefined', offRadial:'ok'
  });
  h.setLight();
  assert.doesNotThrow(()=>boot.execute('draw()'), '主 ctx 径向渐变缺失时 warm() 不应抛 TypeError');
  const c = marks(h.log, 'main');
  assert.equal(c.clearRect, 1, 'draw() 应正常进入渲染');
  assert.ok(c.drawImage >= 1, '夜幕离屏层仍须合成');
  assert.ok(c.fillRect > 0, '其余绘制仍须执行');
  assert.ok(stops(h.log, 'hole').length > 0, '离屏光孔（不受 warm() 影响）仍须绘制');
  assert.deepEqual(stops(h.log, 'warm'), [], 'warm() 应整体跳过，不产生暖光渐变色标');
});

test('能力齐备时白天仍走原线性渐变路径（色值与 rect 调用不变）', ()=>{
  const boot = bootDay();
  const h = install(boot, {mainLinear:'ok', mainRadial:'ok'});
  assert.doesNotThrow(()=>boot.execute('draw()'));
  assert.deepEqual(stops(h.log, 'day'), [
    'day:0:rgba(255,240,190,.10)',
    'day:1:rgba(40,70,30,.08)'
  ], '白天暖光渐变两条色标必须与修复前一致');
  const c = marks(h.log, 'main');
  assert.equal(c.createLinearGradient, 1, '白天渐变只创建一次，沿用原路径');
  assert.ok(c.fillRect > 100, '白天暖光 rect 仍执行');
});

test('能力齐备时夜间仍走原暖光径向渐变路径（色值不变）', ()=>{
  const boot = bootNight();
  const h = install(boot, {mainLinear:'ok', mainRadial:'ok', offLinear:'ok', offRadial:'ok'});
  h.setLight();
  assert.doesNotThrow(()=>boot.execute('draw()'));
  const warm = stops(h.log, 'warm');
  assert.ok(warm.includes('warm:1:rgba(255,170,70,0)'), '暖光渐变末端色值必须与修复前一致');
  assert.ok(warm.includes('warm:0:rgba(255,170,70,0.22)'), '主城暖光 alpha 必须与修复前一致');
  assert.ok(stops(h.log, 'hole').length > 0, '夜幕离屏光孔仍须绘制');
  assert.ok(marks(h.log, 'main').drawImage >= 1, '夜幕离屏层仍须合成');
});
