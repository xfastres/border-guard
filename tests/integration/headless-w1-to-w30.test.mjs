import assert from 'node:assert/strict';
import test from 'node:test';
import { createRuntimeContext } from '../../src/core/runtime-context.js';
import { createGameSystems } from '../../src/app/bootstrap.js';
import { H, MAIN_WAVES, W } from '../../src/data/index.js';

const FRAME = 0.05;
const EPOCH = 1_700_000_000_000;
const SKILL_ORDER = ['firewave', 'blades', 'berserk', 'nova', 'thunder', 'stomp'];

function createHeadless(seed = 2026, savedEntries = []) {
  const entries = new Map(savedEntries);
  const storage = {
    failWrite: false,
    getItem: key => entries.get(key) ?? null,
    setItem(key, value) {
      if (storage.failWrite) throw new Error('storage unavailable');
      entries.set(key, String(value));
    },
    removeItem: key => entries.delete(key),
  };
  const calls = new Map();
  const record = (name, result) => {
    const call = { count: 0, args: [] };
    calls.set(name, call);
    return (...args) => {
      call.count++;
      call.args = args;
      return result?.(...args);
    };
  };
  const clock = { ms: 1000 };
  const ctx = createRuntimeContext();
  const systems = createGameSystems(ctx);
  const { run, unlock, rewards, meta } = systems;
  const keys = new Set();
  const point = (x, y) => ({ x, y });
  let pointer = null;

  function openNextModal() {
    const modal = ctx.game.pendingModals.shift();
    ctx.game.activeModal = modal ?? null;
    if (modal?.type === 'starter') modal.choices = ['blades', 'firewave', 'nova'];
    if (modal?.type === 'levelup') {
      const pool = unlock.getUnlockedSkillPool().filter(key => (ctx.game.hero.skills[key] || 0) < 5);
      modal.choices = [];
      while (modal.choices.length < 3 && pool.length) {
        modal.choices.push(pool.splice(Math.floor(ctx.game.rnd() * pool.length), 1)[0]);
      }
      if (!modal.choices.length) {
        systems.economyCore.changeGold(20, 'max_skill_pool_bonus');
        closeModal();
      }
    }
    if (modal?.type === 'chest') modal.choices = rewards.pickChestGearChoices(modal.legend, modal.shrineTier);
    if (modal?.type === 'perk') modal.choices = rewards.rollPerkChoices(modal.quality);
  }

  function closeModal() {
    ctx.game.activeModal = null;
    if (ctx.game.pendingModals.length) openNextModal();
    else if (ctx.game.finalPrep?.awaitingWaveRewards) run.syncW29FinalPrepStart();
  }

  ctx.bindPorts({
    storage: { getStorage: () => storage },
    clock: {
      nowMs: () => EPOCH + clock.ms,
      perfNow: () => clock.ms,
      syncLoopTimestamp: record('clock.syncLoopTimestamp'),
    },
    modals: {
      queueModal: record('modals.queue', modal => {
        ctx.game.pendingModals.push(modal);
        if (!ctx.game.activeModal) openNextModal();
      }),
      closeModal: record('modals.close', closeModal),
      openNextModal: record('modals.openNext', openNextModal),
      hideBackdrop: record('modals.hideBackdrop'),
      showEndModal: record('modals.end'),
      renderW10BreakthroughModal: record('modals.w10'),
      renderW20BreakthroughModal: record('modals.w20'),
      renderShopConfirmModal: record('modals.shopConfirm'),
      renderW30EarlyConfirmModal: record('modals.w30EarlyConfirm'),
      renderAffixTransferModal: record('modals.transfer'),
      renderDestinyGambleModal: record('modals.destiny'),
    },
    ui: {
      toast: record('ui.toast'),
      showBanner: record('ui.banner'),
      flashScreen: record('ui.flashScreen'),
      renderAllUI: record('ui.render'),
      resetRunUI: record('ui.reset'),
      setDangerVignette: record('ui.danger'),
    },
    vfx: { addRing: record('vfx.ring'), addFloat: record('vfx.float'), update: record('vfx.update') },
    audio: { play: record('audio.play'), unlock: record('audio.unlock') },
    input: {
      getKeys: record('input.keys', () => keys),
      getPointerScreen: record('input.pointerScreen', () => pointer),
      getPointerWorld: record('input.pointerWorld', () => pointer),
      setPointerWorld: record('input.setPointerWorld', value => { pointer = value; }),
      isPointerDown: record('input.pointerDown', () => false),
    },
    viewport: {
      screenToWorld: record('viewport.screenToWorld', point),
      worldToScreen: record('viewport.worldToScreen', point),
      getCamera: record('viewport.camera', () => ({ x: 0, y: 0, zoom: 1, w: 1280, h: 720, dpr: 1 })),
      updateCamera: record('viewport.update'),
      resetCamera: record('viewport.reset'),
    },
  });
  meta.loadMetaSave();
  run.startNewRun(seed, false);

  return {
    ctx, systems, game: ctx.game, clock, storage, entries, calls,
    step() {
      clock.ms += FRAME * 1000;
      run.tick(FRAME);
    },
  };
}

