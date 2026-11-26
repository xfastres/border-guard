import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const [countArg = '24', repo = '.', mode = 'campaign'] = process.argv.slice(2);
const count = Number(countArg);
if (!Number.isInteger(count) || count < 1 || !['campaign', 'boss'].includes(mode)) {
  throw new Error('Usage: node scripts/simulate-balance.mjs <seed count> <checkout> <campaign|boss>');
}
const fromRepo = file => import(pathToFileURL(resolve(repo, file)));
const [{ createRuntimeContext }, { createGameSystems }, { createDebugPresets }, data, { mulberry32 }] = await Promise.all([
  fromRepo('src/core/runtime-context.js'), fromRepo('src/app/bootstrap.js'), fromRepo('src/debug/presets.js'),
  fromRepo('src/data/index.js'), fromRepo('src/core/rng.js'),
]);
const { W, H, ENEMY_SPECS, GEARS, HERO_SKILL_STARTERS, BUILD_ROUTES } = data;
const STEP = 0.05;
const strategies = ['random', 'generalist', 'basic', 'focused', 'expert'];
const routes = BUILD_ROUTES ? Object.keys(BUILD_ROUTES) : ['fire', 'frost'];
const fallbackRoutes = {
  fire: { skill: 'firewave', elem: 'fire', direction: 'fire_chain_surge' },
  frost: { skill: 'nova', elem: 'frost', direction: 'frost_bastion_counter' },
};

function plannedHealth(queue) {
  const totals = { normal: 0, elite: 0, boss: 0 };
  for (const entry of queue) {
    const spec = ENEMY_SPECS[entry.kind];
    const category = spec.boss ? 'boss' : spec.elite ? 'elite' : 'normal';
    totals[category] += Math.round(spec.hp * entry.scale);
  }
  return totals;
}

function harness(seed) {
  const ctx = createRuntimeContext();
  const systems = createGameSystems(ctx);
  let clock = 1000;
  let aim = null;
  const noop = () => {};
  const keys = new Set();
  const open = () => {
    const game = ctx.game;
    const modal = game.activeModal = game.pendingModals.shift() ?? null;
    if (modal?.type === 'starter') modal.choices = HERO_SKILL_STARTERS ?? ['blades', 'firewave', 'nova'];
    if (modal?.type === 'levelup') {
      modal.choices = systems.w10.rollSkillChoices?.() ?? [];
      if (!systems.w10.rollSkillChoices) {
        const pool = systems.unlock.getUnlockedSkillPool().filter(key => (game.hero.skills[key] || 0) < 5);
        while (pool.length && modal.choices.length < 3) {
          modal.choices.push(pool.splice(Math.floor(game.rnd() * pool.length), 1)[0]);
        }
      }
    }
    if (modal?.type === 'chest') modal.choices = systems.rewards.pickChestGearChoices(modal.legend, modal.shrineTier);
    if (modal?.type === 'perk') modal.choices = systems.rewards.rollPerkChoices(modal.quality);
  };
  const close = () => {
    open();
    if (!ctx.game.activeModal) systems.run.syncW29FinalPrepStart();
  };
  ctx.bindPorts({
    clock: { nowMs: () => 1700000000000 + clock, perfNow: () => clock },
    input: { getKeys: () => keys, getPointerWorld: () => aim },
    modals: {
      queueModal(modal) {
        ctx.game.pendingModals.push(modal);
        if (!ctx.game.activeModal) open();
      },
      closeModal: close,
      openNextModal: open,
    },
  });
  systems.run.startNewRun(seed, true);
  const presets = createDebugPresets(ctx, { systems, ui: {
    modals: { closeModal: close },
    viewport: { fitCamera: noop, updateCamera: noop },
    hud: { renderAllUI: noop },
  } });
  return {
    ctx, systems, presets, close,
    aimAt: target => { aim = target; },
    step: () => { clock += STEP * 1000; systems.run.tick(STEP); },
  };
}

function rngFor(seed) {
  if (mulberry32) return mulberry32(seed ^ 0x9e3779b9);
  let state = seed ^ 0x9e3779b9;
  return () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296);
}

