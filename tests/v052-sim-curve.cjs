/* Border Guard v0.52 · 20-Wave Sawtooth Curve, XP, Gold & DPS/EHP Simulator
   Run: node tests/v052-sim-curve.cjs */
'use strict';

function xpForLevel(lv) {
  return Math.round(115 + Math.min(lv, 12) * 33 + Math.max(0, lv - 12) * 10);
}

function getWavePhaseMeta(w) {
  if (w <= 2)       return { tag:'爬升·初探',     kind:'climb',  mobMult:1.00, hpMult:1.00 };
  if (w <= 4)       return { tag:'爬升·合围',     kind:'climb',  mobMult:1.00, hpMult:1.06 };
  if (w === 5)      return { tag:'波峰·熔岩首领', kind:'peak',   mobMult:0.95, hpMult:1.08 };
  if (w === 6)      return { tag:'消退·筑基割草', kind:'relief', mobMult:1.20, hpMult:0.78 };
  if (w <= 9)       return { tag:'爬升·破阵强敌', kind:'climb',  mobMult:1.00, hpMult:1.04 + (w - 7) * 0.03 };
  if (w === 10)     return { tag:'波峰·死灵首领', kind:'peak',   mobMult:0.95, hpMult:1.12 };
  if (w === 11)     return { tag:'消退·金丹割草', kind:'relief', mobMult:1.22, hpMult:0.78 };
  if (w <= 14)      return { tag:'爬升·精锐狂潮', kind:'climb',  mobMult:1.00, hpMult:1.05 + (w - 12) * 0.03 };
  if (w === 15)     return { tag:'波峰·泰坦首领', kind:'peak',   mobMult:0.95, hpMult:1.14 };
  if (w === 16)     return { tag:'消退·元婴割草', kind:'relief', mobMult:1.25, hpMult:0.80 };
  if (w <= 19)      return { tag:'爬升·天劫前夜', kind:'climb',  mobMult:1.12, hpMult:1.08 + (w - 17) * 0.04 };
  return              { tag:'终极波峰·天劫魔尊', kind:'peak', mobMult:1.05, hpMult:1.15 };
}