function chooseStarter({ ctx, systems }, skill = 'firewave') {
  ctx.ports.modals.queueModal({ type: 'starter' });
  assert.equal(systems.w10.pickHeroSkill(skill), true);
}

function settleModals({ game, systems, ctx }) {
  const { w10, w20, rewards } = systems;
  while (game.activeModal) {
    const m = game.activeModal;
    switch (m.type) {
      case 'levelup': {
        const choice = SKILL_ORDER.find(key => m.choices.includes(key)) ?? m.choices[0];
        assert.equal(w10.pickHeroSkill(choice), true);
        break;
      }
      case 'chest':
        assert.ok(rewards.pickGearReward(m.choices[0]));
        break;
      case 'perk':
        if (m.choices.length) rewards.pickPerk(m.choices[0].key);
        else ctx.ports.modals.closeModal();
        break;
      case 'w10_breakthrough': {
        const draft = w10.selectW10BreakthroughSkill('firewave');
        assert.equal(draft.ok, true);
        assert.equal(draft.choices.length, 3);
        assert.equal(w10.pickW10BreakthroughBranch(draft.choices[0].key).ok, true);
        break;
      }
      case 'w20_breakthrough': {
        assert.equal(game.hero.breakthroughs.w20.baseEffectActive, true);
        const materials = game.materials;
        const reroll = w20.rerollW20Enhancements();
        assert.equal(reroll.ok, true, reroll.reason);
        assert.equal(game.materials, materials - reroll.costPaid);
        assert.ok(reroll.candidates.every(card => !reroll.prevCandidates.includes(card.key)));
        assert.equal(w20.pickW20Enhancement(reroll.candidates[0].key).ok, true);
        break;
      }
      default:
        assert.fail(`Unexpected modal ${m.type} at W${game.wave}`);
    }
    assert.notEqual(game.activeModal, m, `${m.type} must advance after claiming`);
  }
}

function buyGear({ game, systems }, confirm = false) {
  const idx = game.shop.findIndex(item => item.itemType === 'gear' && !item.bought && item.cost <= game.gold);
  assert.ok(idx >= 0, `Expected affordable gear at W${game.wave}`);
  const { uid, cost, gear } = game.shop[idx];
  const gold = game.gold;
  if (confirm) {
    const { shopConfirm } = systems;
    assert.deepEqual(shopConfirm.openShopPurchaseConfirm(idx).draft,
      { shopIdx: idx, itemUid: uid, itemType: 'gear', cost, label: gear.name });
    assert.equal(game.activeModal.type, 'shop_confirm');
    assert.equal(game.gold, gold);
    assert.ok(game.bag.every(item => item.uid !== gear.uid));
    assert.equal(shopConfirm.cancelShopPurchaseConfirm().ok, true);
    assert.equal(game.shopConfirmDraft, null);
    assert.equal(game.activeModal, null);
    assert.equal(game.gold, gold);
    assert.equal(game.shop[idx].bought, false);
    assert.equal(shopConfirm.confirmShopPurchase().reason, 'no_shop_draft');
    assert.equal(shopConfirm.openShopPurchaseConfirm(idx).ok, true);
    assert.equal(shopConfirm.confirmShopPurchase().ok, true);
    assert.equal(shopConfirm.confirmShopPurchase().reason, 'no_shop_draft');
  } else {
    assert.equal(systems.shop.buyShopItem(idx), true);
  }
  assert.equal(game.gold, gold - cost);
  assert.equal(game.bag.filter(item => item.uid === gear.uid && item.paidGold === cost).length, 1);
  return game.bag.findIndex(item => item.uid === gear.uid);
}

function grantGear({ systems }, baseKey, affixes = [null]) {
  const item = systems.equipmentCore.createGearInstance(baseKey, { slotsCount: affixes.length, affixes });
  assert.equal(systems.equipmentInventory.grantGearSafely(item).storedIn, 'bag');
  return item;
}

