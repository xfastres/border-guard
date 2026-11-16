// WP4 回归：昼夜过渡、刷兵烟尘、三音效、圈墙受击 ringHit、效果弱化、音效/表现解耦。
// 用法：默认加载仓库里的 Border-Guard-v0.29.html。
//   WP4_HTML_FILE=<相对仓库根的 HTML 路径> 可指向改造前基线，用于「先红后绿」的红色复现。
// 本文件为纯新增；不修改 / 不删除任何既有测试断言。
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {bootV029} = require('./helpers/v029-vm.cjs');

const FILE = process.env.WP4_HTML_FILE || 'Border-Guard-v0.29.html';
const boot = (opts = {}) => bootV029({file: FILE, seed: 42, ...opts});

const PREP = `(()=>{
  document.getElementById('dialog').close();
  game.started = true; game.settings.sound = false;
  for (const t of game.tiles) t.visible = true;
  game.hero.x = 8.5; game.hero.y = 5.5;
  chooseSite(0); game.cardPending = false;
})()`;
function prepared(extra = ''){
  const b = boot();
  b.execute(PREP + ';' + extra);
  return b;
}
// VM 中的复杂返回值统一走 JSON 字符串，避免跨 realm 对象原型差异。
const run = (b, src) => JSON.parse(b.execute('JSON.stringify((()=>{' + src + '})())'));

// 受控 2D 上下文桩：只额外记录 globalAlpha 的写入，其余绘制方法为空函数。
function alphaStub(log, tag){
  const target = {};
  const stub = new Proxy(target, {
    get(o, key){
      if(key in o) return o[key];
      if(key === 'createLinearGradient' || key === 'createRadialGradient')
        return ()=>({__grad: tag, addColorStop(){}});
      if(key === 'getTransform') return ()=>({e:0, f:0});
      return ()=>{};
    },
    set(o, key, value){
      if(key === 'globalAlpha') log.push(tag + ':' + Number(value));
      o[key] = value;
      return true;
    }
  });
  for(const key of ['fillRect','clearRect','drawImage','save','restore','fill','stroke','fillText','beginPath','arc'])
    stub[key] = ()=>{};
  return stub;
}
function installAlpha(b){
  const log = [];
  const main = alphaStub(log, 'main'), off = alphaStub(log, 'off');
  b.ctx.__wp4Main = main;
  b.ctx.__wp4Light = {width:1472, height:920, getContext(){return off;}};
  b.execute('ctx=globalThis.__wp4Main; lightCanvas=globalThis.__wp4Light;');
  return log;
}
const alphas = (log, tag) => log.filter(x => x.startsWith(tag + ':')).map(x => Number(x.slice(tag.length + 1)));

// A. 昼夜过渡 -----------------------------------------------------------------

test('WP4-1 入夜后 1.5 秒夜幕 alpha 线性 0→1（game.clock 驱动，不改暗幕色值）', ()=>{
  const b = prepared();
  const log = installAlpha(b);
  b.execute('startNight();');
  for(const [clock, want] of [[0, 0], [0.75, 0.5], [1.5, 1], [3, 1]]){
    log.length = 0;
    b.execute('game.clock=' + clock + '; drawLighting(true);');
    const got = alphas(log, 'off');
    assert.equal(got.length, 1, 'clock=' + clock + '：夜幕应只设置一次 globalAlpha');
    assert.ok(Math.abs(got[0] - want) < 1e-6,
      'clock=' + clock + '：夜幕 globalAlpha 应为 ' + want + '，实测 ' + got[0]);
  }
  assert.equal(b.execute("game.phase"), 'night');
});

test('WP4-2 天亮后 1.5 秒白天暖光淡入（game.phaseElapsed 驱动，色标不变）', ()=>{
  const b = prepared();
  const log = installAlpha(b);
  for(const [elapsed, want] of [[0, 0], [0.75, 0.5], [1.5, 1]]){
    log.length = 0;
    b.execute('game.phase="day"; game.phaseElapsed=' + elapsed + '; drawLighting(false);');
    const got = alphas(log, 'main');
    assert.equal(got.length, 1, 'phaseElapsed=' + elapsed + '：暖光应只设置一次 globalAlpha');
    assert.ok(Math.abs(got[0] - want) < 1e-6,
      'phaseElapsed=' + elapsed + '：暖光 globalAlpha 应为 ' + want + '，实测 ' + got[0]);
  }
});

// B. 刷兵烟尘与弱化 -----------------------------------------------------------

test('WP4-3 spawnEnemy 产生烟尘粒子，弱化模式不产生', ()=>{
  const b = prepared('startNight();');
  const standard = run(b, `
    game.settings.effects='standard'; game.effects=[];
    const f=game.fronts[0]; spawnEnemy(f);
    return game.effects.length;`);
  const weak = run(b, `
    game.settings.effects='weak'; game.effects=[];
    const f=game.fronts[0]; spawnEnemy(f);
    return game.effects.length;`);
  assert.ok(standard >= 10, '标准模式刷兵应产生烟尘粒子，实测 ' + standard);
  assert.equal(weak, 0, '弱化模式刷兵不应推入任何 effects');
});

test('WP4-6 40 敌夜晚弱化峰值 ≤ 标准一半，且 worldFx(ring) 在弱化下不推 effects', ()=>{
  const b = prepared('startNight();');
  const peak = run(b, `
    const peak=(weak)=>{
      game.settings.effects=weak?'weak':'standard';
      game.enemies=[]; game.effects=[];
      const f=game.fronts[0];
      for(let i=0;i<40;i++)spawnEnemy(f);
      return game.effects.length;
    };
    const standard=peak(false), weak=peak(true);
    game.settings.effects='weak'; game.effects=[];
    worldFx('ring',5.5,5.5,'+1','#fff');
    return {standard,weak,ringWeak:game.effects.length};`);
  assert.ok(peak.standard > 0, '标准模式 40 敌刷兵应有粒子峰值，实测 ' + peak.standard);
  assert.ok(peak.weak <= peak.standard / 2,
    '弱化峰值 ' + peak.weak + ' 应 ≤ 标准峰值 ' + peak.standard + ' 的一半');
  assert.equal(peak.ringWeak, 0, '弱化模式 worldFx("ring") 不应推入 effects');
});

