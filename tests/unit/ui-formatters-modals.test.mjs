import assert from 'node:assert/strict';
import test from 'node:test';
import { createRuntimeContext } from '../../src/core/runtime-context.js';
import { HERO_SKILLS, W10_SKILL_BRANCHES } from '../../src/data/index.js';
import { createModalManager } from '../../src/ui/modals/modal-manager.js';
import { createUiFormatters, formatDurationMMSS, formatSkillBreakdown, renderAffixChipsHtml } from '../../src/ui/shared/formatters.js';

test('duration formatting rounds seconds, clamps negatives and keeps elapsed minutes', () => {
  assert.equal(formatDurationMMSS(0), '0分00秒');
  assert.equal(formatDurationMMSS(-4), '0分00秒');
  assert.equal(formatDurationMMSS(64.7), '1分05秒');
  assert.equal(formatDurationMMSS(3663), '61分03秒');
});

test('affix chips preserve the occupied and empty slot markup and skip unknown affixes', () => {
  assert.equal(renderAffixChipsHtml({}), '');
  assert.equal(renderAffixChipsHtml({ affixes: [] }), '');
  assert.equal(
    renderAffixChipsHtml({ affixes: [{ id: 'fire_brand', tier: 2 }, null] }),
    '<span class="affix-chip fire common" title="攻击命中 58% 施加【火标】，火/爆伤 +11%">🔥炽炎烙印 T2</span><span class="affix-chip">[空槽2]</span>',
  );
  assert.equal(
    renderAffixChipsHtml({ affixes: [{}, { id: 'unknown' }, null] }),
    '<span class="affix-chip">[空槽3]</span>',
  );
});

test('each skill breakdown preserves current stats, W10 labels and max-level copy', () => {
  const hs = { dmgMult: 1, rangeMult: 1, aspd: 1, gm: { extraShot: 0 } };
  const currentAtLevelTwo = {
    blades: '3 把飞刃 · 单次 29 伤（基础29×100%）· 半径 1.85格',
    firewave: '2 道穿透剑气 · 单次 52 伤 · 间隔 1.17s',
    thunder: '召唤 3 道 3连天雷 · 单次 60 伤 · 间隔 1.29s',
    nova: '冰环半径 2.43格 · 单次 51 伤 + 减速 · 间隔 1.93s',
    stomp: '震荡半径 2.48格 · 单次 80 伤 + 0.75s 晕眩 · 间隔 2.11s',
    berserk: '攻速 +36% · 暴击 +16% · 移速 +0.70 · 吸血 +4 · 磁铁 +1.7格',
  };
  const formatters = createUiFormatters({ getW10BranchSpec: key => W10_SKILL_BRANCHES[key][0] });
  for (const [key, cur] of Object.entries(currentAtLevelTwo)) {
    const { icon, name } = HERO_SKILLS[key];
    const base = formatSkillBreakdown(key, 2, hs);
    assert.equal(base.name, `${icon} ${name}`, key);
    assert.equal(base.lvText, 'Lv.2/5', key);
    assert.equal(base.cur, cur, key);
    assert.match(base.next, /^升至 Lv\.3：/, key);

    const branch = W10_SKILL_BRANCHES[key][0];
    const maxed = formatters.getSkillBreakdown(key, 5, hs);
    assert.deepEqual(maxed, formatSkillBreakdown(key, 5, hs, branch), key);
    assert.equal(maxed.name, `${icon} ${name} · 【W10:${branch.name}】`, key);
    assert.ok(maxed.cur.endsWith(` · ${branch.tag}`), key);
    assert.equal(maxed.lvText, 'Lv.5/5', key);
    assert.equal(maxed.next, '已满级 Lv.5', key);
  }
  const twinOrbit = W10_SKILL_BRANCHES.blades.find(branch => branch.key === 'bl_twin_orbit');
  assert.match(formatSkillBreakdown('blades', 2, hs, twinOrbit).cur, /^5 把飞刃/);
  assert.equal(formatters.renderAffixChipsHtml, renderAffixChipsHtml);
  assert.equal(formatters.formatDurationMMSS, formatDurationMMSS);
});

function modalFixture() {
  const game = {
    phase: 'prep', autoWave: true, autoWavePausedForDecision: false,
    pendingModals: [], activeModal: null, hero: { breakthroughs: {} },
  };
  const runtimeCtx = createRuntimeContext({ game });
  const backdrop = { hidden: false };
  const calls = [];
  const modals = createModalManager(runtimeCtx, {
    getEl(id) {
      assert.equal(id, 'modalBackdrop');
      return backdrop;
    },
    progressionModals: {
      renderStarterModal: () => calls.push(['starter', game.activeModal]),
      renderChestModal: (...args) => calls.push(['chest', ...args]),
      renderW10BreakthroughModal: () => calls.push(['w10', game.activeModal.step]),
      renderW20BreakthroughModal: () => calls.push(['w20']),
    },
    run: {
      syncW29FinalPrepStart() {
        assert.equal(game.activeModal, null);
        assert.equal(backdrop.hidden, true);
        calls.push(['w29']);
      },
    },
  });
  return { game, backdrop, calls, modals };
}

test('queueModal suspends prep auto-wave and dispatches queued modals FIFO', () => {
  const { game, calls, modals } = modalFixture();
  const starter = { type: 'starter' };
  const chest = { type: 'chest', legend: 1 };
  modals.queueModal(starter);
  modals.queueModal(chest);
  assert.equal(game.autoWavePausedForDecision, true);
  assert.equal(game.activeModal, starter);
  assert.deepEqual(game.pendingModals, [chest]);
  assert.deepEqual(calls, [['starter', starter]]);

  game.phase = 'battle';
  game.autoWavePausedForDecision = false;
  modals.queueModal({ type: 'starter' });
  assert.equal(game.autoWavePausedForDecision, false);
  modals.closeModal();
  assert.equal(game.activeModal, chest);
  assert.deepEqual(game.pendingModals, [{ type: 'starter' }]);
  assert.deepEqual(calls, [['starter', starter], ['chest', true, false]]);
});

test('closeModal continues queued rewards, reopens pending breakthroughs and then syncs W29 prep', () => {
  const { game, backdrop, calls, modals } = modalFixture();
  game.pendingModals.push({ type: 'chest', shrineTier: true });
  game.pendingBreakthrough = 'w10';
  game.finalPrep = { active: true, awaitingWaveRewards: true };

  modals.closeModal();
  assert.equal(game.activeModal.type, 'chest');
  modals.closeModal();
  assert.deepEqual(game.activeModal, { type: 'w10_breakthrough', step: 'pick_skill' });

  game.w10Draft = { skillKey: 'blades' };
  modals.closeModal();
  assert.deepEqual(game.activeModal, { type: 'w10_breakthrough', step: 'pick_branch' });

  game.hero.breakthroughs.w10 = true;
  game.pendingBreakthrough = 'w20';
  game.w20Draft = {};
  modals.closeModal();
  assert.deepEqual(game.activeModal, { type: 'w20_breakthrough' });

  game.w20Draft = null;
  backdrop.hidden = false;
  modals.closeModal();
  assert.deepEqual(calls, [['chest', false, true], ['w10', 'pick_skill'], ['w10', 'pick_branch'], ['w20'], ['w29']]);
  assert.equal(game.activeModal, null);
  assert.equal(backdrop.hidden, true);
});