function clearWave(harness) {
  const { game, systems, step } = harness;
  const { hero } = game;
  const wave = game.wave;
  const maxFrames = (wave === 30 ? 420 : 100) / FRAME;
  let sawEnemy = false;
  let sawLock = false;
  for (let frame = 0; frame < maxFrames && ['wave', 'harvest'].includes(game.phase); frame++) {
    settleModals(harness);
    const enemies = game.enemies.filter(enemy => enemy.hp > 0);
    const boss = enemies.find(enemy => enemy.boss);
    const target = boss ?? enemies[0];
    const safe = boss?.signatureLockActive && boss.signatureSafeZone;
    if (target) {
      sawEnemy = true;
      const angle = frame * 0.17;
      const radius = boss && frame % 120 >= 82 ? 7.8 : 2.7;
      // Position the test driver in range or in the telegraphed safe zone.
      hero.x = safe ? safe.x : Math.max(2, Math.min(W - 2, target.x + Math.cos(angle) * radius));
      hero.y = safe ? safe.y : Math.max(2, Math.min(H - 2, target.y + Math.sin(angle) * radius));
    }
    if (safe) {
      sawLock = true;
      assert.equal(boss.hp, Math.round(boss.maxHp * 0.8));
    }
    if (frame % 90 === 0 && !safe) systems.heroSkills.castHeroDash();
    if (frame % 180 === 0) systems.heroSkills.castHeroOverdrive();
    step();
  }
  assert.equal(sawEnemy, true, `W${wave} must spawn enemies through tick`);
  assert.equal(game.phase, wave === MAIN_WAVES ? 'won' : 'prep',
    `W${wave}, remaining enemies ${game.enemies.length}, clock ${game.waveClock}, fatal ${JSON.stringify(game.combatLog.fatalSource)}`);
  if (wave === MAIN_WAVES) assert.equal(sawLock, true);
}

function w30Prep(harness) {
  const { game, systems, calls } = harness;
  const { run, destiny, affixTransfer, equipmentCore, equipmentInventory } = systems;
  assert.equal(game.subPhase, 'w29_final_prep');
  assert.equal(game.finalPrep.duration, 90);
  assert.equal(game.finalPrep.timer, 90);
  assert.equal(game.finalPrep.started, true);
  buyGear(harness, true);
  assert.equal(calls.get('modals.shopConfirm').count, 2);

  const bet = 100;
  for (let attempt = 0; attempt < 10 && game.transferTokens === 0; attempt++) {
    const openingGold = game.gold;
    const gamble = destiny.rollDestinyGamble(bet);
    assert.equal(gamble.ok, true, gamble.reason);
    assert.equal(game.gold, openingGold - bet);
    if (gamble.outcome === 'empty_tribulation') continue;
    const { choices, offerId } = gamble.pendingOffer;
    assert.equal(choices.length, 3);
    assert.equal(run.startW30Early().reason, 'pending_destiny_offer_requires_choice');
    assert.equal(game.activeModal.type, 'w30_early_confirm');
    harness.ctx.ports.modals.closeModal();
    const token = choices.findIndex(choice => choice.subType === 'transfer_token');
    assert.equal(destiny.claimDestinyReward(Math.max(0, token), { offerId }).grantResult?.ok, true);
    settleModals(harness);
  }
  assert.ok(game.transferTokens > 0, 'W29 Destiny payoff must fund the transfer');

  // Supply known affixes through the inventory API so the transfer has a measurable synergy effect.
  const donor = grantGear(harness, 'wood_talisman', ['fire_chain']);
  const target = game.hero.gear[0];
  const source = { location: 'bag', idx: game.bag.findIndex(item => item.uid === donor.uid) };
  const transfer = { source, sourceSlot: 0, target: { location: 'equipped', idx: 0 }, targetSlot: 1 };
  const before = [game.gold, game.transferTokens];
  const preview = affixTransfer.previewAffixTransfer(transfer);
  assert.equal(preview.canCommit, true, preview.reason);
  assert.deepEqual([game.gold, game.transferTokens], before);
  assert.equal(equipmentCore.getActiveGearAffixSynergies().hasFireDuo, true);
  assert.equal(affixTransfer.commitAffixTransfer().ok, true);
  assert.equal(game.bag[source.idx].affixes[0], null);
  assert.equal(game.hero.gear[0].affixes[1].id, 'fire_chain');
  assert.equal(game.hero.gear[0].uid, target.uid);
  assert.deepEqual([game.gold, game.transferTokens], [before[0] - preview.costGold, before[1] - preview.costTokens]);
  const synergies = equipmentCore.getActiveGearAffixSynergies();
  assert.equal(synergies.hasFireDuo, false);
  assert.equal(synergies.hasFireTrio, true);
  assert.equal(synergies.hasFrostDuo, true);
  assert.equal(equipmentInventory.dismantleBagGear(source.idx), true);
  assert.equal(run.startW30Early().ok, true);
  assert.equal(game.finalPrep.lastResolution.trigger, 'early_start');
}

