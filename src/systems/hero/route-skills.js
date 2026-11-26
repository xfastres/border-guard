import BALANCE from '../../data/balance.js';
import { dist } from '../../core/math.js';

const baseSkills = BALANCE.progression.skillBase;

export function createRouteSkills(ctx, combat, aim) {
  const { dealDamage, pushProjectile, grantBuildShield } = combat;

  function fireLance(hero, angle, damage, range, hs, style = {}) {
    const speed = style.speed ?? 16;
    pushProjectile({
      kind: 'arrow', x: hero.x, y: hero.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      life: range / speed, r: style.width ?? 0.35, pierce: style.pierce ?? 2,
      hitSet: new Set(), dmg: Math.round(damage), splash: 0, falloff: 0.76, rebound: style.rebound,
      opts: {
        fromHero: true, skillKey: style.skill ?? 'swordlance', isWind: true, col: '#a6f7d8',
        critChance: hs.crit, critDmg: hs.critDmg, lifesteal: hs.lifesteal, vulnBoss: style.vulnBoss,
      },
    });
  }

  function afterDash(dirX, dirY, hs) {
    const game = ctx.game;
    if (game.phase !== 'wave') return;
    const h = game.hero;
    if (h.w10Branch?.swordlance === 'sl_returning_lance') h.skillTimers.swordlance = 0;
    if (h.w10Branch?.blades === 'bl_crosswinds') {
      fireLance(h, Math.atan2(dirY, dirX), (34 + h.skills.blades * 9) * hs.skillDmgMult,
        5.0 * hs.skillRangeMult, hs, { skill: 'blades', pierce: 3 });
    }
  }

  function updateRouteSkills(dt, alive, hs) {
    const { hero: h, waveClock } = ctx.game;
    const swords = h.skills.swordlance || 0;
    if (swords) {
      const cfg = baseSkills.swordlance;
      const branch = h.w10Branch?.swordlance;
      h.skillTimers.swordlance = Math.max(0, (h.skillTimers.swordlance || 0) - dt * hs.aspd);
      const moving = branch === 'sl_stillpoint';
      if (h.skillTimers.swordlance <= 0 && (!moving || h.moving)) {
        const recentlyDashed = (h.routeCombat.dashAt ?? -10) >= waveClock - 2.2;
        const range = cfg.range * hs.skillRangeMult * (moving && recentlyDashed ? 1.22 : 1);
        const target = aim(alive, range);
        if (target) {
          h.skillTimers.swordlance = Math.max(cfg.minCd, cfg.cd - cfg.perLvCd * swords) * hs.skillCdMult;
          const angle = Math.atan2(target.y - h.y, target.x - h.x);
          const damage = (cfg.dmg + swords * cfg.perLv) * hs.skillDmgMult;
          const sever = branch === 'sl_sever_guard';
          const pierce = sever ? 1 : 2 + Math.floor(swords / 2);
          fireLance(h, angle, damage, range, hs, {
            pierce, speed: moving ? 21 : 16, width: sever ? 0.29 : 0.43,
            rebound: branch === 'sl_returning_lance', vulnBoss: sever,
          });
          if (branch === 'sl_cross_lanes') {
            for (const side of [-1, 1]) fireLance(h, angle + side * 0.38, damage * 0.66, range, hs, { pierce: 2 });
          }
          if (moving && recentlyDashed) grantBuildShield(12);
          ctx.ports.audio.play('slash');
        }
      }
    }

    const sun = h.skills.sunward || 0;
    if (sun) {
      const cfg = baseSkills.sunward;
      const branch = h.w10Branch?.sunward;
      h.skillTimers.sunward = Math.max(0, (h.skillTimers.sunward || 0) - dt * hs.aspd);
      if (h.skillTimers.sunward > 0) return;
      const range = cfg.range * hs.skillRangeMult;
      const shelter = branch === 'su_shelter';
      const target = aim(alive, shelter ? range * 0.64 : range, true);
      if (!target) return;
      h.skillTimers.sunward = Math.max(cfg.minCd, cfg.cd - sun * cfg.perLvCd) * hs.skillCdMult;
      const radius = shelter ? 3.2 * hs.skillRangeMult : 1.55;
      const center = shelter ? h : target;
      const damage = (cfg.dmg + sun * cfg.perLv) * hs.skillDmgMult;
      const alreadyShielded = h.shield >= 18;
      const wasBroken = h.armorBreakT > 0;
      const ward = BALANCE.combat.routes.holy.shieldGain + sun * 2 + Math.round(20 * hs.gm.holyOath) + (shelter ? 16 : 0);
      grantBuildShield(ward);
      const hit = { fromHero: true, skillKey: 'sunward', isHoly: true, col: '#ffe795', critChance: hs.crit, critDmg: hs.critDmg };
      dealDamage(target, Math.round(damage * (target.boss || target.elite ? 1.65 : 1)), hit);
      let extra = branch === 'su_dawning' ? 5 : 3;
      for (const e of alive) {
        if (extra <= 0) break;
        if (e === target || e.hp <= 0 || dist(e, center) > radius + e.r) continue;
        extra--;
        dealDamage(e, Math.round(damage * 0.72), hit);
      }
      if (branch === 'su_verdict' && alreadyShielded && (target.boss || target.elite)) {
        dealDamage(target, Math.round(damage * 0.82), { ...hit, buildEcho: true });
      }
      if (branch === 'su_cleansing' && wasBroken) {
        h.armorBreakT = 0;
        dealDamage(target, Math.round(damage * 0.75), { ...hit, buildEcho: true });
      }
      ctx.ports.vfx.addRing(center.x, center.y, '#ffe795', radius);
      ctx.ports.audio.play('holy');
    }
  }

  return { afterDash, updateRouteSkills };
}