test('WP4-7 只翻转音效开关不改变 game.effects 峰值（音频与表现层解耦）', ()=>{
  const b = prepared('startNight();');
  const peaks = run(b, `
    const peak=(sound)=>{
      game.settings.sound=sound; game.settings.effects='standard';
      game.enemies=[]; game.effects=[];
      const f=game.fronts[0];
      for(let i=0;i<40;i++)spawnEnemy(f);
      return game.effects.length;
    };
    return [peak(true),peak(false)];`);
  assert.equal(peaks[0], peaks[1],
    '音效开 / 关两态的 effects 峰值必须完全相同，实测 ' + JSON.stringify(peaks));
});

// C. 三音效 -------------------------------------------------------------------

function audioBoot(){
  const b = prepared();
  // VM 的 performance.now() 默认从 0 起，会被 AudioKit 的 gap 节流误拦；推到一个远大于 gap 的时点。
  b.setSimTime(1e6);
  b.ctx.__wp4AudioLog = [];
  b.execute(`(()=>{
    game.settings.sound=true;
    AudioKit.supported=true; AudioKit.last={};
    AudioKit.ctx={state:'running',currentTime:0,destination:{},
      createOscillator(){return {
        type:'',
        frequency:{setValueAtTime(v){globalThis.__wp4AudioLog.push(['freq',v]);},
                   exponentialRampToValueAtTime(v){globalThis.__wp4AudioLog.push(['ramp',v]);}},
        connect(){},start(){},stop(){}};},
      createGain(){return {gain:{setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){}};}};
  })()`);
  return b;
}
const audioLog = b => JSON.parse(b.execute('JSON.stringify(globalThis.__wp4AudioLog)'));

test('WP4-4 三音效音色：build 上扬三角波 / dawn 两音上行 / collapse 低频方波 130→65', ()=>{
  for(const [kind, expectFreq, expectRamp] of [
    ['build', [420], [760]],
    ['dawn', [520, 660], [660, 990]],
    ['collapse', [130], [65]]
  ]){
    const b = audioBoot();
    b.execute('AudioKit.play(' + JSON.stringify(kind) + ');');
    const log = audioLog(b);
    const freqs = log.filter(x=>x[0]==='freq').map(x=>x[1]);
    const ramps = log.filter(x=>x[0]==='ramp').map(x=>x[1]);
    assert.deepEqual(freqs, expectFreq, kind + ' 的起始频率序列，实测 ' + JSON.stringify(freqs));
    assert.deepEqual(ramps, expectRamp, kind + ' 的终止频率序列，实测 ' + JSON.stringify(ramps));
    assert.ok(b.execute('AudioKit.last[' + JSON.stringify(kind) + ']') !== undefined,
      kind + ' 应写入 last 节流探针');
  }
});

test('WP4-4b 音效开关仍然有效：sound=false 不调度振荡器；关闭态 unlockAudio 不建 ctx', ()=>{
  const b = audioBoot();
  b.ctx.__wp4AudioLog.length = 0;
  b.execute(`(()=>{game.settings.sound=false;AudioKit.last={};AudioKit.play('build');})()`);
  assert.equal(audioLog(b).length, 0, 'sound=false 时不应创建任何振荡器');
  assert.equal(b.execute("Object.keys(AudioKit.last).length"), 0, '门禁之后才写 last，关闭态 last 应为空');
  b.execute(`(()=>{AudioKit.ctx=null;unlockAudio.done=false;game.settings.sound=false;unlockAudio();})()`);
  assert.equal(b.execute('AudioKit.ctx===null'), true, '关闭态 unlockAudio 不应创建 AudioContext');
  assert.equal(b.execute('AudioKit.supported===true'), true,
    '关闭态不应尝试 new AudioContext 而把 supported 置为 false');
  b.execute(`(()=>{game.settings.sound=true;unlockAudio();})()`);
  assert.equal(b.execute('unlockAudio.done===true'), true, '重新打开音效后应允许解锁');
});

// D. 圈墙受击事件 -------------------------------------------------------------

test('WP4-5 圈墙受击发且仅发 ringHit，不改伤害 / 不污染 structureHit / 保留 WP2 采样', ()=>{
  const b = prepared('startNight(); game.clock=17.3; game.combatEvents=[]; game.wallDamageSamples=[];');
  const r = run(b, `
    const ring=game.wallRings.get('home'); const before=ring.hp;
    damageWallRing('home',7,'wp4-test');
    return {before,after:ring.hp,
      ringHits:game.combatEvents.filter(e=>e.kind==='ringHit').length,
      structureHits:game.combatEvents.filter(e=>e.kind==='structureHit').length,
      samples:game.wallDamageSamples.map(s=>[s.t,s.dmg])};`);
  assert.equal(r.before - r.after, 7, '圈墙净伤害必须恰为 7，不得改伤害数值');
  assert.equal(r.ringHits, 1, '应发且仅发 1 条 ringHit');
  assert.equal(r.structureHits, 0, '不得复用 structureHit（会污染既有事件计数）');
  assert.deepEqual(r.samples, [[17.3, 7]], 'WP2 唯一权威采样内容必须保持不变');
});