function playRun(seed) {
  const harness = createHeadless(seed);
  const { game, systems, storage, entries, calls } = harness;
  const { run, shop, w20, equipmentInventory, equipmentCore, heroStats, meta } = systems;
  chooseStarter(harness);
  const initialShop = structuredClone(game.shop);
  assert.equal(shop.rollShop(false), true);
  assert.notDeepEqual(game.shop, initialShop);
  assert.equal(game.metaRunState.freeRefreshUses, 1);
  const sealIdx = game.shop.findIndex(item => item.itemType === 'seal');
  assert.ok(sealIdx >= 0);
  assert.equal(shop.buyShopItem(sealIdx), true);
  const openingGold = game.gold;

  for (let wave = 1; wave <= MAIN_WAVES; wave++) {
    assert.equal(game.wave, wave);
    if (wave === 2) {
      assert.ok(game.seal.dmgDealt > 0, 'W1 seal dealt damage');
      assert.ok(game.stats.skillDmg.firewave > 0, 'W1 starter skill dealt damage');
      assert.ok(game.hero.xp > 0 || game.hero.lv > 1, 'W1 granted enemy gem XP');
      assert.ok(game.gold > openingGold, 'W1 accrued combat and clear gold');
      assert.ok(game.runMetrics.ledger.some(entry => entry.reason === 'kill_enemy'));
      const bought = buyGear(harness);
      assert.equal(equipmentInventory.equipGearFromBag(bought), true);
      assert.equal(equipmentInventory.unequipGear(0), true);
      assert.equal(equipmentInventory.dismantleBagGear(game.bag.length - 1), true);
      for (const [baseKey, affixes] of [
        ['flame_fan', ['fire_brand', null]],
        ['burn_core', ['fire_burst']],
        ['crit_axe', ['frost_chill']],
        ['vamp_fang', ['frost_ward']],
      ]) {
        grantGear(harness, baseKey, affixes);
        assert.equal(equipmentInventory.equipGearFromBag(game.bag.length - 1), true);
      }
      assert.equal(equipmentCore.getActiveGearAffixSynergies().hasFireDuo, true);
      assert.equal(heroStats.gearSetTier('flame'), 3);
    }
    if (wave === 6) {
      const oldMaterials = game.materials;
      const enhance = equipmentInventory.enhanceGear({ location: 'equipped', idx: 0 });
      assert.equal(enhance.ok, true, enhance.reason);
      assert.equal(enhance.enhanceLv, 1);
      assert.equal(game.materials, oldMaterials - enhance.cost);
    }
    if (wave === 16 || wave === 20) {
      assert.equal(w20.isW20PreselectOpen(), true);
      assert.equal(w20.selectW20PreselectDirection('fire_chain_surge').ok, true);
    }
    while (game.bag.length > 4) assert.equal(equipmentInventory.dismantleBagGear(0), true);
    if (wave === MAIN_WAVES) {
      w30Prep(harness);
    } else {
      // The regular start action banks remaining chest rewards, then starts on a second click.
      if (game.chests.length) {
        assert.equal(run.startWave(), false);
        assert.ok(game.activeModal);
        settleModals(harness);
      }
      assert.equal(run.startWave(), true, `Could not start W${wave}`);
    }
    if (wave === 20) {
      assert.equal(game.w20State.lockedAtWave, 20);
      assert.equal(game.w20State.lockedDirection, 'fire_chain_surge');
    }
    clearWave(harness);
    settleModals(harness);
    if (wave === 10) assert.equal(game.hero.breakthroughs.w10.skillKey, 'firewave');
    if (wave === 20) assert.equal(game.hero.breakthroughs.w20.rerollCount, 1);
    if (wave === 28) {
      const omen = run.getEndgameOmenState();
      assert.ok(omen.triggered && omen.midWaveTriggered && omen.clearTriggered);
      assert.equal(game.bossIntel.w30Revealed, true);
    }
  }

  const battle = w20.getW30BattleState();
  const phases = battle.phaseTimeline;
  assert.deepEqual(phases.map(entry => entry.phase), [
    'opening', 'signature_telegraph', 'signature_shockwave', 'mid_skirmish', 'final_combo', 'ended',
  ]);
  assert.deepEqual(phases.slice(1, 4).map(entry => entry.bossHpPct), [80, 80, 80]);
  assert.ok(phases[4].bossHpPct > 0 && phases[4].bossHpPct <= 35);
  assert.equal(battle.finalThresholdPct, 0.35);
  assert.ok(phases.every((entry, idx) => idx === 0 || entry.at >= phases[idx - 1].at));
  assert.ok(battle.signatureHitsDuringLock > 0);
  assert.equal(battle.signatureHpDamageDuringLock, 0);
  assert.equal(battle.signatureLifestealDuringLock, 0);
  assert.equal(battle.outcome, 'victory');
  assert.equal(phases.at(-1).bossHpPct, 0);
  assert.equal(game.stats.bossKills, 6);
  assert.deepEqual(game.telemetry.map(wave => wave.wave), Array.from({ length: MAIN_WAVES }, (_, i) => i + 1));
  assert.deepEqual(calls.get('modals.end'), { count: 1, args: [true] });
  const settlement = game.metaSettlement;
  assert.equal(settlement.persisted, true);
  assert.ok(settlement.totalShardsGrantedThisCall > 0);
  const stored = JSON.parse(storage.getItem(meta.getMetaConfig().storageKey));
  assert.deepEqual(createHeadless(seed, entries).systems.meta.getMetaSave(), stored);
  assert.equal(stored.stats.totalRuns, 1);
  assert.equal(stored.stats.victories, 1);
  assert.equal(stored.legacyShards, settlement.totalShardsGrantedThisCall);
  assert.deepEqual(stored.lastSettlement, settlement);
  assert.equal(meta.settleRunMetaRewards(true).totalShardsGrantedThisCall, 0);

  return structuredClone({
    initialShop,
    wave: game.wave, phase: game.phase, gold: game.gold, materials: game.materials, tokens: game.transferTokens,
    level: game.hero.lv, xp: game.hero.xp, skills: game.hero.skills, hp: game.hero.hp, stats: heroStats.getHeroStats(),
    gear: game.hero.gear, sets: heroStats.getActiveGearSets(), resonances: heroStats.getActiveDualResonances(),
    synergies: equipmentCore.getActiveGearAffixSynergies().active,
    breakthroughs: game.hero.breakthroughs, battle, destiny: game.destiny.history, settlement, stored,
  });
}

