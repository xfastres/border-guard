import { HERO_SKILLS, W10_SKILL_BRANCHES } from '../../data/core-data.js';

export function createW10Breakthrough(ctx, { meta, unlock, hero }) {
  const { lockMetaLoadoutForRun } = meta;
  const { getActiveUnlockNode, getSealStarCap, getSubSealSlotCap } = unlock;
  const { refreshCombos, syncHeroMaxHp } = hero;

  function getW10BranchSpec(skillKey, branchKey = ctx.game?.hero?.w10Branch?.[skillKey]){
    if (!skillKey || !branchKey) return null;
    return (W10_SKILL_BRANCHES[skillKey] || []).find(b => b.key === branchKey) || null;
  }

  function pickHeroSkill(key){
    if (!ctx.game || !HERO_SKILLS[key]) return false;
    const m = ctx.game.activeModal;
    if (!m || (m.type !== 'starter' && m.type !== 'levelup')) return false;
    if (m.claimed) return false;
    if (!Array.isArray(m.choices) || !m.choices.includes(key)) return false;
    if ((ctx.game.hero.skills[key] || 0) >= 5) return false;

    // ATOMIC SINGLE-CLAIM LOCK BEFORE STATE MUTATION
    m.claimed = true;
    m.claimedChoice = key;

    if (!ctx.game.metaRunLocked) lockMetaLoadoutForRun();
    ctx.game.hero.skills[key] = (ctx.game.hero.skills[key] || 0) + 1;
    ctx.ports.audio.play('merge', 1.1);
    ctx.ports.ui.toast(`领主习得【${HERO_SKILLS[key].name} Lv.${ctx.game.hero.skills[key]}】！`);
    refreshCombos(true);
    ctx.ports.modals.closeModal();
    ctx.ports.ui.renderAllUI(true);
    return true;
  }

  function getLearnedSkillKeys(){
    const h = ctx.game.hero;
    const learned = Object.keys(h.skills).filter(k => (h.skills[k] || 0) > 0 && W10_SKILL_BRANCHES[k]?.length);
    if (learned.length) return learned;
    return ['firewave'];
  }

  function rollW10BranchChoices(skillKey){
    const pool = (W10_SKILL_BRANCHES[skillKey] || []).slice();
    const out = [];
    while (out.length < 3 && pool.length) {
      out.push(pool.splice(Math.floor(ctx.game.rnd() * pool.length), 1)[0]);
    }
    return out;
  }

  function selectW10BreakthroughSkill(skillKey){
    if (!ctx.game) return { ok: false, reason: 'no_game' };
    const learned = getLearnedSkillKeys();
    if (!learned.includes(skillKey)) {
      return { ok: false, reason: 'skill_not_learned', learned };
    }
    const branches = rollW10BranchChoices(skillKey);
    ctx.game.w10Draft = {
      skillKey,
      choices: branches.map(b => b.key),
      branches
    };
    if (ctx.game.activeModal && ctx.game.activeModal.type === 'w10_breakthrough') {
      ctx.game.activeModal.step = 'pick_branch';
      ctx.ports.modals.renderW10BreakthroughModal();
    }
    return { ok: true, skillKey, choices: branches };
  }

  function pickW10BreakthroughBranch(branchKey){
    if (!ctx.game || !ctx.game.w10Draft || !ctx.game.w10Draft.skillKey) {
      return { ok: false, reason: 'no_w10_skill_selected' };
    }
    const skillKey = ctx.game.w10Draft.skillKey;
    const allBranches = W10_SKILL_BRANCHES[skillKey] || [];
    const branch = allBranches.find(b => b.key === branchKey);
    if (!branch) {
      return { ok: false, reason: 'invalid_branch_key', skillKey };
    }
    const h = ctx.game.hero;
    h.w10Branch[skillKey] = branch.key;
    h.breakthroughs.w10 = {
      wave: 10,
      completed: true,
      skillKey,
      skillName: HERO_SKILLS[skillKey]?.name || skillKey,
      branchKey: branch.key,
      branchName: branch.name,
      tag: branch.tag,
      hook: branch.hook || branch.hookType,
      hookType: branch.hookType || branch.hook,
      desc: branch.desc
    };
    ctx.game.pendingBreakthrough = null;
    ctx.game.w10Draft = null;
    ctx.game.stats.breakthroughsCompleted = (ctx.game.stats.breakthroughsCompleted || 0) + 1;
    h.realm = getActiveUnlockNode().idx;
    h.baseMaxHp += 40;
    syncHeroMaxHp();
    h.hp = Math.min(h.maxHp, h.hp + 80);
    ctx.ports.ui.flashScreen('gold');
    ctx.ports.audio.play('level', 1.25);
    ctx.ports.vfx.addRing(h.x, h.y, '#ffd666', 4.2);
    ctx.ports.ui.showBanner(
      `⚡ W10 大型突破完成 · 【${HERO_SKILLS[skillKey]?.name} · ${branch.name}】！`,
      `主灵印上限升至 ${getSealStarCap()}★ · 辅灵印扩至 ${getSubSealSlotCap()} 槽 · 解锁【重锤震地】神通池！`,
      'good'
    );
    if (ctx.game.activeModal && ctx.game.activeModal.type === 'w10_breakthrough') {
      ctx.ports.modals.closeModal();
    }
    refreshCombos(true);
    ctx.ports.ui.renderAllUI(true);
    return { ok: true, breakthrough: h.breakthroughs.w10 };
  }

  return {
    getW10BranchSpec,
    pickHeroSkill,
    getLearnedSkillKeys,
    rollW10BranchChoices,
    selectW10BreakthroughSkill,
    pickW10BreakthroughBranch,
  };
}
