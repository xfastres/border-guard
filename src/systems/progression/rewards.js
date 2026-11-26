import { getBuildRoute } from '../../core/state-queries.js';
import { PERKS, PERK_LIST } from '../../data/core-data.js';
import { GEARS } from '../../data/equipment-data.js';

export function createRewardsSystem(ctx, { meta, equipment, economy, hero }) {
  const { getActiveRunGearKeys, pickWeightedByMainLegacy, lockMetaLoadoutForRun } = meta;
  const { createGearInstance, grantGearSafely } = equipment;
  const { changeGold, getEndgameRefinementConfig } = economy;
  const { syncHeroMaxHp } = hero;

  function rollPerkChoices(quality = 'ren'){
    const count = quality === 'tian' ? 6 : quality === 'di' ? 4 : 3;
    const available = PERK_LIST.filter(p => (ctx.game.hero.perks[p.key] || 0) < 2);
    const ownedLv1 = available.filter(p => ctx.game.hero.perks[p.key] === 1);
    const commons = available.filter(p => p.rarity === 'common');
    const rares   = available.filter(p => p.rarity === 'rare');
    const epics   = available.filter(p => p.rarity === 'epic');

    const picked = [];
    const takeFrom = arr => {
      const rem = arr.filter(p => !picked.includes(p));
      if (!rem.length) return null;
      const item = rem[Math.floor(ctx.game.rnd() * rem.length)];
      picked.push(item);
      return item;
    };

    if (quality === 'tian') {
      takeFrom(epics); takeFrom(epics);
      if (ownedLv1.length && ctx.game.rnd() < 0.8) takeFrom(ownedLv1);
      while (picked.length < count) {
        const r = ctx.game.rnd();
        if (r < 0.38 && takeFrom(epics)) continue;
        if (r < 0.80 && takeFrom(rares)) continue;
        if (!takeFrom(available)) break;
      }
    } else if (quality === 'di') {
      takeFrom(rares); takeFrom(rares);
      if (ctx.game.rnd() < 0.15) takeFrom(epics);
      if (ownedLv1.length && ctx.game.rnd() < 0.65) takeFrom(ownedLv1);
      while (picked.length < count) {
        if (ctx.game.rnd() < 0.55 && takeFrom(rares)) continue;
        if (!takeFrom(commons) && !takeFrom(available)) break;
      }
    } else {
      if (ownedLv1.length && ctx.game.rnd() < 0.45) {
        const nonEpic = ownedLv1.filter(p => p.rarity !== 'epic');
        takeFrom(nonEpic);
      }
      while (picked.length < count) {
        if (ctx.game.rnd() < 0.20 && takeFrom(rares)) continue;
        if (!takeFrom(commons) && !takeFrom(rares) && !takeFrom(available)) break;
      }
    }
    return picked;
  }

  function pickPerk(key){
    const p = PERKS[key];
    if (!p || (ctx.game.hero.perks[key] || 0) >= 2) return false;
    const nextLv = (ctx.game.hero.perks[key] || 0) + 1;
    ctx.game.hero.perks[key] = Math.min(2, nextLv);
    if (key === 'blood_oath') {
      ctx.game.hero.baseMaxHp += 80;
      syncHeroMaxHp();
    } else if (key === 'dao_fortune') {
      if (nextLv === 1) {
        changeGold(35, 'perk_dao_fortune');
        const rares = getActiveRunGearKeys().filter(k => GEARS[k].rarity === 'rare');
        const rk = rares[Math.floor(ctx.game.rnd() * rares.length)];
        if (rk) grantGear(rk);
      } else if (nextLv === 2) {
        const epics = getActiveRunGearKeys().filter(k => GEARS[k].rarity === 'epic');
        const rk = epics[Math.floor(ctx.game.rnd() * epics.length)];
        if (rk) grantGear(rk);
      }
    }
    ctx.ports.audio.play('level', 1.15);
    ctx.ports.ui.toast(`词条生效！【${p.name} Lv.${ctx.game.hero.perks[key]}】`);
    ctx.ports.modals.closeModal();
    ctx.ports.ui.renderAllUI(true);
  }

  function pickChestGearChoices(legendBias = false, shrineTier = false){
    const activePool = getActiveRunGearKeys();
    const byRarity = {
      common: activePool.filter(k => GEARS[k]?.rarity === 'common').map(k => GEARS[k]),
      rare:   activePool.filter(k => GEARS[k]?.rarity === 'rare').map(k => GEARS[k]),
      epic:   activePool.filter(k => GEARS[k]?.rarity === 'epic').map(k => GEARS[k]),
      legend: activePool.filter(k => GEARS[k]?.rarity === 'legend').map(k => GEARS[k])
    };
    const specs = [];
    const takeRarity = r => {
      const pool = byRarity[r].filter(g => !specs.includes(g));
      if (!pool.length) return null;
      const g = pickWeightedByMainLegacy(pool, item => item?.elem || null, ctx.game.rnd, getBuildRoute(ctx.game)?.elem) || pool[0];
      specs.push(g);
      return g;
    };
    const w = ctx.game.wave || 1;
    if (legendBias) {
      if (w <= 6) takeRarity('epic');
      else takeRarity('legend');
    } else if (shrineTier) {
      if (w <= 6) takeRarity('rare');
      else if (w <= 15) takeRarity('epic');
      else takeRarity('legend');
    }
    while (specs.length < 3) {
      const r = ctx.game.rnd();
      let tier = 'common';
      if (legendBias) {
        if (w <= 6) tier = r < 0.30 ? 'epic' : 'rare';
        else if (w <= 15) tier = r < 0.25 ? 'legend' : 'epic';
        else tier = r < 0.45 ? 'legend' : 'epic';
      } else if (shrineTier) {
        if (w <= 6) tier = r < 0.65 ? 'rare' : 'common';
        else if (w <= 11) tier = r < 0.35 ? 'epic' : 'rare';
        else if (w <= 18) tier = r < 0.20 ? 'legend' : r < 0.75 ? 'epic' : 'rare';
        else tier = r < 0.35 ? 'legend' : 'epic';
      } else {
        if (w <= 5) tier = r < 0.25 ? 'rare' : 'common';
        else if (w <= 10) tier = r < 0.10 ? 'epic' : r < 0.55 ? 'rare' : 'common';
        else if (w <= 18) tier = r < 0.28 ? 'epic' : r < 0.80 ? 'rare' : 'common';
        else tier = r < 0.15 ? 'legend' : r < 0.65 ? 'epic' : 'rare';
      }
      if (!takeRarity(tier)) {
        const fallbackOrder = w <= 5 ? ['rare', 'common'] : w <= 10 ? ['epic', 'rare', 'common'] : ['epic', 'rare', 'legend', 'common'];
        let picked = null;
        for (const ft of fallbackOrder) {
          picked = takeRarity(ft);
          if (picked) break;
        }
        if (!picked) break;
      }
    }
    // Generate 3 real independent gear instances (independent rarity & 1/2/3 slots, locked sourceStage, filled affixes)
    const refCfg = getEndgameRefinementConfig();
    const endgameBonus = w >= (refCfg.startWave || 21) ? (refCfg.chestHighRarityAffixBonusW21Plus || 0.12) : 0;
    return specs.map(sp => {
      const inst = createGearInstance(sp.key, {
        wave: w,
        origin: legendBias ? 'boss_chest' : shrineTier ? 'shrine_chest' : 'elite_chest',
        highRarityChance: Math.min(0.70, (legendBias ? 0.32 : shrineTier ? 0.24 : 0.14) + endgameBonus),
        rndFn: ctx.game.rnd
      });
      inst.key = inst.baseKey; // keep .key alias for UI/tests
      return inst;
    });
  }

  function grantGear(input, opts = {}){
    const res = grantGearSafely(input, { origin: opts.origin || 'drop', ...opts });
    return res?.item || null;
  }

  function pickGearReward(itemOrKey){
    if (!ctx.game) return false;
    const m = ctx.game.activeModal;
    if (!m || m.type !== 'chest') return false;
    if (m.claimed) return false;
    if (!Array.isArray(m.choices) || !m.choices.length) return false;

    let matched = null;
    if (itemOrKey && typeof itemOrKey === 'object') {
      matched = m.choices.find(c => c === itemOrKey || (itemOrKey.uid && c.uid === itemOrKey.uid)) || null;
    } else if (typeof itemOrKey === 'string') {
      matched = m.choices.find(c => c.uid === itemOrKey || c.baseKey === itemOrKey) || null;
    }
    if (!matched) return false;

    // ATOMIC SINGLE-CLAIM LOCK BEFORE STATE MUTATION
    m.claimed = true;
    m.claimedChoice = matched.uid;

    if (!ctx.game.metaRunLocked) lockMetaLoadoutForRun();
    const grantRes = grantGearSafely(matched, { origin: 'chest' });
    ctx.ports.modals.closeModal();
    return grantRes?.item || matched;
  }

  return {
    rollPerkChoices,
    pickPerk,
    pickChestGearChoices,
    grantGear,
    pickGearReward,
  };
}