test('W1–W30 plays through real combat and persists identical victory data for seed 2026', { timeout: 30_000 }, () => {
  const first = playRun(2026);
  const second = playRun(2026);
  assert.deepEqual(second, first);
});

test('a different seed changes W1 shop contents and spawned enemy queues', () => {
  function start(seed) {
    const harness = createHeadless(seed);
    const { game, systems, step } = harness;
    chooseStarter(harness);
    const shop = game.shop.map(item => [item.itemType, item.kind, item.gear?.baseKey, item.cost]);
    assert.equal(systems.run.startWave(), true);
    for (let i = 0; i < 60; i++) step();
    assert.ok(game.enemies.length > 0);
    return { shop, queue: game.waveQueue };
  }
  const a = start(2026);
  const b = start(1337);
  assert.notDeepEqual(a.shop, b.shop);
  assert.notDeepEqual(a.queue, b.queue);
});

function clearCheckpoint(harness, wave) {
  harness.game.wave = wave;
  harness.systems.run.completeWaveClear();
  assert.equal(harness.game.wave, wave + 1);
  assert.equal(harness.game.phase, 'prep');
}

test('BUG-01: final prep uses elapsed clock time while paused and automatically starts W30', () => {
  const harness = createHeadless();
  const { ctx, game, systems: { run }, clock } = harness;
  clearCheckpoint(harness, 29);
  const { finalPrep, runMetrics } = game;
  const start = clock.ms;
  assert.equal(finalPrep.deadlineMs, start + 90_000);
  ctx.setPaused(true);
  game.speed = 3;
  clock.ms = start + 20_000;
  run.tick(FRAME);
  assert.equal(finalPrep.timer, 70);
  assert.equal(runMetrics.w29FinalPrepSec, 20);

  clock.ms = start + 10_000;
  run.tick(FRAME);
  assert.equal(finalPrep.lastClockMs, start + 20_000);
  assert.equal(finalPrep.deadlineMs, start + 90_000);
  assert.equal(runMetrics.w29FinalPrepSec, 20);
  // Current runtime recomputes the displayed timer after a rollback even though the deadline stays fixed.
  assert.equal(finalPrep.timer, 80);

  clock.ms = start + 89_000;
  run.tick(FRAME);
  assert.equal(finalPrep.timer, 1);
  assert.equal(game.phase, 'prep');
  clock.ms = start + 90_000;
  run.tick(FRAME);
  assert.equal(finalPrep.timer, 0);
  assert.equal(finalPrep.lastResolution.trigger, 'timeout');
  assert.equal(game.phase, 'wave');
  assert.equal(game.w30Battle.phase, 'opening');
});

