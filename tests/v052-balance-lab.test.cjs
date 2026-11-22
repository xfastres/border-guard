'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..');
const c=JSON.parse(fs.readFileSync(path.join(root,'balance/v052-baseline.json'),'utf8'));
const balance=require('../balance/v052-engine.js');
const html=fs.readFileSync(path.join(root,'Border-Guard-v0.52.html'),'utf8');
const lab=fs.readFileSync(path.join(root,'balance/v052-lab.html'),'utf8');

test('canonical config & both embedded snapshots stay exactly synced',()=>{
 const game=html.match(/const BALANCE = ([\s\S]*?);\n\/\* BALANCE_CONFIG_END/);
 const ui=lab.match(/<script id="baselineData" type="application\/json">([\s\S]*?)<\/script>/);
 assert.ok(game);assert.ok(ui);
 assert.deepEqual(JSON.parse(game[1]),c);
 assert.deepEqual(JSON.parse(ui[1]),c);
});

test('v0.52 baseline expected wave counts and boss rounds',()=>{
 assert.deepEqual(balance.validate(c),[]);
 assert.equal(balance.waveStats(c,1).mobs,56);
 assert.equal(balance.waveStats(c,5).bossKind,'boss1');
 assert.equal(balance.waveStats(c,10).bossKind,'boss2');
 assert.equal(balance.waveStats(c,15).bossKind,'boss3');
 assert.equal(balance.waveStats(c,20).bossKind,'boss4');
 assert.equal(balance.waveStats(c,20).eliteCount,2);
});

test('late HP scaling includes the growth omitted by the old simulator',()=>{
 const w12=balance.waveStats(c,12);
 const oldFormula=Math.pow(c.wave.normalHpGrowth,11)*balance.phaseFor(c,12).hpMult;
 assert.ok(w12.scale>oldFormula*1.04,'W12 must include extra 1.05^1');
 const w20=balance.waveStats(c,20);
 assert.ok(w20.scale>Math.pow(c.wave.normalHpGrowth,19)*balance.phaseFor(c,20).hpMult*1.5);
});

test('same canonical config produces stable 20-wave expected supply',()=>{
 const a=balance.simulate(c),b=balance.simulate(JSON.parse(JSON.stringify(c)));
 assert.deepEqual(a,b);
 assert.equal(a.rows.length,20);
 assert.ok(a.rows[19].ehp>a.rows[0].ehp);
 assert.ok(a.rows[19].needDps>0);
 assert.ok(a.totalGold>c.progression.initialGold);
});

test('candidate tuning changes output without mutating the baseline',()=>{
 const copy=JSON.parse(JSON.stringify(c));
 copy.wave.normalHpGrowth=1.20;
 copy.wave.lateHpGrowthSecond=1.03;
 const base=balance.simulate(c),trial=balance.simulate(copy);
 assert.ok(trial.rows[19].ehp<base.rows[19].ehp);
 assert.equal(c.wave.normalHpGrowth,1.26);
});

test('wave stage probabilities form valid distribution',()=>{
 for(let w=1;w<=20;w++){
  for(const isHeavy of [false,true]){
   const weights=Object.values(balance.kindProbability(c,w,isHeavy));
   assert.ok(Math.abs(weights.reduce((a,b)=>a+b,0)-1)<1e-9);
   assert.ok(weights.every(x=>x>=0));
  }
 }
});


test('projected wave counts and HP scales agree with the actual game wave queue',()=>{
 const src=html.match(/<script>([\s\S]*?)<\/script>/)[1];
 const ctx2d=new Proxy({}, {get:()=>()=>{}});
 function el(id){
  const c=new Set();
  return {
   id,style:{setProperty(){}},dataset:{},hidden:false,innerHTML:'',disabled:false,
   classList:{add(x){c.add(x)},remove(x){c.delete(x)},toggle(x,forced){if(forced===true){c.add(x);return true}if(forced===false){c.delete(x);return false}if(c.has(x)){c.delete(x);return false}c.add(x);return true},contains(x){return c.has(x)}},
   addEventListener(){},append(){},appendChild(){},replaceChildren(){},querySelector(){return el('q')},querySelectorAll(){return []},
   getBoundingClientRect(){return {height:52,bottom:96,width:1280}},getContext(){return ctx2d}
  };
 }
 const cache={};
 const doc={getElementById:id=>cache[id] ||= el(id),createElement:el,documentElement:el('root'),addEventListener(){}};
 const win={innerWidth:1920,innerHeight:1080,devicePixelRatio:1,addEventListener(){}};
 const code=new Function('window','document','requestAnimationFrame','performance','setTimeout','clearTimeout',src);
 code(win,doc,()=>{},{now:()=>0},()=>0,()=>{});
 const bg=win.BG52;
 assert.ok(bg,'BG52 must be available');
 bg.startNewRun(123456,false);
 for(let wave=1;wave<=20;wave++){
  bg.game.wave=wave;
  const q=bg.buildWaveQueue(wave);
  const stat=balance.waveStats(c,wave);
  const mob=q.filter(x=>x.kind!=='elite'&&!x.kind.startsWith('boss'));
  const elites=q.filter(x=>x.kind==='elite');
  const bosses=q.filter(x=>x.kind.startsWith('boss'));
  assert.equal(mob.length,stat.mobs,'mob count W'+wave);
  assert.equal(elites.length,stat.eliteCount,'elite count W'+wave);
  assert.equal(bosses.length,stat.bossKind?1:0,'boss count W'+wave);
  assert.ok(mob.every(x=>Math.abs(x.scale-stat.scale)<1e-8),'mob scale W'+wave);
  assert.ok(elites.every(x=>Math.abs(x.scale-Math.pow(c.wave.eliteHpGrowth,wave-c.wave.eliteFirstWave))<1e-8),'elite scale W'+wave);
 }
});
