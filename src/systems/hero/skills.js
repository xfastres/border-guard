import BALANCE from '../../data/balance.js';
import { createRouteSkills } from './route-skills.js';
import { W, H } from '../../data/index.js';
import { dist, clamp } from '../../core/math.js';
import { perkLv, hasCombo, hasW20Direction, hasW20Enhancement, hasDestinyEnhancement } from '../../core/state-queries.js';

const sb = BALANCE.progression.skillBase;

export function createHeroSkills(ctx, deps) {
  const { getActiveMetaMain, hasMetaAux } = deps.meta;
  const { getActiveGearAffixSynergies } = deps.equipment;
  const { getHeroStats, gearSetTier } = deps.hero;
  const {
    recordW20Proc, recordDestinyProc, isIsolatedHighValueTarget, triggerW20ElementalEcho,
    applyFireMark, triggerFireDetonation, applyFrostSlow, triggerFrostPulse, gainFrostShield,
    isEnemyUnstoppable, applyHeroLifesteal, dealDamage, fireChainLightning, pushProjectile,
  } = deps.combat;

  const routeSkills = createRouteSkills(ctx, deps.combat, pickAimTarget);

  function executeBreakerShockwave(cx, cy, radius, dmgMult, isAftershock = false){
    const game = ctx.game;
    const hs = getHeroStats();
    const baseDmg = Math.round(46 * hs.skillDmgMult * dmgMult);
    ctx.ports.vfx.addRing(cx, cy, isAftershock ? '#ffe478' : '#d89eff', radius);
    ctx.ports.vfx.addFloat(cx, cy - 0.75, isAftershock ? '⚡破阵二段震!' : '⚡破阵蓄势!', '#e6b8ff', true);
    let hitCnt = 0;
    let hitSlowed = false;
    let hitEliteOrBoss = false;
    const stateRes = hasW20Enhancement(game, 'w20_brk_state_resonance');
    const eliteHunt = hasW20Enhancement(game, 'w20_brk_elite_hunter');
    for (const e of game.enemies) {
      if (e.hp <= 0 || dist(e, { x: cx, y: cy }) > radius + e.r) continue;
      hitCnt++;
      if (isAftershock && !e.boss && !isEnemyUnstoppable(e)) {
        const d = dist(e, { x: cx, y: cy });
        if (d > 0.4) {
          e.x = clamp(e.x + (cx - e.x) / d * 0.85, 0.8, W - 0.8);
          e.y = clamp(e.y + (cy - e.y) / d * 0.85, 0.8, H - 0.8);
        }
      }
      e.vulnT = Math.max(e.vulnT || 0, 3.0);
      if (stateRes) {
        applyFireMark(e, 1, 'w20_brk_state_resonance', 4.5);
        applyFrostSlow(e, 0.55, 3.0, 'w20_brk_state_resonance');
      }
      if ((e.slowT || 0) > 0 || (e.freezeT || 0) > 0) hitSlowed = true;
      if (e.boss || e.elite) hitEliteOrBoss = true;
      dealDamage(e, baseDmg, {
        fromHero: true, skillKey: 'dash', isThunder: true, critChance: hs.crit, critDmg: hs.critDmg,
        col: '#dfb3ff', lifesteal: hs.lifesteal, noFireDetonate: true, noFrostShieldProc: true
      });
      if (e.hp > 0 && (e.fireMarkT || 0) > 0) {
        triggerFireDetonation(e, 1.10, { radius: 1.85, skillKey: 'dash' });
      }
      if (eliteHunt && e.hp > 0 && (e.boss || e.elite || e.vulnT > 0)) {
        recordW20Proc('enhancement');
        fireChainLightning(e, Math.round(baseDmg * 0.9), 2, { ox: e.x, oy: e.y - 3.0, skillKey: 'dash', noChainProc: true });
      }
      if (hasW20Enhancement(game, 'w20_shared_boss_breaker') && e.hp > 0 && isIsolatedHighValueTarget(e, 3.2)) {
        recordW20Proc('enhancement');
        e.vulnT = Math.max(e.vulnT || 0, 3.5);
        dealDamage(e, Math.round(baseDmg * 0.65), { fromHero: false, skillKey: 'perk', col: '#ffe680', noFireDetonate: true });
      }
    }
    const be = BALANCE.w20Breakthrough?.baseEffects || {};
    if (hitSlowed || stateRes) {
      gainFrostShield(be.breakerDashShieldOnSlow || 22, { duration: 4.5, source: 'w20_breaker_dash' });
    }
    if (hasW20Enhancement(game, 'w20_brk_vanguard_aegis') && hitCnt > 0) {
      recordW20Proc('enhancement');
      gainFrostShield(hitCnt * 12, { duration: 4.8, source: 'w20_brk_vanguard_aegis' });
    }
    if (eliteHunt && hitEliteOrBoss && game.hero) {
      game.hero.dashCd = Math.max(0, (game.hero.dashCd || 0) - 1.0);
    }
    if (stateRes) recordW20Proc('enhancement');
    return hitCnt;
  }

  function castHeroDash(){
    if (ctx.paused || ctx.game.activeModal) return false;
    const game = ctx.game;
    const h = game.hero;
    if (h.dashCd > 0) { ctx.ports.ui.toast(`烈焰冲刺冷却中 (${h.dashCd.toFixed(1)}s)`, true); return false; }
    if (game.curWaveTel) game.curWaveTel.dashCount++;
    const hadFrostShieldBeforeDash = h.shield > 0 && h.frostShieldActive;
    const hs = getHeroStats();
    const pointerScreen = ctx.ports.input.getPointerScreen();
    let pointerWorld = ctx.ports.input.getPointerWorld();
    if (pointerScreen) {
      pointerWorld = ctx.ports.viewport.screenToWorld(pointerScreen.x, pointerScreen.y);
      ctx.ports.input.setPointerWorld(pointerWorld);
    }
    const keys = ctx.ports.input.getKeys();
    let dx = Number(keys.has('d')||keys.has('arrowright')) - Number(keys.has('a')||keys.has('arrowleft'));
    let dy = Number(keys.has('s')||keys.has('arrowdown')) - Number(keys.has('w')||keys.has('arrowup'));
    if (!dx && !dy) {
      if (pointerWorld) { dx = pointerWorld.x - h.x; dy = pointerWorld.y - h.y; }
      else { dx = h.face; dy = 0; }
    }
    const len = Math.max(0.01, Math.hypot(dx, dy));
    dx /= len; dy /= len;
    const ox = h.x, oy = h.y;
    const dashDist = 3.8;
    h.x = clamp(h.x + dx * dashDist, 1.2, W - 1.2);
    h.y = clamp(h.y + dy * dashDist, 1.2, H - 1.2);
    const dashCadenceAux = hasMetaAux('aux_dash_cadence');
    h.invuln = 0.6 + (dashCadenceAux ? 0.06 : 0);
    deps.combat.onBuildDash?.();
    routeSkills.afterDash(dx, dy, hs);
    const prevDashShield = h.shield || 0;
    h.shield = Math.max(prevDashShield, 35);
    const dashShieldGain = Math.max(0, Math.round(h.shield - prevDashShield));
    if (dashShieldGain > 0 && game.stats) game.stats.shieldGained = (game.stats.shieldGained || 0) + dashShieldGain;
    h.shieldTimer = Math.max(h.shieldTimer || 0, 3.5);
    const wgLv = perkLv(game, 'wind_gale');
    const be = BALANCE.w20Breakthrough?.baseEffects || {};
    let cdFactor = wgLv >= 2 ? 0.55 : wgLv === 1 ? 0.75 : 1.0;
    if (hasW20Direction(game, 'breaker_momentum')) cdFactor *= (be.breakerDashCdFactor || 0.80);
    if (hasW20Enhancement(game, 'w20_shared_tactical_surge')) {
      cdFactor *= 0.75;
      h.w20TacticalReadyT = 2.5;
    }
    const hasPhantomStride = hasDestinyEnhancement(game, 'destiny_phantom_stride');
    if (hasPhantomStride) {
      cdFactor *= 0.82;
      h.destinyDashBuffT = 2.2;
      recordDestinyProc('destiny_phantom_stride');
    }
    if (wgLv > 0) h.dashBuffT = 2.0;
    if (getActiveMetaMain()?.id === 'main_wind') {
      h.dashBuffT = Math.max(h.dashBuffT || 0, Number(getActiveMetaMain()?.effects?.dashGlideDuration || 1.4));
    }
    const baseDashCd = Math.max(2.6, 4.2 - (dashCadenceAux ? 0.35 : 0));
    h.dashCd = Math.max(1.0, (baseDashCd * cdFactor) / (1 + Math.max(0, hs.gm.aspd) * 0.6));

    const w20FireDash = hasW20Enhancement(game, 'w20_fire_dash_detonator');
    for (let s = 0; s < 3; s++) {
      const px = ox + (h.x - ox) * (s / 2);
      const py = oy + (h.y - oy) * (s / 2);
      ctx.ports.vfx.addRing(px, py, hasPhantomStride ? '#9effea' : '#ff7b47', 1.45);
      for (const e of game.enemies) {
        if (e.hp > 0 && dist(e, {x:px,y:py}) <= 1.55) {
          if (w20FireDash) applyFireMark(e, 2, 'w20_fire_dash_detonator', 5.0);
          if (hasPhantomStride) {
            applyFireMark(e, 1, 'destiny_phantom_stride', 4.5);
            applyFrostSlow(e, 0.40, 2.8, 'destiny_phantom_stride');
          }
          dealDamage(e, Math.round(32 * hs.dmgMult), { fromHero:true, skillKey:'dash', critChance:hs.crit, critDmg:hs.critDmg, col:'#ff8e52', burn:12, lifesteal:hs.lifesteal });
        }
      }
    }
    // Stage 3 W20 [w20_fire_dash_detonator]: detonate all marked enemies within 3.2 tiles of dash landing
    if (w20FireDash) {
      let detonatedAny = false;
      for (const e of game.enemies) {
        if (e.hp > 0 && (e.fireMarkT || 0) > 0 && dist(e, h) <= 3.2 + e.r) {
          triggerFireDetonation(e, 1.15, { radius: 2.0, skillKey: 'dash' });
          detonatedAny = true;
        }
      }
      if (detonatedAny) recordW20Proc('enhancement');
    }
    // Stage 2 Frost Trio OR Stage 3 W20 Base [frost_bastion_counter]: active dash frost pulse when holding Frost Shield!
    const allowDashFrostPulse = hadFrostShieldBeforeDash && (getActiveGearAffixSynergies().hasFrostTrio || hasW20Direction(game, 'frost_bastion_counter'));
    if (allowDashFrostPulse && (h.frostActivePulseCd || 0) <= 0) {
      const sc = BALANCE.equipment?.synergyCombat || {};
      const pulseRad = hasW20Direction(game, 'frost_bastion_counter') ? Math.max(sc.frostTrioActivePulseRadius || 3.25, be.frostBasePulseRadius || 3.05) : (sc.frostTrioActivePulseRadius || 3.25);
      const pulseDmg = hasW20Direction(game, 'frost_bastion_counter') ? Math.max(sc.frostTrioActivePulseDmg || 46, be.frostBasePulseDmg || 46) : (sc.frostTrioActivePulseDmg || 46);
      triggerFrostPulse(pulseRad, pulseDmg, 1.0, 'dash_shield');
      if (hasW20Enhancement(game, 'w20_frost_dash_ring')) {
        recordW20Proc('enhancement');
        gainFrostShield(24, { duration: 5.0, source: 'w20_frost_dash_ring', noFullShieldPulse: true });
        game.zones.push({
          kind: 'frostTrail', w20Source: 'w20_frost_dash_ring', x: h.x, y: h.y, r: 2.25,
          t: 2.8, max: 2.8, tick: 0.45, dps: Math.round(32 * hs.skillDmgMult)
        });
      }
    }
    // Stage 3 W20 Base [breaker_momentum]: landing shockwave that shreds armor & triggers fire/frost state hooks!
    if (hasW20Direction(game, 'breaker_momentum')) {
      recordW20Proc('base');
      if (game.stats) game.stats.w20BreakerSlams = (game.stats.w20BreakerSlams || 0) + 1;
      const vanguardBoost = (hasW20Enhancement(game, 'w20_brk_vanguard_aegis') && h.shield > 0) ? 1.30 : 1.0;
      const brkRad = (be.breakerDashRadius || 2.9) * vanguardBoost;
      executeBreakerShockwave(h.x, h.y, brkRad, be.breakerDashDmgMult || 1.45, false);
      if (hasW20Enhancement(game, 'w20_brk_aftershock_dash')) {
        recordW20Proc('enhancement');
        h.w20AftershockQueue = h.w20AftershockQueue || [];
        h.w20AftershockQueue.push({ x: h.x, y: h.y, t: 0.45, r: 3.8, dmgMult: 1.25 });
      }
      if (hasW20Enhancement(game, 'w20_brk_tempest_step')) {
        recordW20Proc('enhancement');
        const baseAng = Math.atan2(dy, dx);
        for (let i = -1; i <= 1; i++) {
          const a = baseAng + i * 0.22;
          pushProjectile({
            kind: 'arrow', w20Source: 'w20_brk_tempest_step', x: h.x, y: h.y,
            vx: Math.cos(a) * 16.5, vy: Math.sin(a) * 16.5,
            life: 0.45, r: 0.34, pierce: 3, hitSet: new Set(),
            dmg: Math.round(38 * hs.skillDmgMult), splash: 0,
            opts: { fromHero: true, skillKey: 'dash', isWind: true, critChance: hs.crit, critDmg: hs.critDmg, col: '#9effdc' }
          });
        }
      }
      if (hasW20Enhancement(game, 'w20_shared_elemental_echo')) {
        h.w20EchoFrostCnt = (h.w20EchoFrostCnt || 0) + 1;
        if (h.w20EchoFrostCnt >= 2) {
          h.w20EchoFrostCnt = 0;
          triggerW20ElementalEcho();
        }
      }
    }
    // Sword Echo (剑影分身): dash unleashes 1 or 4 piercing sword waves!
    const seLv = perkLv(game, 'sword_echo');
    if (seLv > 0) {
      const baseAng = Math.atan2(dy, dx);
      const dirs = seLv >= 2 ? [0, Math.PI/2, Math.PI, -Math.PI/2] : [0];
      for (const off of dirs) {
        const a = baseAng + off;
        pushProjectile({
          kind:'firewave', x: h.x, y: h.y, vx: Math.cos(a)*12, vy: Math.sin(a)*12,
          life: 0.35 * hs.rangeMult, r: 0.52, pierce: 2, hitSet: new Set(),
          dmg: Math.round(36 * hs.skillDmgMult), critChance: hs.crit, critDmg: hs.critDmg, lifesteal: hs.lifesteal, bonusGold: hs.gm.bonusGold,
          isThunderFireCombo: hasCombo(game, 'thunder_fire')
        });
      }
    }
    // Thunder Set 2pc/3pc: Dash calls purple chain lightning at landing (and start at 3pc)
    const thSet = gearSetTier('thunder');
    if (thSet >= 2) {
      const aliveTh = game.enemies.filter(e => e.hp > 0);
      const strikeAt = (px, py, ch) => {
        const tgt = aliveTh.filter(e => e.hp > 0 && dist({x:px, y:py}, e) <= 5.0).sort((a,b) => dist({x:px,y:py},a) - dist({x:px,y:py},b))[0];
        if (tgt) fireChainLightning(tgt, Math.round(40 * hs.dmgMult), ch, { ox: px, oy: py, skillKey:'perk', critChance:hs.crit, critDmg:hs.critDmg });
      };
      strikeAt(h.x, h.y, thSet >= 3 ? 4 : 3);
      if (thSet >= 3) strikeAt(ox, oy, 4);
    }
    ctx.ports.audio.play('fire', 1.2);
    ctx.ports.ui.renderAllUI();
    return true;
  }

  function castHeroOverdrive(){
    if (ctx.paused || ctx.game.activeModal) return false;
    const game = ctx.game;
    const h = game.hero;
    if (h.ultCd > 0) { ctx.ports.ui.toast(`全军超载冷却中 (${h.ultCd.toFixed(1)}s)`, true); return false; }
    if (game.curWaveTel) game.curWaveTel.ultCount++;
    deps.combat.beginBloodWindow?.();
    h.ultTimer = perkLv(game, 'ult_engine') >= 2 ? 8.0 : 5.0;
    const hasOdNova = hasDestinyEnhancement(game, 'destiny_overdrive_nova');
    h.ultCd = hasOdNova ? Number((18.0 * 0.78).toFixed(2)) : 18.0;
    game.shake = 6;
    ctx.ports.vfx.addRing(h.x, h.y, '#ffe478', 4.5);
    ctx.ports.vfx.addFloat(h.x, h.y - 0.6, `⚡ 全军超载 ${h.ultTimer}s！攻速+80% 暴击+35%`, '#ffe878', true);
    if (hasOdNova) {
      recordDestinyProc('destiny_overdrive_nova');
      const hs = getHeroStats();
      const novaRad = 4.6;
      ctx.ports.vfx.addRing(h.x, h.y, '#c89eff', novaRad);
      ctx.ports.vfx.addFloat(h.x, h.y - 1.0, '🌠 天命·星陨超载!', '#e4c4ff', true);
      gainFrostShield(45, { duration: 6.0, source: 'destiny_overdrive_nova' });
      for (const e of game.enemies) {
        if (e.hp > 0 && dist(e, h) <= novaRad + e.r) {
          applyFireMark(e, 1, 'destiny_overdrive_nova', 5.0);
          applyFrostSlow(e, 0.50, 3.2, 'destiny_overdrive_nova');
          dealDamage(e, Math.round(78 * hs.skillDmgMult), {
            fromHero: true, skillKey: 'perk', critChance: hs.crit, critDmg: hs.critDmg, col: '#e4c4ff'
          });
        }
      }
    }
    ctx.ports.audio.play('merge', 1.15);
    ctx.ports.ui.renderAllUI();
    return true;
  }

  function pickAimTarget(alive, range = 99, preferPriority = false){
    const game = ctx.game;
    const h = game.hero;
    const inRange = alive.filter(e => dist(h, e) <= range);
    if (!inRange.length) return null;
    if (preferPriority) {
      return inRange.slice().sort((a, b) => {
        const sa = (a.boss ? 1000 : a.elite ? 500 : a.shaman ? 300 : (a.bomber || a.ranged) ? 150 : 0) - dist(h, a) * 10;
        const sb = (b.boss ? 1000 : b.elite ? 500 : b.shaman ? 300 : (b.bomber || b.ranged) ? 150 : 0) - dist(h, b) * 10;
        return sb - sa;
      })[0];
    }
    const pointerWorld = ctx.ports.input.getPointerWorld();
    if (pointerWorld && dist(h, pointerWorld) > 0.5) {
      const aimAng = Math.atan2(pointerWorld.y - h.y, pointerWorld.x - h.x);
      const inCone = inRange.filter(e => {
        let diff = Math.abs(Math.atan2(e.y - h.y, e.x - h.x) - aimAng);
        if (diff > Math.PI) diff = Math.PI * 2 - diff;
        return diff <= 0.65;
      });
      if (inCone.length) return inCone.sort((a, b) => dist(h, a) - dist(h, b))[0];
    }
    return inRange.slice().sort((a, b) => dist(h, a) - dist(h, b))[0];
  }

  function updateHero(dt){
    const game = ctx.game;
    const h = game.hero;
    const hs = getHeroStats();
    h.dashCd = Math.max(0, h.dashCd - dt);
    h.ultCd = Math.max(0, h.ultCd - dt);
    h.ultTimer = Math.max(0, h.ultTimer - dt);
    h.dashBuffT = Math.max(0, h.dashBuffT - dt);
    h.destinyDashBuffT = Math.max(0, (h.destinyDashBuffT || 0) - dt);
    h.destinyFrostMoveT = Math.max(0, (h.destinyFrostMoveT || 0) - dt);
    h.destinyEmberCd = Math.max(0, (h.destinyEmberCd || 0) - dt);
    h.destinyBreakerCd = Math.max(0, (h.destinyBreakerCd || 0) - dt);
    h.thornsCd = Math.max(0, h.thornsCd - dt);
    h.frostPulseCd = Math.max(0, (h.frostPulseCd || 0) - dt);
    h.frostActivePulseCd = Math.max(0, (h.frostActivePulseCd || 0) - dt);
    h.gearFrostShieldCd = Math.max(0, (h.gearFrostShieldCd || 0) - dt);
    h.w20TacticalReadyT = Math.max(0, (h.w20TacticalReadyT || 0) - dt);
    h.invuln = Math.max(0, h.invuln - dt);
    h.armorBreakT = Math.max(0, (h.armorBreakT || 0) - dt);
    h.leechTimer = (h.leechTimer || 0) + dt;
    if (h.leechTimer >= 1.0) { h.leechTimer -= 1.0; h.leechUsed = 0; }
    if (h.shieldTimer > 0) {
      h.shieldTimer = Math.max(0, h.shieldTimer - dt);
      if (h.shieldTimer === 0) { h.shield = 0; h.frostShieldActive = false; }
    }
    // Stage 4 Destiny Enhancement [destiny_aegis_bulwark]: auto-refresh 32 Frost Shield every 8s during wave!
    if (game.phase === 'wave' && hasDestinyEnhancement(game, 'destiny_aegis_bulwark')) {
      h.destinyBulwarkTimer = (h.destinyBulwarkTimer ?? 8.0) - dt;
      if (h.destinyBulwarkTimer <= 0) {
        h.destinyBulwarkTimer = 8.0;
        recordDestinyProc('destiny_aegis_bulwark');
        gainFrostShield(32, { duration: 5.5, source: 'destiny_aegis_bulwark' });
        ctx.ports.vfx.addFloat(h.x, h.y - 0.75, '🛡️玄天金钟 +32盾', '#ffe484');
      }
    }
    // Process W20 delayed Breaker Aftershocks
    if (h.w20AftershockQueue?.length) {
      for (const q of h.w20AftershockQueue) {
        q.t -= dt;
        if (q.t <= 0) executeBreakerShockwave(q.x, q.y, q.r, q.dmgMult, true);
      }
      h.w20AftershockQueue = h.w20AftershockQueue.filter(q => q.t > 0);
    }
    // Stage 3 W20 Base [frost_bastion_counter]: while Frost Shield is up, periodic subtle chill aura sustains slows!
    if (game.phase === 'wave' && hasW20Direction(game, 'frost_bastion_counter') && h.shield > 0 && h.frostShieldActive) {
      const be = BALANCE.w20Breakthrough?.baseEffects || {};
      h.w20FrostAuraTimer = (h.w20FrostAuraTimer ?? (be.frostBaseAuraInterval || 1.6)) - dt;
      if (h.w20FrostAuraTimer <= 0) {
        h.w20FrostAuraTimer = be.frostBaseAuraInterval || 1.6;
        let chilled = false;
        for (const e of game.enemies) {
          if (e.hp > 0 && dist(h, e) <= 3.4 + e.r) {
            applyFrostSlow(e, 0.45, 2.6, 'w20_frost_aura');
            chilled = true;
          }
        }
        if (chilled) {
          recordW20Proc('base');
          ctx.ports.vfx.addRing(h.x, h.y, 'rgba(142,244,255,0.65)', 3.4);
        }
      }
    }

    const pointerDown = ctx.ports.input.isPointerDown();
    const pointerScreen = ctx.ports.input.getPointerScreen();
    let pointerWorld = ctx.ports.input.getPointerWorld();
    if (pointerDown && pointerScreen) {
      pointerWorld = ctx.ports.viewport.screenToWorld(pointerScreen.x, pointerScreen.y);
      ctx.ports.input.setPointerWorld(pointerWorld);
    }

    // Crowd slowdown (怪群挤压阻滞): being surrounded slows normal walking unless Dashing/Overdriving!
    let crowdCnt = 0;
    if (game.phase === 'wave' && h.ultTimer <= 0 && h.invuln <= 0) {
      for (const e of game.enemies) {
        if (e.hp > 0 && dist(e, h) <= 0.85 + e.r) crowdCnt++;
      }
    }
    const crowdMult = crowdCnt > 0 ? Math.max(0.55, 1 - crowdCnt * 0.11) : 1.0;

    // Movement (WASD / Arrows / Hold-pointer) across open 64x48 world
    const prevX = h.x, prevY = h.y;
    const spd = hs.moveSpd * crowdMult;
    const keys = ctx.ports.input.getKeys();
    let dx = Number(keys.has('d')||keys.has('arrowright')) - Number(keys.has('a')||keys.has('arrowleft'));
    let dy = Number(keys.has('s')||keys.has('arrowdown')) - Number(keys.has('w')||keys.has('arrowup'));
    if (dx || dy) {
      h.goal = null;
      const len = Math.hypot(dx, dy);
      dx /= len; dy /= len;
      if (dx) h.face = dx < 0 ? -1 : 1;
      h.x = clamp(h.x + dx * spd * dt, 1.2, W - 1.2);
      h.y = clamp(h.y + dy * spd * dt, 1.2, H - 1.2);
      h.moving = true;
    } else if (pointerDown && pointerWorld && !game.mode) {
      const d = dist(h, pointerWorld);
      if (d > 0.25) {
        const mx = (pointerWorld.x - h.x) / d, my = (pointerWorld.y - h.y) / d;
        if (Math.abs(mx) > 0.05) h.face = mx < 0 ? -1 : 1;
        h.x = clamp(h.x + mx * spd * dt, 1.2, W - 1.2);
        h.y = clamp(h.y + my * spd * dt, 1.2, H - 1.2);
        h.moving = true;
      } else h.moving = false;
    } else if (h.goal) {
      const d = dist(h, h.goal);
      if (d <= 0.22) { h.goal = null; h.moving = false; }
      else {
        const mx = (h.goal.x - h.x) / d, my = (h.goal.y - h.y) / d;
        if (Math.abs(mx) > 0.05) h.face = mx < 0 ? -1 : 1;
        h.x = clamp(h.x + mx * spd * dt, 1.2, W - 1.2);
        h.y = clamp(h.y + my * spd * dt, 1.2, H - 1.2);
        h.moving = true;
      }
    } else {
      h.moving = false;
    }
    if (game.curWaveTel && game.phase === 'wave') {
      game.curWaveTel.moveDist += Math.hypot(h.x - prevX, h.y - prevY);
    }

    // Only fire combat skills when enemies exist AND starter skill has been picked!
    if (game.phase !== 'wave') return;
    const alive = game.enemies.filter(e => e.hp > 0);
    if (!alive.length) return;
    const hasAnySkill = Object.values(h.skills).some(v => v > 0);
    if (!hasAnySkill) return;

    // 0. Innate Spirit Sword Trigger (本命御剑引子: NEVER fires at thin air when no enemy is in range!)
    h.skillTimers.spirit = Math.max(0, (h.skillTimers.spirit ?? 0) - dt * hs.aspd);
    if (h.skillTimers.spirit <= 0) {
      const tgt = pickAimTarget(alive, 4.5 * hs.rangeMult, false);
      if (tgt) {
        h.skillTimers.spirit = sb.spirit.cd * hs.skillCdMult;
        const ang = Math.atan2(tgt.y - h.y, tgt.x - h.x);
        pushProjectile({
          kind: 'arrow', x: h.x, y: h.y, vx: Math.cos(ang) * 15.5, vy: Math.sin(ang) * 15.5,
          life: 0.30 * hs.rangeMult, r: 0.28, pierce: 1, hitSet: new Set(),
          dmg: Math.round(sb.spirit.dmg * hs.dmgMult), splash: 0,
          opts: { fromHero:true, skillKey:'spirit', critChance:hs.crit, critDmg:hs.critDmg, col:'#9fffe0', lifesteal:hs.lifesteal, bonusGold:hs.gm.bonusGold }
        });
      }
    }

    // Sword Set 2pc/3pc: firing bonus cloud swords while moving if enemies near
    const swordSet = gearSetTier('sword');
    if (swordSet >= 2 && h.moving) {
      h.swordSetTimer = Math.max(0, (h.swordSetTimer ?? 1.2) - dt * hs.aspd);
      if (h.swordSetTimer <= 0) {
        const tgt = pickAimTarget(alive, 6.0 * hs.rangeMult, false);
        if (tgt) {
          h.swordSetTimer = 1.60;
          const cnt = swordSet >= 3 ? 3 : 2;
          const baseAng = Math.atan2(tgt.y - h.y, tgt.x - h.x);
          for (let i = 0; i < cnt; i++) {
            const ang = baseAng + (i - (cnt - 1) / 2) * 0.18;
            pushProjectile({
              kind: 'arrow', x: h.x, y: h.y, vx: Math.cos(ang) * 16.5, vy: Math.sin(ang) * 16.5,
              life: 0.42 * hs.rangeMult, r: 0.26, pierce: 2, hitSet: new Set(),
              dmg: Math.round(22 * hs.dmgMult), splash: 0,
              opts: { fromHero:false, skillKey:'perk', isWind:true, critChance:hs.crit, critDmg:hs.critDmg, col:'#72f2b4', slow: swordSet >= 3 ? 0.25 : 0, slowDur: 1.6 }
            });
          }
        }
      }
    }

    // Frost Domain perk (凛冬领域): passive chilly aura around Hero
    const fdLv = perkLv(game, 'frost_domain');
    if (fdLv > 0) {
      h.frostDomainTick -= dt;
      if (h.frostDomainTick <= 0) {
        h.frostDomainTick = 0.45;
        const rad = fdLv >= 2 ? 4.5 : 3.2;
        for (const e of alive) {
          if (dist(h, e) <= rad + e.r) {
            dealDamage(e, Math.round((fdLv >= 2 ? 18 : 11) * hs.dmgMult), {
              fromHero:false, skillKey:'perk', col:'#8cf2ff', slow: fdLv >= 2 ? 0.50 : 0.35, slowDur: 1.0
            });
          }
        }
      }
    }

    // 1. Orbiting Blades (旋风飞刃) + W10 Branch Mechanics + Combo: 冰刃风暴 / 万剑诀
    const bLv = h.skills.blades || 0;
    if (bLv > 0) {
      const blBranch = h.w10Branch?.blades || null;
      const seMult = perkLv(game, 'sword_echo') >= 2 ? 1.65 : perkLv(game, 'sword_echo') === 1 ? 1.35 : 1.0;
      h.bladeAngle += dt * (4.2 + bLv * 0.55) * seMult * (1 + (hs.aspd - 1) * 0.35);
      const count = bLv + 1;
      let baseOrbitR = (1.65 + bLv * 0.10) * hs.skillRangeMult;
      if (blBranch === 'bl_expanding_storm') {
        const waveSin = Math.sin(game.waveClock * 3.2);
        baseOrbitR *= (1.10 + 0.35 * waveSin);
      }
      const rings = blBranch === 'bl_twin_orbit'
        ? [{ r: baseOrbitR * 0.72, dir: -1.25, tag: 'inner' }, { r: baseOrbitR * 1.24, dir: 1.0, tag: 'outer' }]
        : [{ r: baseOrbitR, dir: 1.0, tag: 'main' }];
      const now = game.waveClock;
      const hasIceBlades = hasCombo(game, 'ice_blades');
      for (const ring of rings) {
        for (let i = 0; i < count; i++) {
          const ang = h.bladeAngle * ring.dir + (Math.PI * 2 * i) / count;
          const bx = h.x + Math.cos(ang) * ring.r;
          const by = h.y + Math.sin(ang) * ring.r;
          for (const e of alive) {
            if (e.hp <= 0) continue;
            if (Math.hypot(e.x - bx, e.y - by) <= 0.55 + e.r) {
              const hitKey = ring.tag === 'inner' ? `in_${e.id}` : e.id;
              const lastHit = h.bladeHitMap.get(hitKey) || -9;
              if (now - lastHit >= sb.blades.hitCd) {
                h.bladeHitMap.set(hitKey, now);
                const wasChilled = e.slowT > 0 || e.freezeT > 0;
                dealDamage(e, Math.round((sb.blades.dmg + bLv * sb.blades.perLv) * hs.skillDmgMult), {
                  fromHero:true, skillKey:'blades',
                  critChance: hs.crit, critDmg: hs.critDmg,
                  col: blBranch === 'bl_crimson_wheel' ? '#ff8a52' : '#8cf2ff',
                  lifesteal: hs.lifesteal, bonusGold: hs.gm.bonusGold,
                  burn: blBranch === 'bl_crimson_wheel' ? 18 : 0,
                  slow: hasIceBlades ? 0.35 : hs.gm.slowOnHit, slowDur: hasIceBlades ? 2.0 : 2.2
                });
                if (blBranch === 'bl_crimson_wheel' && e.hp > 0) {
                  applyFireMark(e, 1, 'bl_crimson_wheel', 4.5);
                  if (e.fireMarkStacks >= 2) triggerFireDetonation(e, 1.15, 1.75, 'blades');
                } else if (blBranch === 'bl_frost_shuriken') {
                  if (e.hp > 0) applyFrostSlow(e, 0.50, 2.5, 'bl_frost_shuriken');
                  h.bladeOrbitTicks = (h.bladeOrbitTicks || 0) + 1;
                  if (h.bladeOrbitTicks % 3 === 0) {
                    gainFrostShield(10, 4.0, 80);
                    pushProjectile({
                      kind: 'arrow', w10Branch: 'bl_frost_shuriken', x: bx, y: by,
                      vx: Math.cos(ang) * 14, vy: Math.sin(ang) * 14,
                      life: 0.45 * hs.skillRangeMult, r: 0.35, pierce: 3, hitSet: new Set(),
                      dmg: Math.round((18 + bLv * 8) * hs.skillDmgMult), splash: 0,
                      opts: { fromHero:true, skillKey:'blades', critChance:hs.crit, critDmg:hs.critDmg, col:'#96f2ff', slow:0.45, slowDur:2.4 }
                    });
                  }
                } else if (blBranch === 'bl_twin_orbit') {
                  if (e.hp > 0) applyFrostSlow(e, 0.40, 2.2, 'bl_twin_orbit');
                  gainFrostShield(6, 3.5, 75);
                } else if (blBranch === 'bl_expanding_storm') {
                  if (e.hp > 0) applyFrostSlow(e, 0.45, 2.4, 'bl_expanding_storm');
                  gainFrostShield(8, 3.8, 80);
                }
                if (hasIceBlades && wasChilled && e.hp > 0) {
                  const lastShatter = h.shatterCdMap.get(e.id) || -9;
                  if (now - lastShatter >= 0.65) {
                    h.shatterCdMap.set(e.id, now);
                    const shatter = Math.min(140, Math.max(14, Math.round(e.maxHp * 0.08)));
                    ctx.ports.vfx.addRing(e.x, e.y, '#9cf6ff', 1.25);
                    ctx.ports.vfx.addFloat(e.x, e.y - 0.5, '❄️冰刃碎甲!', '#aef8ff', true);
                    dealDamage(e, shatter, { fromHero:false, skillKey:'combo', col:'#aef8ff' });
                  }
                }
              }
            }
          }
        }
      }
      // Combo: 万剑诀 (no-whiff guard: requires at least 1 enemy within 4.6 cells!)
      if (hasCombo(game, 'wanjian')) {
        h.wanjianTimer = Math.max(0, h.wanjianTimer - dt);
        if (h.wanjianTimer <= 0 && alive.some(e => dist(h, e) <= 4.6 * hs.skillRangeMult)) {
          h.wanjianTimer = 2.4;
          const fwLv = h.skills.firewave || 1;
          const dmg = Math.round((sb.firewave.dmg + fwLv * sb.firewave.perLv) * hs.skillDmgMult * 0.60);
          ctx.ports.vfx.addRing(h.x, h.y, '#ffe478', 2.4);
          ctx.ports.vfx.addFloat(h.x, h.y - 0.75, '⚔️万剑齐发!', '#ffe878', true);
          for (let i = 0; i < count; i++) {
            const ang = h.bladeAngle + (Math.PI * 2 * i) / count;
            const bx = h.x + Math.cos(ang) * baseOrbitR;
            const by = h.y + Math.sin(ang) * baseOrbitR;
            pushProjectile({
              kind:'firewave', comboStyle:'wanjian', x: bx, y: by, vx: Math.cos(ang)*12, vy: Math.sin(ang)*12,
              life: 0.35 * hs.skillRangeMult, r: 0.44, pierce: 2, hitSet: new Set(),
              dmg, critChance: hs.crit, critDmg: hs.critDmg, lifesteal: hs.lifesteal, bonusGold: hs.gm.bonusGold, isCombo: true
            });
          }
          ctx.ports.audio.play('slash', 1.25);
        }
      }
    }

    // 2. Fire Wave (烈焰剑波) + W10 Fire Breakthrough Branches (火标/引爆)
    const fwLv = h.skills.firewave || 0;
    if (fwLv > 0) {
      const fwBranch = h.w10Branch?.firewave || null;
      h.skillTimers.firewave = Math.max(0, h.skillTimers.firewave - dt * hs.aspd);
      if (h.skillTimers.firewave <= 0) {
        const searchRange = (fwBranch === 'fw_brand_pierce' || fwBranch === 'fw_homing_ember' || fwBranch === 'fw_mortar_cluster') ? 6.2 * hs.skillRangeMult : 5.0 * hs.skillRangeMult;
        const preferPrio = fwBranch === 'fw_homing_ember' || fwBranch === 'fw_mortar_cluster';
        const target = pickAimTarget(alive, searchRange, preferPrio);
        if (target) {
          h.skillTimers.firewave = Math.max(sb.firewave.minCd, sb.firewave.cd - fwLv * sb.firewave.perLvCd) * hs.skillCdMult;
          const baseAng = Math.atan2(target.y - h.y, target.x - h.x);
          const tfCombo = hasCombo(game, 'thunder_fire');
          const baseDmg = Math.round((sb.firewave.dmg + fwLv * sb.firewave.perLv) * hs.skillDmgMult);

          const priorityHits = new Set();
          if (fwBranch === 'fw_ring_detonate') {
            // 燎原火环: 8-way radial fire ring around hero + instant fire mark & detonation
            const ringCnt = 8;
            ctx.ports.vfx.addRing(h.x, h.y, '#ff6d38', 2.4 * hs.skillRangeMult);
            for (let i = 0; i < ringCnt; i++) {
              const a = (Math.PI * 2 * i) / ringCnt;
              pushProjectile({
                priorityHits, kind: 'firewave', w10Branch: 'fw_ring_detonate', x: h.x, y: h.y,
                vx: Math.cos(a) * 10.5, vy: Math.sin(a) * 10.5,
                life: 0.36 * hs.skillRangeMult, r: 0.58, pierce: 3 + Math.floor(fwLv / 2), hitSet: new Set(),
                dmg: baseDmg,
                critChance: hs.crit, critDmg: hs.critDmg, lifesteal: hs.lifesteal, bonusGold: hs.gm.bonusGold,
                isThunderFireCombo: tfCombo
              });
            }
          } else if (fwBranch === 'fw_mortar_cluster') {
            // 熔火轰击: 3 arcing mortar fireballs around priority target that leave lava & apply/detonate fireMark
            const mortarCnt = 3 + hs.gm.extraShot;
            for (let i = 0; i < mortarCnt; i++) {
              const offAng = (Math.PI * 2 * i) / mortarCnt + (game.rnd() - 0.5) * 0.3;
              const offDist = i === 0 ? 0 : 1.35;
              const tx = clamp(target.x + Math.cos(offAng) * offDist, 1.0, W - 1.0);
              const ty = clamp(target.y + Math.sin(offAng) * offDist, 1.0, H - 1.0);
              pushProjectile({
                priorityHits, kind: 'fireball', w10Branch: 'fw_mortar_cluster',
                sx: h.x, sy: h.y, x: h.x, y: h.y, tx, ty,
                t: 0, dur: 0.42, splash: 1.85 * hs.skillRangeMult,
                dmg: Math.round(baseDmg * 1.15), star: 2, burn: 22,
                opts: { fromHero:true, skillKey:'firewave', critChance:hs.crit, critDmg:hs.critDmg, lifesteal:hs.lifesteal, bonusGold:hs.gm.bonusGold }
              });
            }
          } else if (fwBranch === 'fw_brand_pierce') {
            // 烙印长锋: High-speed focused piercing lance cone (+1 projectile, +2 pierce, +35% range, applies fireMark & detonates at 2 stacks)
            const count = Math.min(5, Math.ceil(fwLv / 2) + 2) + hs.gm.extraShot;
            for (let i = 0; i < count; i++) {
              const a = baseAng + (i - (count - 1) / 2) * 0.13;
              pushProjectile({
                priorityHits, kind: 'firewave', w10Branch: 'fw_brand_pierce', x: h.x, y: h.y,
                vx: Math.cos(a) * 13.8, vy: Math.sin(a) * 13.8,
                life: 0.56 * hs.skillRangeMult, r: 0.56, pierce: 4 + Math.floor(fwLv / 2), hitSet: new Set(),
                dmg: Math.round(baseDmg * 1.12),
                critChance: hs.crit, critDmg: hs.critDmg, lifesteal: hs.lifesteal, bonusGold: hs.gm.bonusGold,
                isThunderFireCombo: tfCombo
              });
            }
          } else if (fwBranch === 'fw_homing_ember') {
            // 追魂流火: Priority-seeking firewaves that bounce to nearby enemies on hit & apply/detonate fireMark
            const count = Math.min(4, Math.ceil(fwLv / 2) + 1) + hs.gm.extraShot;
            for (let i = 0; i < count; i++) {
              const a = baseAng + (i - (count - 1) / 2) * 0.20;
              pushProjectile({
                priorityHits, kind: 'firewave', w10Branch: 'fw_homing_ember', bounceLeft: 1, x: h.x, y: h.y,
                vx: Math.cos(a) * 12.2, vy: Math.sin(a) * 12.2,
                life: 0.50 * hs.skillRangeMult, r: 0.54, pierce: 2 + Math.floor(fwLv / 2), hitSet: new Set(),
                dmg: baseDmg,
                critChance: hs.crit, critDmg: hs.critDmg, lifesteal: hs.lifesteal, bonusGold: hs.gm.bonusGold,
                isThunderFireCombo: tfCombo
              });
            }
          } else {
            // Base Fire Wave
            const count = Math.min(4, Math.ceil(fwLv / 2) + 1) + hs.gm.extraShot;
            for (let i = 0; i < count; i++) {
              const a = baseAng + (i - (count - 1) / 2) * 0.24;
              pushProjectile({
                priorityHits, kind: 'firewave', x: h.x, y: h.y,
                vx: Math.cos(a) * 11.5, vy: Math.sin(a) * 11.5,
                life: 0.42 * hs.skillRangeMult, r: 0.52, pierce: 2 + Math.floor(fwLv / 2), hitSet: new Set(),
                dmg: baseDmg,
                critChance: hs.crit, critDmg: hs.critDmg, lifesteal: hs.lifesteal, bonusGold: hs.gm.bonusGold,
                isThunderFireCombo: tfCombo
              });
            }
          }
          ctx.ports.audio.play('fire', 1.35);
        }
      }
    }

    // 3. Hero Chain Thunder (天雷轰顶) + W10 Branch Mechanics
    const thLv = h.skills.thunder || 0;
    if (thLv > 0) {
      const thBranch = h.w10Branch?.thunder || null;
      h.skillTimers.thunder = Math.max(0, h.skillTimers.thunder - dt * hs.aspd);
      if (h.skillTimers.thunder <= 0) {
        const near = alive.filter(e => dist(h, e) <= 4.8 * hs.skillRangeMult);
        if (near.length) {
          h.skillTimers.thunder = Math.max(sb.thunder.minCd, sb.thunder.cd - thLv * sb.thunder.perLvCd) * hs.skillCdMult;
          const sorted = near.slice().sort((a, b) => {
            const sa = (a.boss ? 1000 : a.elite ? 500 : a.shaman ? 300 : 0) - dist(h, a) * 5;
            const sb = (b.boss ? 1000 : b.elite ? 500 : b.shaman ? 300 : 0) - dist(h, b) * 5;
            return sb - sa;
          });
          const baseDmg = Math.round((sb.thunder.dmg + thLv * sb.thunder.perLv) * hs.skillDmgMult);

          if (thBranch === 'th_storm_orb') {
            // 雷球巡猎: Fires 2 slow-moving piercing storm orbs that slow enemies & grant frost shield
            gainFrostShield(10, 4.0, 80);
            for (let s = 0; s < 2; s++) {
              const tgt = sorted[s % sorted.length];
              const ang = Math.atan2(tgt.y - h.y, tgt.x - h.x) + (s === 0 ? -0.15 : 0.15);
              pushProjectile({
                kind: 'arrow', w10Branch: 'th_storm_orb', x: h.x, y: h.y,
                vx: Math.cos(ang) * 6.2, vy: Math.sin(ang) * 6.2,
                life: 1.15 * hs.skillRangeMult, r: 0.65, pierce: 99, hitSet: new Set(),
                dmg: Math.round(baseDmg * 1.15), splash: 1.45,
                opts: { fromHero:true, skillKey:'thunder', isThunder:true, critChance:hs.crit, critDmg:hs.critDmg, col:'#d8a6ff', slow:0.45, slowDur:2.4 }
              });
            }
            ctx.ports.audio.play('thunder');
          } else {
            const strikes = thLv + 1;
            const chainCnt = thBranch === 'th_arc_web' ? 6 : 3;
            for (let s = 0; s < strikes; s++) {
              const repeatTarget = thBranch === 'th_heaven_brand' || s === 0 || (thBranch === 'th_storm_circuit' && s === 1);
              const tgt = repeatTarget ? sorted[0] : sorted[Math.floor(game.rnd() * sorted.length)];
              const repeatBonus = thBranch === 'th_storm_circuit' && s === 1 ? 1.40 : 1;
              const priorityBonus = sorted.length === 1 && (tgt?.boss || tgt?.elite) ? BALANCE.combat.thunderSoloMult : 1;
              const firstHitDamage = Math.round(baseDmg * repeatBonus * priorityBonus);
              if (tgt && tgt.hp > 0) {
                fireChainLightning(tgt, firstHitDamage, chainCnt, {
                  fromHero:true, skillKey:'thunder',
                  ox: tgt.x, oy: tgt.y - 3.2, critChance: hs.crit, critDmg: hs.critDmg, bonusGold: hs.gm.bonusGold
                });
                if (thBranch === 'th_judgment_pillar' && s === 0) {
                  applyFireMark(tgt, 2, 'th_judgment_pillar', 5.0);
                  triggerFireDetonation(tgt, 1.15, 1.85, 'thunder');
                  game.zones.push({
                    kind: 'thunderField', w10Branch: 'th_judgment_pillar',
                    x: tgt.x, y: tgt.y, r: 2.1 * hs.skillRangeMult,
                    t: 3.0, max: 3.0, tick: 0.5, dps: Math.round(baseDmg * 0.75)
                  });
                } else if (thBranch === 'th_arc_web') {
                  if (tgt.hp > 0) {
                    applyFireMark(tgt, 1, 'th_arc_web', 5.0);
                    triggerFireDetonation(tgt, 1.15, 1.80, 'thunder');
                  }
                } else if (thBranch === 'th_heaven_brand') {
                  if (tgt.hp > 0) {
                    applyFireMark(tgt, 1, 'th_heaven_brand', 5.0);
                    triggerFireDetonation(tgt, 1.25, 1.90, 'thunder');
                  }
                }
              }
            }
          }
        }
      }
    }

    // 4. Frost Nova (冰霜新星) + W10 Frost Breakthrough Branches (减速/冰盾)
    const nvLv = h.skills.nova || 0;
    if (nvLv > 0) {
      const nvBranch = h.w10Branch?.nova || null;
      h.skillTimers.nova = Math.max(0, h.skillTimers.nova - dt * hs.aspd);
      if (h.skillTimers.nova <= 0) {
        const baseRad = (1.95 + nvLv * 0.24) * hs.skillRangeMult;
        const rad = nvBranch === 'nv_glacial_bastion' ? baseRad * 1.35 : baseRad;
        const searchRad = nvBranch === 'nv_seeking_vortex' ? 5.6 * hs.skillRangeMult : nvBranch === 'nv_prism_lance' ? 4.8 * hs.skillRangeMult : rad;
        if (alive.some(e => dist(h, e) <= searchRad + e.r)) {
          const cdFactor = nvBranch === 'nv_trail_aegis' ? 0.82 : 1.0;
          h.skillTimers.nova = Math.max(sb.nova.minCd, (sb.nova.cd - nvLv * sb.nova.perLvCd) * cdFactor) * hs.skillCdMult;
          const baseDmg = Math.round((sb.nova.dmg + nvLv * sb.nova.perLv) * hs.skillDmgMult);

          if (nvBranch === 'nv_seeking_vortex') {
            // 追猎寒涡: Remote frost vortex at priority enemy cluster + frost slow + frost shield
            const tgt = pickAimTarget(alive, searchRad, true) || alive[0];
            const vx = tgt.x, vy = tgt.y;
            const vRad = baseRad * 1.05;
            ctx.ports.vfx.addRing(vx, vy, '#7ce8ff', vRad);
            ctx.ports.audio.play('frost');
            let hitCnt = 0;
            for (const e of alive) {
              if (dist({ x: vx, y: vy }, e) <= vRad + e.r) {
                hitCnt++;
                applyFrostSlow(e, 0.60, 3.2, 'nv_seeking_vortex');
                dealDamage(e, baseDmg, {
                  fromHero:true, skillKey:'nova',
                  critChance: hs.crit, critDmg: hs.critDmg, col:'#8cf0ff', slow: 0.60, slowDur: 3.2, lifesteal: hs.lifesteal, bonusGold: hs.gm.bonusGold
                });
              }
            }
            gainFrostShield(14 + hitCnt * 4, 4.8, 90);
            game.zones.push({
              kind: 'frostVortex', w10Branch: 'nv_seeking_vortex', x: vx, y: vy, r: vRad,
              t: 3.2, max: 3.2, tick: 0.45, dps: Math.round(baseDmg * 0.55)
            });
          } else if (nvBranch === 'nv_prism_lance') {
            // 冰棱乱射: Frost Nova ring + 8 radial piercing frost lances + reactive frost shield
            ctx.ports.vfx.addRing(h.x, h.y, '#7ce8ff', baseRad * 0.9);
            ctx.ports.audio.play('frost');
            for (const e of alive) {
              if (dist(h, e) <= baseRad * 0.9 + e.r) {
                applyFrostSlow(e, 0.55, 3.0, 'nv_prism_lance');
                dealDamage(e, baseDmg, {
                  fromHero:true, skillKey:'nova',
                  critChance: hs.crit, critDmg: hs.critDmg, col:'#8cf0ff', slow: 0.55, slowDur: 3.0, lifesteal: hs.lifesteal, bonusGold: hs.gm.bonusGold
                });
              }
            }
            gainFrostShield(18, 5.0, 90);
            for (let i = 0; i < 8; i++) {
              const ang = (Math.PI * 2 * i) / 8;
              pushProjectile({
                kind: 'arrow', w10Branch: 'nv_prism_lance', x: h.x, y: h.y,
                vx: Math.cos(ang) * 14.5, vy: Math.sin(ang) * 14.5,
                life: 0.44 * hs.skillRangeMult, r: 0.34, pierce: 3, hitSet: new Set(),
                dmg: Math.round(baseDmg * 0.85), splash: 0,
                opts: { fromHero:true, skillKey:'nova', critChance:hs.crit, critDmg:hs.critDmg, col:'#9ef6ff', slow:0.55, slowDur:3.0 }
              });
            }
          } else if (nvBranch === 'nv_trail_aegis') {
            // 霜径护体: Frost Nova + persistent frost trail zones + immediate high frost shield
            ctx.ports.vfx.addRing(h.x, h.y, '#7ce8ff', rad);
            ctx.ports.audio.play('frost');
            for (const e of alive) {
              if (dist(h, e) <= rad + e.r) {
                applyFrostSlow(e, 0.60, 3.2, 'nv_trail_aegis');
                dealDamage(e, baseDmg, {
                  fromHero:true, skillKey:'nova',
                  critChance: hs.crit, critDmg: hs.critDmg, col:'#8cf0ff', slow: 0.60, slowDur: 3.2, lifesteal: hs.lifesteal, bonusGold: hs.gm.bonusGold
                });
              }
            }
            gainFrostShield(22, 5.0, 95);
            game.zones.push({
              kind: 'frostTrail', w10Branch: 'nv_trail_aegis', x: h.x, y: h.y, r: 1.65 * hs.skillRangeMult,
              t: 3.2, max: 3.2, tick: 0.45, dps: Math.round(baseDmg * 0.50)
            });
          } else if (nvBranch === 'nv_glacial_bastion') {
            // 凛冰堡垒: Expanded +35% radius nova + deep 70% slow + scales frost shield per enemy hit
            ctx.ports.vfx.addRing(h.x, h.y, '#7ce8ff', rad);
            ctx.ports.audio.play('frost');
            let chilledHit = 0;
            for (const e of alive) {
              if (dist(h, e) <= rad + e.r) {
                chilledHit++;
                applyFrostSlow(e, 0.70, 3.6, 'nv_glacial_bastion');
                dealDamage(e, Math.round(baseDmg * 1.15), {
                  fromHero:true, skillKey:'nova',
                  critChance: hs.crit, critDmg: hs.critDmg, col:'#8cf0ff', slow: 0.70, slowDur: 3.6, lifesteal: hs.lifesteal, bonusGold: hs.gm.bonusGold
                });
              }
            }
            gainFrostShield(18 + chilledHit * 8, 5.0, 95);
          } else {
            // Base Frost Nova
            ctx.ports.vfx.addRing(h.x, h.y, '#7ce8ff', rad);
            ctx.ports.audio.play('frost');
            for (const e of alive) {
              if (dist(h, e) <= rad + e.r) {
                dealDamage(e, baseDmg, {
                  fromHero:true, skillKey:'nova',
                  critChance: hs.crit, critDmg: hs.critDmg, col:'#8cf0ff', slow: 0.55, slowDur: 3.0, lifesteal: hs.lifesteal, bonusGold: hs.gm.bonusGold
                });
              }
            }
          }
        }
      }
    }

    // 5. Quake Stomp (重锤震地) + W10 Branch Mechanics + Combo: 崩山血怒裂地纹
    const stLv = h.skills.stomp || 0;
    if (stLv > 0) {
      const stBranch = h.w10Branch?.stomp || null;
      h.skillTimers.stomp = Math.max(0, h.skillTimers.stomp - dt * hs.aspd);
      if (h.skillTimers.stomp <= 0) {
        const baseRad = (2.00 + stLv * 0.24) * hs.skillRangeMult;
        const rad = stBranch === 'st_glacier_quake' ? baseRad * 1.30 : stBranch === 'st_aftershock_ring' ? baseRad * 1.45 : baseRad;
        if (alive.some(e => dist(h, e) <= rad + e.r)) {
          h.skillTimers.stomp = Math.max(1.60, 2.45 - stLv * 0.17) * hs.skillCdMult;
          const hasQuakeBlood = hasCombo(game, 'quake_blood');
          const missingMult = hasQuakeBlood ? (1 + clamp((h.maxHp - h.hp) / Math.max(1, h.maxHp), 0, 1)) : 1;
          ctx.ports.vfx.addRing(h.x, h.y, stBranch === 'st_glacier_quake' ? '#88f0ff' : hasQuakeBlood ? '#ff5c42' : '#ffbe55', rad);
          if (hasQuakeBlood) {
            ctx.ports.vfx.addFloat(h.x, h.y - 0.7, '🌋崩山血怒!', '#ff6a4d', true);
            for (let f = 0; f < 8; f++) {
              const ang = (Math.PI * 2 * f) / 8;
              game.beams.push({ x1: h.x, y1: h.y, x2: h.x + Math.cos(ang)*rad*1.15, y2: h.y + Math.sin(ang)*rad*1.15, t: 0.28, max: 0.28, w: 6, col:'#ff5a3c' });
            }
          }
          game.shake = Math.max(game.shake, hasQuakeBlood ? 7.5 : 4.5);
          ctx.ports.audio.play('fire', 0.75);
          const baseDmg = Math.round((sb.stomp.dmg + stLv * sb.stomp.perLv) * hs.skillDmgMult * missingMult);
          let hitCount = 0;
          for (const e of alive) {
            if (dist(h, e) <= rad + e.r) {
              hitCount++;
              const innerPriority = (e.elite || e.boss) && dist(h, e) <= rad * 0.86 + e.r;
              const damage = innerPriority ? Math.round(baseDmg * BALANCE.combat.stompPriorityMult) : baseDmg;
              const dealt = dealDamage(e, damage, {
                fromHero:true, skillKey: hasQuakeBlood ? 'combo' : 'stomp',
                critChance: hs.crit, critDmg: hs.critDmg, col: hasQuakeBlood ? '#ff8a6b' : '#ffd478', lifesteal: hs.lifesteal, bonusGold: hs.gm.bonusGold
              });
              if (hasQuakeBlood && dealt > 0) applyHeroLifesteal(3);
              if (stBranch === 'st_rupture' && (e.elite || e.boss) && dist(h, e) <= rad * 0.78 + e.r) {
                e.vulnT = Math.max(e.vulnT || 0, 2.2);
                dealDamage(e, Math.round(baseDmg * 0.68), { skillKey: 'stomp', col: '#ffda96', buildEcho: true });
              }
              if (!e.boss && !isEnemyUnstoppable(e)) e.freezeT = Math.max(e.freezeT, stBranch === 'st_glacier_quake' ? 1.2 : 0.75);
              if ((stBranch === 'st_fissure_wave' || stBranch === 'st_aftershock_ring' || stBranch === 'st_molten_crater') && e.hp > 0) {
                applyFireMark(e, 2, stBranch, 5.0);
                triggerFireDetonation(e, 1.25, 2.0, 'stomp');
              } else if (stBranch === 'st_glacier_quake' && e.hp > 0) {
                applyFrostSlow(e, 0.65, 3.4, 'st_glacier_quake');
              }
            }
          }
          if (stBranch === 'st_fissure_wave') {
            const tgt = pickAimTarget(alive, rad + 2.5, true) || alive[0];
            const ang = Math.atan2(tgt.y - h.y, tgt.x - h.x);
            for (let k = 1; k <= 2; k++) {
              game.zones.push({
                kind: 'lava', w10Branch: 'st_fissure_wave',
                x: clamp(h.x + Math.cos(ang) * k * 1.6, 1.0, W - 1.0),
                y: clamp(h.y + Math.sin(ang) * k * 1.6, 1.0, H - 1.0),
                r: 1.45, t: 3.0, max: 3.0, tick: 0.45, dps: Math.round(baseDmg * 0.55)
              });
            }
          } else if (stBranch === 'st_glacier_quake') {
            gainFrostShield(16 + hitCount * 6, 5.0, 95);
          } else if (stBranch === 'st_aftershock_ring') {
            ctx.ports.vfx.addRing(h.x, h.y, '#ff6d38', rad * 1.25);
          } else if (stBranch === 'st_molten_crater') {
            game.zones.push({
              kind: 'lava', w10Branch: 'st_molten_crater', x: h.x, y: h.y, r: rad * 0.95,
              t: 2.8, max: 2.8, tick: 0.45, dps: Math.round(baseDmg * 0.55)
            });
          }
        }
      }
    }

    // 6. Berserk Blood (狂战血怒) W10 Active Branch Pulses
    const bzLv = h.skills.berserk || 0;
    const bzBranch = h.w10Branch?.berserk || null;
    if (bzLv > 0) {
      h.skillTimers.berserk = Math.max(0, (h.skillTimers.berserk || 0) - dt * hs.aspd);
      if (h.skillTimers.berserk <= 0) {
        const pulseRad = (2.6 + bzLv * 0.25) * hs.skillRangeMult;
        if (alive.some(e => dist(h, e) <= pulseRad + 2.0)) {
          h.skillTimers.berserk = 0.85 * hs.skillCdMult;
          const pulseDmg = Math.round((22 + bzLv * 12) * hs.skillDmgMult);
          if (!bzBranch || bzBranch === 'bk_crimson_pact') {
            const inOverdrive = h.ultTimer > 0;
            const reach = bzBranch && inOverdrive ? pulseRad + 1.25 : pulseRad * 0.84;
            const target = pickAimTarget(alive, reach, true);
            if (target && (!bzBranch || inOverdrive || h.hp >= h.maxHp * 0.55)) {
              const hit = { fromHero: true, skillKey: 'berserk', critChance: hs.crit, critDmg: hs.critDmg,
                lifesteal: hs.lifesteal + (inOverdrive ? 4 : 0), col: '#ff98aa' };
              const priorityBonus = bzBranch && (target.boss || target.elite) ? BALANCE.combat.bloodSkillPriorityMult : 1;
              const damage = Math.round(pulseDmg * (bzBranch && inOverdrive ? 1.75 : 0.90) * priorityBonus);
              dealDamage(target, damage, hit);
              if (inOverdrive) {
                for (const e of alive) {
                  if (e !== target && dist(e, target) <= 1.75 + e.r) dealDamage(e, Math.round(damage * 0.54), hit);
                }
              }
              ctx.ports.vfx.addRing(target.x, target.y, '#ff98aa', inOverdrive ? 1.75 : 0.7);
            }
          } else if (bzBranch === 'bk_flame_aura') {
            ctx.ports.vfx.addRing(h.x, h.y, '#ff6d38', pulseRad);
            for (const e of alive) {
              if (dist(h, e) <= pulseRad + e.r) {
                applyFireMark(e, 1, 'bk_flame_aura', 4.5);
                dealDamage(e, pulseDmg, { fromHero:true, skillKey:'berserk', col:'#ff884d', burn:18, critChance:hs.crit, critDmg:hs.critDmg });
                if (e.hp > 0) triggerFireDetonation(e, 1.15, 1.85, 'berserk');
              }
            }
          } else if (bzBranch === 'bk_frost_armor') {
            ctx.ports.vfx.addRing(h.x, h.y, '#7ce8ff', pulseRad);
            gainFrostShield(16, 4.5, 90);
            for (const e of alive) {
              if (dist(h, e) <= pulseRad + e.r) {
                applyFrostSlow(e, 0.55, 2.8, 'bk_frost_armor');
                dealDamage(e, pulseDmg, { fromHero:true, skillKey:'berserk', col:'#8cf0ff', slow:0.55, slowDur:2.8, critChance:hs.crit, critDmg:hs.critDmg });
              }
            }
          } else if (bzBranch === 'bk_blood_crescent') {
            const tgt = pickAimTarget(alive, 5.2 * hs.skillRangeMult, true);
            if (tgt) {
              const ang = Math.atan2(tgt.y - h.y, tgt.x - h.x);
              pushProjectile({
                kind: 'firewave', w10Branch: 'bk_blood_crescent', x: h.x, y: h.y,
                vx: Math.cos(ang) * 12.5, vy: Math.sin(ang) * 12.5,
                life: 0.45 * hs.skillRangeMult, r: 0.62, pierce: 4, hitSet: new Set(),
                dmg: Math.round(pulseDmg * 1.25),
                critChance: hs.crit, critDmg: hs.critDmg, lifesteal: hs.lifesteal, bonusGold: hs.gm.bonusGold
              });
            }
          } else if (bzBranch === 'bk_war_tempest') {
            ctx.ports.vfx.addRing(h.x, h.y, '#8cf0ff', pulseRad);
            gainFrostShield(14, 4.5, 90);
            for (let i = 0; i < 4; i++) {
              const ang = (Math.PI * 2 * i) / 4 + game.waveClock;
              pushProjectile({
                kind: 'arrow', w10Branch: 'bk_war_tempest', x: h.x, y: h.y,
                vx: Math.cos(ang) * 13.5, vy: Math.sin(ang) * 13.5,
                life: 0.42 * hs.skillRangeMult, r: 0.34, pierce: 3, hitSet: new Set(),
                dmg: pulseDmg, splash: 0,
                opts: { fromHero:true, skillKey:'berserk', critChance:hs.crit, critDmg:hs.critDmg, col:'#9ef6ff', slow:0.50, slowDur:2.6 }
              });
            }
          }
        }
      }
    }
    routeSkills.updateRouteSkills(dt, alive, hs);
  }

  return { executeBreakerShockwave, castHeroDash, castHeroOverdrive, pickAimTarget, updateHero };
}