test('BUG-02: equip, replace and unequip update max HP without healing a wounded hero', () => {
  const harness = createHeadless();
  const { game, systems: { heroVitals, equipmentInventory: inv } } = harness;
  const { hero } = game;
  heroVitals.damageHero(40);
  const { hp, maxHp } = hero;
  grantGear(harness, 'wood_talisman');
  grantGear(harness, 'frost_mirror');
  assert.equal(inv.equipGearFromBag(0), true);
  assert.deepEqual([hero.hp, hero.maxHp], [hp, maxHp + 45]);
  assert.equal(inv.replaceEquippedGear(0, 0).ok, true);
  assert.deepEqual([hero.hp, hero.maxHp], [hp, maxHp + 55]);
  assert.equal(inv.unequipGear(0), true);
  assert.deepEqual([hero.hp, hero.maxHp], [hp, maxHp]);
});

test('BUG-03: full bag preserves overflow gear and rejects shop purchase without charging', () => {
  const harness = createHeadless();
  const { game, systems: { equipmentInventory: inv, economyCore, shop } } = harness;
  const cap = economyCore.getBagCapacity();
  for (let idx = 0; idx < cap; idx++) grantGear(harness, 'wood_talisman');
  const originalBag = structuredClone(game.bag);
  const overflow = inv.grantGearSafely('jade_pendant');
  assert.equal(overflow.storedIn, 'stash');
  assert.equal(game.rewardStash[0].item.uid, overflow.item.uid);
  assert.deepEqual(game.bag, originalBag);
  const idx = game.shop.findIndex(item => item.itemType === 'gear' && item.cost <= game.gold);
  assert.ok(idx >= 0);
  const gold = game.gold;
  assert.deepEqual(shop.buyShopItem(idx), { ok: false, reason: 'bag_full' });
  assert.equal(game.gold, gold);
  assert.equal(game.shop[idx].bought, false);
  assert.deepEqual(game.bag, originalBag);
  assert.equal(inv.dismantleBagGear(0), true);
  assert.equal(inv.claimRewardStashItem(0).ok, true);
  assert.equal(game.bag.length, cap);
  assert.equal(game.bag.at(-1).uid, overflow.item.uid);
  assert.equal(game.rewardStash.length, 0);
});

test('BUG-04: W29 settles queued rewards before timing and preserves the level-up from auto-claim', () => {
  const harness = createHeadless();
  const { game, ctx, systems: { run, heroVitals, destiny }, clock } = harness;
  chooseStarter(harness);
  ctx.ports.modals.queueModal({ type: 'chest' });
  heroVitals.gainHeroXp(game.hero.xpNext);
  const levelup = game.pendingModals[0];
  assert.equal(levelup.type, 'levelup');
  clearCheckpoint(harness, 29);
  assert.equal(game.finalPrep.awaitingWaveRewards, true);
  clock.ms += 100_000;
  run.tick(FRAME);
  assert.equal(game.finalPrep.timer, 90);
  assert.equal(game.finalPrep.started, false);
  assert.equal(game.pendingModals[0], levelup);
  assert.equal(run.startW30Early().reason, 'awaiting_wave_rewards');
  settleModals(harness);
  assert.equal(levelup.claimed, true);
  assert.equal(game.finalPrep.started, true);

  heroVitals.gainHeroXp(game.hero.xpNext);
  heroVitals.gainHeroXp(game.hero.xpNext - 1);
  ctx.ports.modals.queueModal({ type: 'destiny_gamble' });
  // Drive the real roll into three common XP pills so any automatic choice levels the hero.
  const samples = [0.99, 0.6, 0.6, 0.6];
  const roll = destiny.rollDestinyGamble(30, { rndFn: () => samples.shift() ?? 0 });
  assert.deepEqual(roll.pendingOffer.choices.map(choice => choice.pillKey), ['xp', 'xp', 'xp']);
  clock.ms = game.finalPrep.deadlineMs;
  run.tick(FRAME);
  assert.equal(game.finalPrep.lastResolution.autoClaimedOffer?.ok, true);
  assert.equal(game.phase, 'wave');
  assert.equal(game.hero.lv, 4);
  assert.equal(game.activeModal?.type, 'levelup');
  assert.equal(game.w30Battle.elapsedSeconds, 0);
  const automaticLevelup = game.activeModal;
  settleModals(harness);
  assert.equal(automaticLevelup.claimed, true);
});