function simulate20Waves() {
  let xp = 0, lv = 1, xpNext = xpForLevel(1);
  let totGold = 55;
  let totChests = 0;
  const milestones = {};

  console.log('Wave | Phase         | Mobs | EHP      | +XP  | Lv (rem/next)     | +Gold | TotGold | Chests | Event');
  console.log('-----+---------------+------+----------+------+-------------------+-------+---------+--------+----------------');

  for (let w = 1; w <= 20; w++) {
    const meta = getWavePhaseMeta(w);
    const scale = Math.pow(1.26, w - 1) * meta.hpMult;
    const baseMobs = Math.min(155, Math.round(48 + w * 8));
    const mobs = Math.min(185, Math.round(baseMobs * meta.mobMult));

    let avgHp, avgXp, avgGold;
    if (w === 1) {
      avgHp = 26; avgXp = 2.0; avgGold = 0.52;
    } else if (w === 2) {
      avgHp = 0.72 * 26 + 0.28 * 22;
      avgXp = 2.0; avgGold = 0.52;
    } else if (w === 3) {
      avgHp = 0.64 * 26 + 0.14 * 22 + 0.12 * 30 + 0.10 * 24;
      avgXp = 0.64 * 2 + 0.14 * 2 + 0.12 * 3 + 0.10 * 3;
      avgGold = 0.88 * 0.52 + 0.12 * 2;
    } else if (w <= 5) {
      avgHp = 0.54 * 26 + 0.16 * 22 + 0.10 * 30 + 0.10 * 24 + 0.10 * 84;
      avgXp = 0.54 * 2 + 0.16 * 2 + 0.10 * 3 + 0.10 * 3 + 0.10 * 6;
      avgGold = 0.80 * 0.52 + 0.10 * 2 + 0.10 * 3;
    } else if (w <= 9) {
      avgHp = 0.42 * 26 + 0.22 * 22 + 0.10 * 30 + 0.10 * 24 + 0.10 * 84 + 0.06 * 52;
      avgXp = 0.42 * 2 + 0.22 * 2 + 0.10 * 3 + 0.10 * 3 + 0.10 * 6 + 0.06 * 5;
      avgGold = 0.74 * 0.52 + 0.16 * 2 + 0.10 * 3;
    } else if (w <= 15) {
      avgHp = 0.32 * 26 + 0.24 * 22 + 0.10 * 30 + 0.12 * 24 + 0.12 * 84 + 0.10 * 52;
      avgXp = 0.32 * 2 + 0.24 * 2 + 0.10 * 3 + 0.12 * 3 + 0.12 * 6 + 0.10 * 5;
      avgGold = 0.68 * 0.52 + 0.20 * 2 + 0.12 * 3;
    } else {
      avgHp = 0.20 * 26 + 0.22 * 22 + 0.14 * 30 + 0.14 * 24 + 0.18 * 84 + 0.12 * 52;
      avgXp = 0.20 * 2 + 0.22 * 2 + 0.14 * 3 + 0.14 * 3 + 0.18 * 6 + 0.12 * 5;
      avgGold = 0.56 * 0.52 + 0.26 * 2 + 0.18 * 3;
    }

    const elites = w >= 2 ? (w >= 12 ? 2 : 1) : 0;
    const expectedEliteChests = w >= 2 ? (w >= 12 ? 1.25 : 1) : 0;
    const bossHp   = w === 5 ? 3000 : w === 10 ? 8800 : w === 15 ? 24000 : w === 20 ? 58000 : 0;
    const bossXp   = w === 5 ? 55 : w === 10 ? 80 : w === 15 ? 110 : w === 20 ? 150 : 0;
    const bossGold = w === 5 ? 40 : w === 10 ? 55 : w === 15 ? 80 : w === 20 ? 110 : 0;
    const bossChest = w % 5 === 0 ? 1 : 0;
    const clearBonus = 18 + w * 3;

    const waveEhp = Math.round(mobs * avgHp * scale + elites * 290 * (w >= 2 ? Math.pow(1.25, w - 2) : 1) + bossHp);
    const waveXp = Math.round(mobs * avgXp + elites * 18 + bossXp);
    const waveGold = Math.round(mobs * avgGold + elites * 12 + bossGold + clearBonus);
    totGold += waveGold;
    totChests += expectedEliteChests + bossChest;

    xp += waveXp;
    const events = [];
    while (xp >= xpNext) {
      xp -= xpNext;
      lv++;
      if (lv === 5)  { milestones.zhuji = w;  events.push('★渡劫【筑基】'); }
      if (lv === 10) { milestones.jindan = w; events.push('★渡劫【金丹】'); }
      if (lv === 15) { milestones.yuanying = w; events.push('★渡劫【元婴】'); }
      if (lv === 20) { milestones.huashen = w; events.push('★渡劫【化神】'); }
      xpNext = xpForLevel(lv);
    }
    if (w % 5 === 0) events.push(`Boss${w / 5}`);

    console.log(
      `W${String(w).padStart(2, ' ')}  | ${meta.tag.padEnd(11, ' ')} | ${String(mobs).padStart(4, ' ')} | ${String(waveEhp).padStart(8, ' ')} | ${String(waveXp).padStart(4, ' ')} | ` +
      `Lv.${String(lv).padStart(2, ' ')} (${String(xp).padStart(3, ' ')}/${String(xpNext).padStart(3, ' ')}) | ` +
      `${String(waveGold).padStart(5, ' ')} | ${String(totGold).padStart(7, ' ')} | ${totChests.toFixed(1).padStart(6, ' ')} | ${events.join(' ')}`
    );
  }

  const ok =
    milestones.zhuji === 5 &&
    milestones.jindan === 10 &&
    milestones.yuanying === 15 &&
    milestones.huashen === 19 &&
    totChests >= 22 && totChests <= 27 &&
    totGold >= 3000;

  console.log('\nMilestones:', milestones, 'Expected total chests:', totChests.toFixed(2));
  if (!ok) {
    console.error('FAIL: Sawtooth milestones, chest range, or gold curve misaligned!');
    process.exit(1);
  }
  console.log('PASS: W5(Boss1)->筑基->W6消退, W10(Boss2)->金丹->W11消退, W15(Boss3)->元婴->W16消退, W19->化神->W20终极波峰!');
}

simulate20Waves();