function run(seed, style, routeKey, trial = null) {
  const h = harness(seed);
  const { ctx, systems: s } = h;
  const route = BUILD_ROUTES?.[routeKey] ?? fallbackRoutes[routeKey];
  const rnd = rngFor(seed);
  const tier = { common: 1, rare: 2, epic: 3, legend: 4 };
  const intentional = ['focused', 'expert'].includes(style);
  const quality = gear => {
    const mod = GEARS[gear.baseKey]?.mod ?? {};
    const direct = (mod.dmgPct || 0) * 6 + (mod.aspd || 0) * 3 + (mod.crit || 0) * 2;
    const compatible = gear.affixes?.filter(a => route.affixes?.includes(a?.id)).length ?? 0;
    return (tier[gear.rarity] ?? 1) * 2 + (gear.sourceStage ?? 1) * 1.1 + (gear.enhanceLv ?? 0) * 0.75
      + (gear.slotsCount ?? 1) * 0.4 + (intentional ? direct + (gear.elem === route.elem ? 1.8 : 0) + compatible * 2.0 : 0);
  };
  const choose = (list, score) => style === 'random' ? list[Math.floor(rnd() * list.length)]
    : list.reduce((best, entry) => best && score(best) >= score(entry) ? best : entry, null);
  if (trial) h.presets.loadTestPreset({ wave: 30, tier: trial, build: routeKey, seed });
  const game = ctx.game;
  let formationWave = null;
  let w10 = null, w20 = null;
  const gearPolicy = () => {
    for (let i = 0; i < game.bag.length; i++) {
      const it = game.bag[i];
      if (s.economyCore.isBagSeal(it)) continue;
      if (game.hero.gear.length < 4) {
        s.equipmentInventory.equipGearFromBag(i--);
        continue;
      }
      const worse = game.hero.gear.reduce((j, item, idx, eq) => quality(item) < quality(eq[j]) ? idx : j, 0);
      if (style === 'random' ? rnd() < 0.12 : quality(it) > quality(game.hero.gear[worse]) + 0.1) {
        s.equipmentInventory.replaceEquippedGear(worse, i);
      }
    }
    while (game.bag.length > 4) {
      if (style === 'expert' && game.materials < 12) s.equipmentInventory.dismantleBagGear(game.bag.length - 1);
      else s.equipmentInventory.sellBagGear(game.bag.length - 1);
    }
  };
  function resolveRewards() {
    for (let tries = 0; game.activeModal && tries < 64; tries++) {
      const m = game.activeModal;
      const matched = m.choices || [];
      if (m.type === 'starter' || m.type === 'levelup') {
        const best = choose(matched, key => key === route.skill && style !== 'generalist' ? 20 : game.hero.skills[key] || 0);
        if (!s.w10.pickHeroSkill(best)) h.close();
      } else if (m.type === 'chest') {
        if (!s.rewards.pickGearReward(choose(matched, quality))) h.close();
      } else if (m.type === 'perk') {
        if (!matched.length) h.close();
        else s.rewards.pickPerk(choose(matched, item => item.key === 'undying_will' ? 20 : item.key === 'frost_domain' ? 12 : tier[item.rarity] ?? 0).key);
      } else if (m.type === 'w10_breakthrough') {
        const learned = s.w10.getLearnedSkillKeys();
        const main = choose(learned, k => k === route.skill ? 20 : game.hero.skills[k] || 0);
        const draft = s.w10.selectW10BreakthroughSkill(main);
        const picked = choose(draft.choices, b => b.key === route.branch ? 10 : 0);
        if (!picked || !s.w10.pickW10BreakthroughBranch(picked.key).ok) throw new Error('Unable to claim W10 draft');
        w10 = picked.key;
      } else if (m.type === 'w20_breakthrough') {
        const picked = choose(game.w20Draft?.candidates ?? [], k => k === route.enhancement ? 10 : 0);
        if (!picked || !s.w20.pickW20Enhancement(picked).ok) throw new Error('Unable to claim W20 draft');
        w20 = game.hero.breakthroughs.w20.directionKey;
      } else h.close();
    }
    if (game.activeModal) throw new Error(`Unresolved ${game.activeModal.type} at W${game.wave}`);
  }
  function shop() {
    gearPolicy();
    if (trial) return;
    const maxBuys = style === 'expert' ? 3 : style === 'focused' ? 2 : 1;
    if (style === 'expert' && game.wave >= 7 && game.wave % 4 === 0 && game.gold >= 85) s.shop.rollShop();
    for (let buys = 0; buys < maxBuys; buys++) {
      const offers = game.shop.filter(o => !o.bought && o.cost <= game.gold);
      const sealScore = o => !game.seal ? (o.kind === route.elem ? 40 : 19)
        : o.kind === game.seal.kind && game.seal.star < s.unlock.getSealStarCap() ? 10 + o.star * 3
        : game.subSeals.length < s.unlock.getSubSealSlotCap() && game.wave >= 6 ? 7 : -8;
      const score = o => o.itemType === 'seal' ? sealScore(o)
        : o.itemType === 'gear' ? quality(o.gear) - (game.hero.gear.length < 4 ? 0 : Math.min(...game.hero.gear.map(quality))) + 1
        : o.pillKey === 'heal' && game.hero.hp / game.hero.maxHp < 0.73 ? 14 : -5;
      const offer = choose(offers, score);
      if (!offer || (style !== 'random' && score(offer) < 2)) break;
      s.shop.buyShopItem(game.shop.indexOf(offer));
      resolveRewards();
      gearPolicy();
    }
    if (['focused', 'expert'].includes(style)) {
      const owned = game.hero.gear;
      const cap = game.wave >= 20 ? (style === 'expert' ? 6 : 4) : 3;
      const options = owned.filter(g => g.elem === route.elem && (g.enhanceLv ?? 0) < cap);
      const item = choose(options, quality) ?? owned.find(g => (g.enhanceLv ?? 0) < 2);
      if (item && game.materials > (game.wave >= 16 && game.wave <= 20 ? 5 : 1)) s.equipmentInventory.enhanceGear(item.uid);
      if (game.seal?.star >= 3 && !game.seal.route) s.shop.chooseSealRoute(style === 'expert' ? 'mastery' : 'standard');
      if (game.wave >= 10 && game.wave % 5 === 0 && game.gold >= (style === 'expert' ? 150 : 245)) {
        const wager = style === 'expert' ? 100 : 120;
        const result = s.destiny.rollDestinyGamble(wager);
        if (result.pendingOffer) {
          const reward = choose(result.pendingOffer.choices, item => item.gear ? quality(item.gear) : item.kind === route.elem ? 12 : 1);
          s.destiny.claimDestinyReward(result.pendingOffer.choices.indexOf(reward));
        }
      }
    }
    if (formationWave == null && game.hero.gear.filter(item => item.elem === route.elem).length >= 2) formationWave = game.wave;
  }

  const records = [];
  let timeout = false;
  for (let rounds = 0; game.phase === 'prep' && rounds < 30; rounds++) {
    const wave = game.wave;
    resolveRewards();
    shop();
    resolveRewards();
    if (wave >= 16 && wave <= 20 && !game.w20State.locked) {
      s.w20.selectW20PreselectDirection(style === 'random'
        ? choose(data.W20_DIRECTION_KEYS, () => 0) : style === 'generalist' ? s.w20.getRecommendedW20Direction() : route.direction);
    }
    for (let attempts = 0; game.phase === 'prep' && attempts < 4; attempts++) {
      s.run.startWave();
      resolveRewards();
    }
    if (game.phase !== 'wave') throw new Error(`W${wave} did not start (${game.phase})`);
    const planned = plannedHealth(game.waveQueue);
    const plannedCount = game.waveQueue.length;
    const heroStats = s.heroStats.getHeroStats();
    const seal = s.heroStats.getSealStats();
    const sealBaseDps = seal ? seal.dmg / seal.cd : 0;
    const maxFrames = (wave === 30 ? 385 : 120) / STEP;
    const startedKills = game.stats.kills;
    const startingLevel = game.hero.lv;
    let minHp = 100, peak = 0, shield = 0, soloTime = 0, soloDamage = 0, groupTime = 0, groupDamage = 0;
    for (let frame = 0; frame < maxFrames && ['wave', 'harvest'].includes(game.phase); frame++) {
      resolveRewards();
      const hero = game.hero;
      if (frame % 4 === 0 && game.phase === 'wave') {
        let target = null, score = Infinity;
        let ax = 0, ay = 0;
        for (const e of game.enemies) {
          if (e.hp <= 0) continue;
          const distance = Math.hypot(e.x - hero.x, e.y - hero.y);
          const priority = style === 'expert' ? (e.pillar ? 6 : e.shaman || e.boss ? 2 : 0) : 0;
          if (distance - priority < score) { target = e; score = distance - priority; }
          if (distance > 0.01 && distance < 2.65) {
            ax += (hero.x - e.x) / distance * (2.65 - distance);
            ay += (hero.y - e.y) / distance * (2.65 - distance);
          }
        }
        const hazard = game.enemies.find(e => e.signatureLockActive)?.signatureSafeZone;
        h.aimAt(target);
        if (hazard && ['focused','expert','basic'].includes(style)) hero.goal = { x: hazard.x, y: hazard.y };
        else if (target) {
          const dx = target.x - hero.x, dy = target.y - hero.y;
          const distance = Math.hypot(dx, dy) || 1;
          const desired = route.elem === 'frost' || route.skill === 'blades' || route.skill === 'stomp' ? 2.15 : 3.15;
          const pursuit = Math.max(-0.85, Math.min(1.3, (distance - desired) * 0.8));
          const sideways = style === 'random' ? 0.15 : 0.62;
          const centerX = (W / 2 - hero.x) * 0.027;
          const centerY = (H / 2 - hero.y) * 0.035;
          const dodge = style === 'expert' ? 0.6 : 0.35;
          hero.goal = {
            x: Math.max(1.25, Math.min(W - 1.25, hero.x + 3 * (dx / distance * pursuit - dy / distance * sideways + ax * dodge + centerX))),
            y: Math.max(1.25, Math.min(H - 1.25, hero.y + 3 * (dy / distance * pursuit + dx / distance * sideways + ay * dodge + centerY))),
          };
          if (style !== 'random' && hero.dashCd <= 0 && (Math.hypot(ax, ay) > 2.2 || (style === 'expert' && target.boss && frame % 36 === 0))) s.heroSkills.castHeroDash();
          if (style !== 'random' && (game.enemies.length >= 12 || target.boss) && hero.ultCd <= 0) s.heroSkills.castHeroOverdrive();
        } else hero.goal = null;
      }
      const before = game.stats.dmgTotal;
      const hostile = game.enemies.filter(e => e.hp > 0);
      h.step();
      if (hostile.length === 1 && hostile[0].boss) { soloTime += STEP; soloDamage += game.stats.dmgTotal - before; }
      if (hostile.length >= 4 && !hostile.some(e => e.boss)) { groupTime += STEP; groupDamage += game.stats.dmgTotal - before; }
      minHp = Math.min(minHp, hero.hp / hero.maxHp * 100);
      peak = Math.max(peak, game.enemies.length);
      shield = Math.max(shield, hero.shield || 0);
    }
    const tel = game.telemetry.find(t => t.wave === wave) ?? game.curWaveTel ?? {};
    const seconds = Number(game.waveClock.toFixed(1));
    const partialDamage = game.stats.dmgTotal - (tel.dmgDealtStart ?? game.stats.dmgTotal);
    records.push({
      wave, seconds, dps: tel.dps ?? (seconds > 0 ? Math.round(partialDamage / seconds) : 0),
      ehp: tel.ehpTotal ?? 0, planned, plannedCount,
      level: startingLevel, startSkillMult: Number(heroStats.skillDmgMult.toFixed(2)), sealBaseDps: Math.round(sealBaseDps),
      soloDps: soloTime >= 3 ? Math.round(soloDamage / soloTime) : null, groupDps: groupTime >= 3 ? Math.round(groupDamage / groupTime) : null,
      minHp: Math.round(minHp), peak, shield: Math.round(shield), kills: game.stats.kills - startedKills,
      hits: tel.hitsTaken ?? 0, damageTaken: tel.dmgTaken ?? 0, dash: tel.dashCount ?? 0, overdrive: tel.ultCount ?? 0,
      gold: game.gold, earned: game.runMetrics.goldEarned, spent: game.runMetrics.goldSpent, materials: game.materials,
    });
    timeout = ['wave', 'harvest'].includes(game.phase);
    if (timeout) break;
  }
  return {
    seed, style, route: routeKey, tier: trial, phase: timeout ? 'timeout' : game.phase, wave: game.wave,
    w10, w20, formationWave, fatal: game.combatLog.fatalSource?.skillName ?? null, aux: game.bossIntel.w30Aux,
    records,
  };
}

for (let n = 0; n < count; n++) {
  const route = routes[mode === 'boss' ? Math.floor(n / 12) % routes.length : Math.floor(n / strategies.length) % routes.length];
  const style = mode === 'boss' ? 'expert' : strategies[n % strategies.length];
  const trial = mode === 'boss' ? ['weak', 'standard', 'strong'][Math.floor(n / 4) % 3] : null;
  console.log(JSON.stringify(run(2026 + n, style, route, trial)));
}