test('BUG-05: broken Meta bytes are recoverable and a failed settlement can be saved once', () => {
  const defaults = createHeadless();
  const key = defaults.systems.meta.getMetaConfig().storageKey;
  const broken = '{ corrupted json';
  const { entries, storage, game, systems: { run, meta } } = createHeadless(2026, [[key, broken]]);
  assert.deepEqual(meta.getMetaSave(), defaults.systems.meta.getMetaSave());
  assert.equal(meta.getMetaStorageStatus().loadError, 'corrupted_json');
  assert.equal(meta.getMetaStorageStatus().rawCorruptedBackup, broken);
  assert.equal(meta.exportRawCorruptedMetaSave(), broken);
  assert.equal(meta.saveMetaSave(), false);
  assert.equal(meta.getMetaStorageStatus().lastSaveError, 'protected_corrupted_storage');
  // The runtime exposes an in-memory backup and retains the original storage entry.
  assert.deepEqual([...entries], [[key, broken]]);
  assert.equal(meta.resetMetaSave().ok, true);
  const savedDefaults = storage.getItem(key);

  storage.failWrite = true;
  game.wave = 6;
  run.finishGame(false);
  const failed = meta.getMetaStorageStatus();
  assert.equal(failed.state, 'save_error');
  assert.equal(failed.saveFailed, true);
  assert.equal(failed.lastSaveError, 'storage unavailable');
  assert.equal(failed.pendingUnsavedSettlement.runId, game.runId);
  assert.equal(game.metaSettlement.persisted, false);
  assert.equal(storage.getItem(key), savedDefaults);
  assert.equal(meta.retryPendingMetaSave().ok, false);
  storage.failWrite = false;
  assert.equal(meta.retryPendingMetaSave().ok, true);
  assert.equal(meta.getMetaStorageStatus().state, 'ok');
  assert.equal(meta.getMetaStorageStatus().saveFailed, false);
  assert.equal(meta.getMetaStorageStatus().pendingUnsavedSettlement, null);
  const persisted = JSON.parse(storage.getItem(key));
  assert.equal(persisted.lastSettlement.persisted, true);
  assert.ok(persisted.legacyShards > 0);
  assert.equal(meta.settleRunMetaRewards(false).totalShardsGrantedThisCall, 0);
  assert.deepEqual(JSON.parse(storage.getItem(key)), persisted);
});

test('BUG-06: same-frame equipment and shop flows reconcile with gold and material balances', () => {
  const harness = createHeadless();
  const { game, systems: { economyCore, equipmentInventory: inv }, step } = harness;
  const initialGold = game.gold;
  const initialMaterials = game.materials;
  grantGear(harness, 'wood_talisman');
  grantGear(harness, 'titan_crown');
  const sellGold = economyCore.getGearSellGold(game.bag[0]);
  const mats = economyCore.getGearDismantleMaterials(game.bag[1]);
  assert.equal(inv.sellBagGear(0), true);
  const bought = buyGear(harness);
  const { uid, paidGold } = game.bag[bought];
  assert.equal(inv.dismantleBagGear(0), true);
  const cost = economyCore.getGearEnhanceCost(game.bag[0]);
  assert.equal(inv.enhanceGear(uid).ok, true);
  step();
  const endGold = initialGold + sellGold - paidGold;
  const endMaterials = initialMaterials + mats - cost;
  assert.deepEqual(economyCore.getResourceLedger(), [
    { seq: 1, wave: 1, type: 'gold', delta: sellGold, reason: 'sell_bag_gear', balanceAfter: initialGold + sellGold },
    { seq: 2, wave: 1, type: 'gold', delta: -paidGold, reason: 'shop_buy_gear', balanceAfter: endGold },
    { seq: 3, wave: 1, type: 'materials', delta: mats, reason: 'dismantle_bag_gear', balanceAfter: initialMaterials + mats },
    { seq: 4, wave: 1, type: 'materials', delta: -cost, reason: 'enhance_gear', balanceAfter: endMaterials },
  ]);
  const { goldEarned, goldSpent, materialsEarned, materialsSpent } = game.runMetrics;
  assert.deepEqual([game.gold, game.materials], [endGold, endMaterials]);
  assert.deepEqual([goldEarned, goldSpent, materialsEarned, materialsSpent],
    [initialGold + sellGold, paidGold, initialMaterials + mats, cost]);
});

test('BUG-07: asymmetric equipment and bag indexes replace the intended gear', () => {
  const harness = createHeadless();
  const { game, systems: { equipmentInventory: inv } } = harness;
  const outgoing = grantGear(harness, 'wood_talisman');
  assert.equal(inv.equipGearFromBag(0), true);
  const untouched = grantGear(harness, 'jade_pendant');
  const incoming = grantGear(harness, 'frost_mirror');
  assert.equal(inv.replaceEquippedGear(0, 1).ok, true);
  assert.deepEqual(game.hero.gear.map(item => item.uid), [incoming.uid]);
  assert.deepEqual(game.bag.map(item => item.uid), [untouched.uid, outgoing.uid]);
});

test('BUG-08: W29 shop confirmation cancels without a charge and confirms once', () => {
  const harness = createHeadless();
  clearCheckpoint(harness, 29);
  buyGear(harness, true);
  assert.equal(harness.calls.get('modals.shopConfirm').count, 2);
});

test('BUG-09: enemy meteor and lingering burn reconcile shields, HP and threat attribution', () => {
  const { game, systems: { run, combat, heroVitals }, step } = createHeadless();
  assert.equal(run.startWave(), true);
  const { hero } = game;
  const enemy = combat.spawnEnemy('shaman', 'west', 1, { x: hero.x + 5, y: hero.y });
  const meteorDamage = Math.round(enemy.dmg * 1.65);
  const burnDamage = Math.round(meteorDamage * 0.35);
  const shield = 5;
  combat.gainFrostShield(shield);
  const hp = hero.hp;
  for (let i = 0; i < 100 && game.combatLog.hits.length < 2; i++) step();
  assert.equal(game.combatLog.hits.length, 2);
  const [meteor, burn] = game.combatLog.hits;
  assert.deepEqual([meteor.attackerName, meteor.attackerKind, meteor.skillName, meteor.shieldAbsorbed, meteor.hpLost],
    [enemy.name, 'shaman', '妖火天降点名', shield, meteorDamage - shield]);
  assert.deepEqual([burn.attackerName, burn.attackerKind, burn.skillName, burn.shieldAbsorbed, burn.hpLost],
    [enemy.name, 'shaman', '灼地焦土(持续)', 0, burnDamage]);
  assert.equal(game.combatLog.totalShieldAbsorbed, shield);
  assert.equal(game.combatLog.totalHpLost, meteorDamage - shield + burnDamage);
  assert.equal(hero.hp, hp - game.combatLog.totalHpLost);
  const summary = heroVitals.getRecentThreatSummary();
  assert.deepEqual(summary.hits, [meteor, burn]);
  assert.equal(summary.totalHpLost, game.combatLog.totalHpLost);
  assert.equal(summary.topThreats[0].attackerName, enemy.name);
  assert.equal(summary.topThreats[0].skillName, meteor.skillName);
  assert.deepEqual(heroVitals.getRecentThreatSummary(0.1).hits, [burn]);
});

test('BUG-10: repeat clicks cannot grant the same modal, Destiny or breakthrough reward twice', () => {
  const harness = createHeadless();
  const { ctx, game, systems: { destiny, rewards, w10, w20 } } = harness;
  ctx.ports.modals.queueModal({ type: 'starter' });
  let duplicate;
  const play = ctx.ports.audio.play;
  // Attempt reentry while the first claim is still invoking its presentation ports.
  ctx.ports.audio.play = () => { duplicate = w10.pickHeroSkill('firewave'); };
  assert.equal(w10.pickHeroSkill('firewave'), true);
  ctx.ports.audio.play = play;
  assert.equal(duplicate, false);
  assert.equal(game.hero.skills.firewave, 1);

  ctx.ports.modals.queueModal({ type: 'chest' });
  const choice = game.activeModal.choices[0];
  ctx.ports.audio.play = () => { duplicate = rewards.pickGearReward(choice); };
  assert.ok(rewards.pickGearReward(choice));
  ctx.ports.audio.play = play;
  assert.equal(duplicate, false);
  assert.deepEqual(game.bag.map(item => item.uid), [choice.uid]);

  clearCheckpoint(harness, 10);
  const branch = w10.selectW10BreakthroughSkill('firewave').choices[0].key;
  assert.equal(w10.pickW10BreakthroughBranch(branch).ok, true);
  const hp = game.hero.baseMaxHp;
  assert.equal(w10.pickW10BreakthroughBranch(branch).reason, 'no_w10_skill_selected');
  assert.equal(game.hero.baseMaxHp, hp);
  assert.equal(game.stats.breakthroughsCompleted, 1);
  clearCheckpoint(harness, 20);
  const key = game.w20Draft.candidates[0];
  assert.equal(w20.pickW20Enhancement(key).ok, true);
  assert.equal(w20.pickW20Enhancement(key).reason, 'no_active_draft');
  assert.equal(game.hero.breakthroughs.w20.enhancementKey, key);
  assert.equal(game.stats.breakthroughsCompleted, 2);

  const samples = [0.99, 0.99, 0.1, 0.4];
  const offer = destiny.rollDestinyGamble(100, { rndFn: () => samples.shift() ?? 0 }).pendingOffer;
  assert.equal(offer.choices[0].subType, 'transfer_token');
  const tokenCount = offer.choices[0].tokenCount;
  ctx.ports.audio.play = () => { duplicate = destiny.claimDestinyReward(0, { offerId: offer.offerId }); };
  assert.equal(destiny.claimDestinyReward(0, { offerId: offer.offerId }).ok, true);
  ctx.ports.audio.play = play;
  assert.equal(duplicate.reason, 'no_pending_offer');
  assert.equal(game.transferTokens, tokenCount);
  assert.deepEqual(game.destiny.claimedOfferIds, [offer.offerId]);
  assert.equal(game.stats.destinyClaims, 1);
});
