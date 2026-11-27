import BALANCE from '../../data/balance.js';
import { W, H, MAX_ENEMIES, MAX_PROJECTILES, SUB_SEAL_RESONANCE } from '../../data/index.js';
import { dist, clamp } from '../../core/math.js';
import { hasCombo } from '../../core/state-queries.js';

export function pointToSegDist(px, py, x1, y1, x2, y2){
  const dx = x2 - x1, dy = y2 - y1;
  const l2 = dx * dx + dy * dy;
  if (l2 === 0) return Math.hypot(px - x1, py - y1);
  const t = clamp(((px - x1) * dx + (py - y1) * dy) / l2, 0, 1);
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

export function createCombatSimulation(ctx, deps) {
  function damageHero(amt, sourceMeta) {
    const heroVitals = deps.heroVitals?.damageHero ? deps.heroVitals : deps.hero;
    return heroVitals.damageHero(amt, sourceMeta);
  }

  function getVolleyDamage(projectile, enemy) {
    if (!projectile.priorityHits || (!enemy.elite && !enemy.boss)) return projectile.dmg;
    if (projectile.priorityHits.has(enemy.id)) return Math.round(projectile.dmg * BALANCE.combat.fireRepeatPriorityMult);
    projectile.priorityHits.add(enemy.id);
    return projectile.dmg;
  }

  /* ==================== MAIN SEAL & SUB-SEAL RESONANCE (ON-HIT IMPACT ERUPTION) ==================== */
  function pushProjectile(p){
    if (ctx.game.projectiles.length >= MAX_PROJECTILES) ctx.game.projectiles.shift();
    ctx.game.projectiles.push(p);
  }

  function updateSeal(dt){
    if (ctx.game.seal) ctx.game.seal.cd = Math.max(0, ctx.game.seal.cd - dt);

    // Thunder Tier-4 Global Wrath Strike every 3s in active combat
    if (ctx.game.phase === 'wave' && ctx.game.enemies.length > 0 && deps.hero.getSynergyTier('thunder') >= 2) {
      ctx.game.thunderSynTimer -= dt;
      if (ctx.game.thunderSynTimer <= 0) {
        ctx.game.thunderSynTimer = 3.0;
        const alive = ctx.game.enemies.filter(e => e.hp > 0);
        const targets = alive.sort((a,b) => dist(a, ctx.game.hero) - dist(b, ctx.game.hero)).slice(0, 3);
        for (const tgt of targets) {
          deps.damage.fireChainLightning(tgt, Math.round(75 + ctx.game.wave * 18), 4, { ox: tgt.x, oy: tgt.y - 4.0, col:'#e2b8ff', tower: ctx.game.seal });
          ctx.ports.vfx.addRing(tgt.x, tgt.y, '#c68cff', 1.6);
        }
      }
    }
  }

  function triggerSealOnHeroHit(hitEnemy){
    const a = ctx.game.seal;
    if (!hitEnemy || !a || a.cd > 0) return;
    const h = ctx.game.hero;
    const maxTrigDist = 4.8 * deps.hero.getHeroStats().rangeMult;
    if (dist(h, hitEnemy) > maxTrigDist) return;
    const syn = deps.hero.getSynergyCounts();
    const alive = ctx.game.enemies.filter(e => e.hp > 0);
    const hx = hitEnemy.x, hy = hitEnemy.y;
    const st = deps.hero.getSealStats(a);
    a.cd = st.cd;
    ctx.ports.vfx.sealCast?.(a.kind, a.star, hx, hy);

    const dmgOpts = {
      tower: a, fromHero: false, critChance: st.crit, critDmg: st.critDmg,
      slow: st.slow, slowDur: st.slowDur, burn: st.burn,
      lifesteal: st.gm.lifesteal, chainProc: st.gm.chainProc, bonusGold: st.gm.bonusGold
    };

    if (a.kind === 'wind') {
      if ((hitEnemy.boss || hitEnemy.elite) && !alive.some(e => e !== hitEnemy && dist(e, hitEnemy) <= 2.75)) {
        deps.damage.dealDamage(hitEnemy, Math.round(st.dmg * BALANCE.combat.windSealDuelMult), { ...dmgOpts, isWind: true, col: '#baf9df' });
      }
      const baseAng = Math.atan2(hy - h.y, hx - h.x);
      let totalShots = st.shots;
      if (syn.wind >= 4 && ctx.game.rnd() < 0.35) totalShots += 2;
      ctx.ports.vfx.addRing(hx, hy, '#72f2b4', 1.15);
      for (let i = 0; i < totalShots; i++) {
        const ang = totalShots >= 4
          ? baseAng + (Math.PI * 2 * i) / totalShots
          : baseAng + (i - (totalShots - 1) / 2) * 0.55;
        pushProjectile({
          kind: 'arrow', x: hx, y: hy,
          vx: Math.cos(ang) * 14.5, vy: Math.sin(ang) * 14.5,
          life: st.range / 14.5, r: 0.28,
          pierce: st.pierce, hitSet: new Set([hitEnemy.id]),
          dmg: st.dmg, splash: st.splash, opts: { ...dmgOpts, isWind: true }
        });
      }
      ctx.ports.audio.play('arrow');
    } else if (a.kind === 'fire') {
      const rad = Math.max(1.70, st.splash);
      ctx.ports.vfx.addRing(hx, hy, '#ff7b47', rad);
      for (const e of alive) {
        if (e.hp > 0 && dist(e, hitEnemy) <= rad + e.r) {
          if (st.route === 'mastery') deps.hooks.applyFireMark(e, 1, 'seal_fire_mastery', 4.5);
          deps.damage.dealDamage(e, st.dmg, { ...dmgOpts, col:'#ff9f66' });
        }
      }
      if (a.star >= 2) {
        ctx.game.zones.push({ kind:'lava', x:hx, y:hy, r:rad * (st.route === 'mastery' ? 0.96 : 0.82), t: st.route === 'mastery' ? 3.5 : 2.8, max: st.route === 'mastery' ? 3.5 : 2.8, tick:0.45, dps:st.burn, tower:a });
      }
      ctx.ports.audio.play('fire');
    } else if (a.kind === 'frost') {
      const rad = Math.max(1.85, st.splash);
      ctx.ports.vfx.addRing(hx, hy, '#6ce2ff', rad);
      let chilledHit = false;
      for (const e of alive) {
        if (e.hp > 0 && dist(e, hitEnemy) <= rad + e.r) {
          if (e.slowT > 0 || e.freezeT > 0) chilledHit = true;
          deps.damage.dealDamage(e, st.dmg, { ...dmgOpts, col:'#8ceeff' });
        }
      }
      if (st.route === 'mastery' && chilledHit) {
        deps.hooks.gainFrostShield(10, { duration: 4.5, maxShield: 105, source: 'seal_frost_mastery' });
      }
      ctx.ports.audio.play('frost');
    } else if (a.kind === 'thunder') {
      deps.damage.fireChainLightning(hitEnemy, st.dmg, st.chains, { ...dmgOpts, vuln: st.route === 'mastery' || dmgOpts.vuln, ox: hx, oy: hy });
    } else if (a.kind === 'holy') {
      const baseAng = ctx.game.rnd() * Math.PI;
      const rayCount = Math.max(2, st.beams);
      ctx.ports.vfx.addRing(hx, hy, '#ffe478', st.range * 0.6);
      for (let i = 0; i < rayCount; i++) {
        const ang = baseAng + (Math.PI * i) / rayCount;
        const dx = Math.cos(ang) * st.range, dy = Math.sin(ang) * st.range;
        const x1 = hx - dx, y1 = hy - dy, x2 = hx + dx, y2 = hy + dy;
        ctx.game.beams.push({ x1, y1, x2, y2, t: 0.22, max: 0.22, w: 3.5 + a.star * 1.6 });
        for (const e of alive) {
          if (e.hp > 0 && pointToSegDist(e.x, e.y, x1, y1, x2, y2) <= 0.52 + e.r) deps.damage.dealDamage(e, st.dmg, { ...dmgOpts, col:'#fff094' });
        }
      }
      if (st.route === 'mastery') deps.damage.applyHeroLifesteal(4);
      ctx.ports.audio.play('holy');
    }

    // Dual Resonance: Fire+Thunder crimson wrath & Holy Omni shield
    if (deps.hero.hasDualRes('fire_thunder')) {
      const hi = alive.filter(e => e.hp > 0).sort((x, y) => y.hp - x.hp)[0];
      if (hi) {
        deps.damage.fireChainLightning(hi, Math.max(10, Math.round(st.dmg * 0.75)), 2, {
          ox: hx, oy: hy, col: '#ff6a4d', burn: 18, noChainProc: true, isThunder: true, critChance: st.crit, critDmg: st.critDmg, comboThunderFire: true
        });
      }
    }
    if (deps.hero.hasDualRes('holy_omni')) {
      const prevHolyShield = h.shield || 0;
      h.shield = Math.max(prevHolyShield, Math.min(75, prevHolyShield + 6));
      const holyShieldGain = Math.max(0, Math.round(h.shield - prevHolyShield));
      if (holyShieldGain > 0 && ctx.game.stats) ctx.game.stats.shieldGained = (ctx.game.stats.shieldGained || 0) + holyShieldGain;
      h.shieldTimer = Math.max(h.shieldTimer, 4.0);
    }

    // Trigger Sub-Seal Elemental Resonances!
    for (const sub of ctx.game.subSeals) {
      if (sub.elem === 'wind') {
        const cnt = SUB_SEAL_RESONANCE.wind.blades[sub.star - 1];
        const baseAng = Math.atan2(hy - h.y, hx - h.x);
        for (let i = 0; i < cnt; i++) {
          const ang = baseAng + (i - (cnt - 1) / 2) * 0.45 + 0.2;
          pushProjectile({
            kind: 'arrow', x: hx, y: hy, vx: Math.cos(ang)*14.5, vy: Math.sin(ang)*14.5,
            life: 0.32, r: 0.25, pierce: 1, hitSet: new Set([hitEnemy.id]),
            dmg: Math.max(6, Math.round(st.dmg * 0.55)), splash: 0,
            opts: { tower: sub, isWind: true, fromHero: false, critChance: st.crit, critDmg: st.critDmg, col:'#8cffca' }
          });
        }
      } else if (sub.elem === 'thunder') {
        const proc = SUB_SEAL_RESONANCE.thunder.proc[sub.star - 1];
        if (ctx.game.rnd() < proc) {
          const thunderStart = hitEnemy.hp > 0 ? hitEnemy : ctx.game.enemies.find(o => o.hp > 0 && dist(o, hitEnemy) <= 4.4);
          if (thunderStart) {
            const ch = SUB_SEAL_RESONANCE.thunder.chains[sub.star - 1];
            deps.damage.fireChainLightning(thunderStart, Math.max(8, Math.round(st.dmg * 0.68)), ch, {
              tower: sub, ox: hx, oy: hy, noChainProc: true, critChance: st.crit, critDmg: st.critDmg
            });
          }
        }
      } else if (sub.elem === 'holy') {
        deps.damage.applyHeroLifesteal(SUB_SEAL_RESONANCE.holy.heal[sub.star - 1]);
        ctx.ports.vfx.addRing(hx, hy, '#ffe478', 0.95);
      }
    }
  }

  function updateProjectilesAndZones(dt){
    for (const p of ctx.game.projectiles) {
      if (p.kind === 'enemyShot') {
        p.t += dt;
        const u = clamp(p.t / p.dur, 0, 1);
        p.x = p.sx + (p.tx - p.sx) * u;
        p.y = p.sy + (p.ty - p.sy) * u;
        if (u >= 1) {
          p.done = true;
          // Dodgeable enemy shot: hits Hero only if still within impact radius <= 0.65
          if (dist(ctx.game.hero, { x: p.tx, y: p.ty }) <= 0.65) {
            damageHero(p.dmg, p.sourceMeta || {
              attackerName: p.w30Aux ? '深渊主宰' : p.w20Aux ? '天劫魔尊' : '远程敌军',
              attackerKind: p.w30Aux ? 'boss6' : p.w20Aux ? 'boss4' : 'mage',
              skillName: p.w30Aux === 'eclipse_seekers' ? '星蚀追踪弹 (W30随机辅助)' : p.w20Aux === 'chase_barrage' ? '周期追击弹幕 (W20随机辅助)' : '敌方弹幕',
              isBoss: !!(p.w30Aux || p.w20Aux),
              isBossCore: false,
              isBossAux: !!(p.w30Aux || p.w20Aux),
              auxKey: p.w30Aux || p.w20Aux || null
            });
          } else {
            ctx.ports.vfx.addRing(p.tx, p.ty, 'rgba(255,102,196,0.5)', 0.45);
          }
        }
        continue;
      }
      if (p.kind === 'arrow' || p.kind === 'firewave') {
        p.x += p.vx * dt; p.y += p.vy * dt;
        p.life -= dt;
        if (p.life <= 0) { p.done = true; continue; }
        for (const e of ctx.game.enemies) {
          if (e.hp <= 0 || p.hitSet.has(e.id)) continue;
          const dx = e.x - p.x;
          const dy = e.y - p.y;
          const reach = p.r + e.r;
          if (dx * dx + dy * dy <= reach * reach) {
            p.hitSet.add(e.id);
            if (p.kind === 'firewave') {
              const hadMarkOrBurn = (e.fireMarkT > 0 || e.burnT > 0);
              deps.damage.dealDamage(e, getVolleyDamage(p, e), {
                fromHero: !p.isCombo,
                skillKey: p.w10Branch === 'bk_blood_crescent' ? 'berserk' : (p.isCombo ? 'combo' : 'firewave'),
                critChance:p.critChance, critDmg:p.critDmg, col:'#ff9a52',
                burn: p.w10Branch ? 16 : 0,
                lifesteal:p.lifesteal, bonusGold:p.bonusGold
              });
              // W10 Fire Branch hooks: apply fireMark & trigger fireDetonation
              if (p.w10Branch && e.hp > 0) {
                deps.hooks.applyFireMark(e, 1, p.w10Branch, 5.0);
                if (p.w10Branch === 'fw_brand_pierce' && e.fireMarkStacks >= 2) {
                  deps.hooks.triggerFireDetonation(e, 1.35, 1.90, 'firewave');
                } else if (p.w10Branch === 'fw_ring_detonate' && (hadMarkOrBurn || e.fireMarkStacks >= 1)) {
                  deps.hooks.triggerFireDetonation(e, 1.15, 2.15, 'firewave');
                } else if (p.w10Branch === 'fw_homing_ember') {
                  if (hadMarkOrBurn || e.fireMarkStacks >= 2) {
                    deps.hooks.triggerFireDetonation(e, 1.15, 1.75, 'firewave');
                  }
                  if ((p.bounceLeft || 0) > 0) {
                    p.bounceLeft--;
                    const nextTgt = ctx.game.enemies
                      .filter(o => o.hp > 0 && o.id !== e.id && !p.hitSet.has(o.id) && dist(o, e) <= 4.2)
                      .sort((a, b) => dist(a, e) - dist(b, e))[0];
                    if (nextTgt) {
                      const bAng = Math.atan2(nextTgt.y - e.y, nextTgt.x - e.x);
                      pushProjectile({
                        kind: 'firewave', w10Branch: 'fw_homing_ember', bounceLeft: 0,
                        x: e.x, y: e.y, vx: Math.cos(bAng) * 13.0, vy: Math.sin(bAng) * 13.0,
                        life: 0.35, r: 0.50, pierce: 2, hitSet: new Set(p.hitSet),
                        dmg: Math.round(p.dmg * 0.85), critChance: p.critChance, critDmg: p.critDmg,
                        lifesteal: p.lifesteal, bonusGold: p.bonusGold
                      });
                    }
                  }
                } else if (p.w10Branch === 'bk_blood_crescent') {
                  deps.hooks.triggerFireDetonation(e, 1.15, 1.75, 'berserk');
                }
              }
              if (hasCombo(ctx.game, 'thunder_fire') && !p.isCombo && e.hp > 0 && ctx.game.rnd() < 0.45) {
                ctx.ports.vfx.addRing(e.x, e.y, '#ff6a38', 1.35);
                ctx.ports.vfx.addFloat(e.x, e.y - 0.55, '🌩️雷火劫!', '#ff9452', true);
                deps.damage.fireChainLightning(e, Math.round(p.dmg * 0.7), 3, { ox: e.x, oy: e.y - 2.4, skillKey:'combo', col:'#ff7840', comboThunderFire:true, critChance:p.critChance, critDmg:p.critDmg });
              }
              if (p.pierce !== undefined) {
                if (p.pierce > 0) p.pierce--;
                else { p.done = true; break; }
              }
            } else {
              if (p.w10Branch === 'nv_prism_lance' || p.w10Branch === 'bl_frost_shuriken' || p.w10Branch === 'th_storm_orb' || p.w10Branch === 'bk_war_tempest') {
                deps.hooks.applyFrostSlow(e, p.opts?.slow || 0.50, p.opts?.slowDur || 2.6, p.w10Branch);
                deps.hooks.gainFrostShield(6, 4.0, 90);
              }
              if (p.splash > 0) {
                ctx.ports.vfx.addRing(p.x, p.y, '#ff9848', p.splash);
                for (const o of ctx.game.enemies) {
                  if (o.hp > 0 && dist(o, p) <= p.splash + o.r) deps.damage.dealDamage(o, p.dmg, { ...p.opts, col:'#9affc8' });
                }
              } else {
                let damage = p.falloff ? p.dmg * Math.pow(p.falloff, p.hitSet.size - 1) : p.dmg;
                if (p.opts?.skillKey === 'swordlance' && p.hitSet.size === 1 && (e.boss || e.elite)) damage *= BALANCE.combat.lancePriorityMult;
                damage = Math.round(damage);
                deps.damage.dealDamage(e, damage, { ...p.opts, col: p.opts?.col || '#a8ffd2' });
                if (p.rebound && p.hitSet.size === 1 && e.hp > 0) {
                  const h = ctx.game.hero;
                  ctx.game.beams.push({ x1: e.x, y1: e.y, x2: h.x, y2: h.y, t: 0.22, max: 0.22, w: 3, col: '#a6f7d8' });
                  deps.damage.dealDamage(e, Math.round(damage * 0.56), { ...p.opts, buildEcho: true, fromHero: false, noChainProc: true });
                }
              }
              if (p.pierce > 0) p.pierce--;
              else { p.done = true; break; }
            }
          }
        }
        continue;
      }
      // Arcing explosive / frost balls
      p.t += dt;
      const u = clamp(p.t / p.dur, 0, 1);
      p.x = p.sx + (p.tx - p.sx) * u;
      p.y = p.sy + (p.ty - p.sy) * u;
      if (u >= 1) {
        p.done = true;
        const isFire = p.kind === 'fireball';
        ctx.ports.vfx.addRing(p.tx, p.ty, isFire ? '#ff7b47' : '#6ce2ff', p.splash);
        for (const e of ctx.game.enemies) {
          if (e.hp > 0 && dist(e, {x:p.tx, y:p.ty}) <= p.splash + e.r) {
            deps.damage.dealDamage(e, getVolleyDamage(p, e), { ...p.opts, col: isFire ? '#ff9f66' : '#8ceeff' });
            if (p.w10Branch === 'fw_mortar_cluster' && e.hp > 0) {
              deps.hooks.applyFireMark(e, 1, 'fw_mortar_cluster', 5.0);
              deps.hooks.triggerFireDetonation(e, 1.20, 1.85, 'firewave');
            }
          }
        }
        if (isFire && p.star >= 2) {
          ctx.game.zones.push({
            kind:'lava', w10Branch: p.w10Branch || null,
            x:p.tx, y:p.ty, r:p.splash * 0.85, t:3.0, max:3.0, tick:0.45,
            dps:p.burn || 20, tower:p.opts?.tower
          });
        }
      }
    }
    ctx.game.projectiles = ctx.game.projectiles.filter(p => !p.done);

    for (const z of ctx.game.zones) {
      z.t -= dt;
      if (z.kind === 'lava' || z.kind === 'fireVortex') {
        z.tick -= dt;
        if (z.tick <= 0) {
          z.tick = 0.45;
          for (const e of ctx.game.enemies) {
            if (e.hp > 0 && dist(e, z) <= z.r + e.r) {
              if (z.kind === 'fireVortex' && !e.boss && !deps.damage.isEnemyUnstoppable(e)) {
                const d = Math.max(0.25, dist(e, z));
                e.x = clamp(e.x + (z.x - e.x) / d * 0.42, 0.8, W - 0.8);
                e.y = clamp(e.y + (z.y - e.y) / d * 0.42, 0.8, H - 0.8);
              }
              deps.damage.dealDamage(e, Math.round(z.dps * 0.45), { tower:z.tower, skillKey: (z.w10Branch || z.w20Source) ? 'firewave' : undefined, col:'#ff884d' });
              if ((z.w10Branch || z.kind === 'fireVortex') && e.hp > 0) {
                deps.hooks.applyFireMark(e, 1, z.w20Source || z.w10Branch || 'fireVortex', 4.5);
                if (e.fireMarkStacks >= 2 && z.w10Branch) deps.hooks.triggerFireDetonation(e, 1.10, 1.75, 'firewave');
              }
            }
          }
        }
      } else if (z.kind === 'frostVortex' || z.kind === 'frostTrail') {
        z.tick -= dt;
        if (z.tick <= 0) {
          z.tick = 0.45;
          let hitAny = false;
          for (const e of ctx.game.enemies) {
            if (e.hp > 0 && dist(e, z) <= z.r + e.r) {
              hitAny = true;
              if (z.kind === 'frostVortex' && !e.boss) {
                const d = Math.max(0.2, dist(e, z));
                e.x = clamp(e.x + (z.x - e.x) / d * 0.35, 0.8, W - 0.8);
                e.y = clamp(e.y + (z.y - e.y) / d * 0.35, 0.8, H - 0.8);
              }
              deps.hooks.applyFrostSlow(e, 0.60, 2.4, z.kind);
              deps.damage.dealDamage(e, Math.max(6, Math.round((z.dps || 18) * 0.45)), { skillKey:'nova', col:'#8cf0ff', slow:0.60, slowDur:2.4 });
            }
          }
          if (hitAny || z.w20Source === 'w20_frost_pillar_ward') deps.hooks.gainFrostShield(z.w20Source === 'w20_frost_pillar_ward' ? 10 : 6, { duration: 4.2, source: z.w20Source || 'frost_zone' });
        }
      } else if (z.kind === 'thunderField') {
        z.tick -= dt;
        if (z.tick <= 0) {
          z.tick = 0.50;
          for (const e of ctx.game.enemies) {
            if (e.hp > 0 && dist(e, z) <= z.r + e.r) {
              deps.hooks.applyFireMark(e, 1, 'th_judgment_pillar', 4.5);
              deps.damage.dealDamage(e, Math.max(8, Math.round((z.dps || 24) * 0.50)), { skillKey:'thunder', isThunder:true, col:'#d8a6ff' });
              if (e.hp > 0 && e.fireMarkStacks >= 2) deps.hooks.triggerFireDetonation(e, 1.15, 1.80, 'thunder');
            }
          }
        }
      } else if (z.kind === 'bossSlam' && z.t <= 0) {
        z.done = true;
        ctx.ports.vfx.addRing(z.x, z.y, '#ff4d42', z.r);
        ctx.game.shake = Math.max(ctx.game.shake, 8);
        ctx.ports.audio.play('boss', 1.2);
        const slamMeta = z.sourceMeta || {
          attackerName: z.w20Aux ? '天劫魔尊' : '强敌重击',
          attackerKind: z.w20Aux ? 'boss4' : 'boss',
          skillName: z.w20Aux === 'charged_shockwave' ? '蓄力震荡波 (W20随机辅助)' : '裂地重击',
          isBoss: true, isBossCore: !z.w20Aux, isBossAux: !!z.w20Aux, auxKey: z.w20Aux || null
        };
        if (dist(ctx.game.hero, z) <= z.r) damageHero(z.dmg || 34, slamMeta);
        if (z.leaveLava) {
          ctx.game.zones.push({
            kind:'enemyLava', x:z.x, y:z.y, r:z.r * 0.8, t:2.2, max:2.2, tick:0.55, dmg: Math.round((z.dmg || 24) * 0.35),
            sourceMeta: { attackerName: slamMeta.attackerName, attackerKind: slamMeta.attackerKind, skillName: '灼地焦土(持续)', isBoss: slamMeta.isBoss, isBossCore: slamMeta.isBossCore, isBossAux: slamMeta.isBossAux }
          });
        }
      } else if (z.kind === 'poisonBomb' && z.t <= 0) {
        z.done = true;
        ctx.ports.vfx.addRing(z.x, z.y, '#52ff9a', z.r);
        const pbMeta = z.sourceMeta || { attackerName: '煞毒自爆虫', attackerKind: 'bomber', skillName: '剧毒自爆', isBoss: false, isBossCore: false, isBossAux: false };
        if (dist(ctx.game.hero, z) <= z.r) damageHero(z.dmg || 10, pbMeta);
        ctx.game.zones.push({
          kind:'poisonPool', x:z.x, y:z.y, r:z.r * 0.9, t:2.8, max:2.8, tick:0.65, dmg: Math.max(4, Math.round((z.dmg || 10) * 0.45)),
          sourceMeta: { attackerName: pbMeta.attackerName, attackerKind: 'bomber', skillName: '残留毒池(持续)', isBoss: false, isBossCore: false, isBossAux: false }
        });
      } else if (z.kind === 'poisonPool' || z.kind === 'enemyLava') {
        z.tick -= dt;
        if (z.tick <= 0) {
          z.tick = z.kind === 'enemyLava' ? 0.55 : 0.65;
          if (dist(ctx.game.hero, z) <= z.r) {
            damageHero(z.dmg, z.sourceMeta || {
              attackerName: z.kind === 'enemyLava' ? '火焰领域' : '煞毒虫',
              attackerKind: z.kind,
              skillName: z.kind === 'enemyLava' ? '灼地焦土(持续)' : '残留毒池(持续)',
              isBoss: false, isBossCore: false, isBossAux: false
            });
          }
        }
      } else if (z.kind === 'bossWave' || z.kind === 'w30RiftRing') {
        const prog = 1 - clamp(z.t / z.max, 0, 1);
        const curR = z.r * prog;
        if (!z.hitHero && Math.abs(dist(ctx.game.hero, z) - curR) <= 0.55) {
          z.hitHero = true;
          damageHero(z.dmg || 36, z.sourceMeta || {
            attackerName: z.kind === 'w30RiftRing' ? '深渊主宰' : z.w20Aux ? '天劫魔尊' : '首领震波',
            attackerKind: z.kind === 'w30RiftRing' ? 'boss6' : 'boss',
            skillName: z.w30Aux === 'rift_rings' ? '裂空震荡环 (W30随机辅助)' : z.w20Aux === 'oppression_ring' ? '领域压迫环 (W20随机辅助)' : '首领扩散震波',
            isBoss: true, isBossCore: !(z.w30Aux || z.w20Aux), isBossAux: !!(z.w30Aux || z.w20Aux), auxKey: z.w30Aux || z.w20Aux || null
          });
        }
      } else if (z.kind === 'w30SigTelegraph') {
        // Pure telegraph + safe zone marker; deals no damage until shockwave phase
      } else if (z.kind === 'w30SigShockwave') {
        const prog = 1 - clamp(z.t / z.max, 0, 1);
        const curR = z.r * prog;
        const inSafeZone = dist(ctx.game.hero, { x: z.safeX, y: z.safeY }) <= (z.safeR || 2.8);
        if (!z.hitHero && !inSafeZone && Math.abs(dist(ctx.game.hero, z) - curR) <= 0.85) {
          z.hitHero = true;
          damageHero(z.dmg || 68, z.sourceMeta || {
            attackerName: '深渊主宰', attackerKind: 'boss6',
            skillName: '终焉裂空冲击波 (W30核心招牌)', damageTuned: true,
            isBoss: true, isBossCore: true, isBossAux: false
          });
        }
      }
    }
    ctx.game.zones = ctx.game.zones.filter(z => z.t > 0 && !z.done);
  }

  function updateEnemies(dt){
    const h = ctx.game.hero;
    const wfFrostAura = deps.hero.hasDualRes('wind_frost');

    for (const e of ctx.game.enemies) {
      if (e.hp <= 0) continue;
      e.cd = Math.max(0, e.cd - dt);
      e.aiCd = Math.max(0, e.aiCd - dt);
      e.flash = Math.max(0, e.flash - dt);
      if (e.unstopFloatCd > 0) e.unstopFloatCd = Math.max(0, e.unstopFloatCd - dt);
      if (e.sigFloatCd > 0) e.sigFloatCd = Math.max(0, e.sigFloatCd - dt);
      if (e.zeroExecCd > 0) e.zeroExecCd = Math.max(0, e.zeroExecCd - dt);
      if (e.frenzyT > 0) e.frenzyT = Math.max(0, e.frenzyT - dt);
      if (e.vulnT > 0) e.vulnT = Math.max(0, e.vulnT - dt);
      if (e.fireDetonateCd > 0) e.fireDetonateCd = Math.max(0, e.fireDetonateCd - dt);
      if (e.fireMarkT > 0) {
        e.fireMarkT = Math.max(0, e.fireMarkT - dt);
        if (e.fireMarkT === 0) { e.fireMarkStacks = 0; e.fireMarkSource = null; }
      }
      if (deps.damage.isEnemyUnstoppable(e)) { e.slow = 0; e.slowT = 0; e.freezeT = 0; }
      else if (e.slowT > 0) { e.slowT = Math.max(0, e.slowT - dt); if (e.slowT === 0) e.slow = 0; }
      if (e.burnT > 0) {
        const burnTick = Math.max(0, (e.burnDps || 0) * Math.min(e.burnT, dt));
        e.burnT = Math.max(0, e.burnT - dt);
        if (e.burnT === 0) e.burnDps = 0;
        if (e.kind === 'boss6' && e.signatureLockActive) {
          // STRICT HP LOCK during signature: burn timer ticks, 0 HP deducted, 0 burn dmg recorded!
          e.hp = e.signatureThresholdHp;
        } else if (burnTick > 0) {
          let remBurn = burnTick;
          let actualBurnDmg = 0;
          if (e.shield > 0) {
            const shAbs = Math.min(e.shield, remBurn);
            e.shield -= shAbs;
            remBurn -= shAbs;
            actualBurnDmg += shAbs;
          }
          if (e.kind === 'boss6' && !e.signatureTriggered && e.signatureThresholdHp > 0 && (e.hp - remBurn) <= e.signatureThresholdHp) {
            const allowedHp = Math.max(0, e.hp - e.signatureThresholdHp);
            const trunc = Math.max(0, remBurn - allowedHp);
            e.hp = e.signatureThresholdHp;
            actualBurnDmg += allowedHp;
            if (actualBurnDmg > 0 && ctx.game.stats) {
              ctx.game.stats.dmgTotal += actualBurnDmg;
              if (ctx.game.stats.skillDmg) ctx.game.stats.skillDmg.burn = (ctx.game.stats.skillDmg.burn || 0) + actualBurnDmg;
            }
            deps.damage.triggerW30BossSignature(e, trunc);
          } else {
            const prevHp = Math.max(0, e.hp);
            e.hp -= remBurn;
            actualBurnDmg += Math.min(prevHp, remBurn);
            if (actualBurnDmg > 0 && ctx.game.stats) {
              ctx.game.stats.dmgTotal += actualBurnDmg;
              if (ctx.game.stats.skillDmg) ctx.game.stats.skillDmg.burn = (ctx.game.stats.skillDmg.burn || 0) + actualBurnDmg;
            }
            if (e.kind === 'boss6' && e.signatureTriggered && !e.signatureLockActive && !e.finalPhaseEntered && e.hp > 0 && e.hp <= e.finalThresholdHp) {
              deps.damage.enterW30BossFinalPhase(e);
            }
            if (e.hp <= 0) { deps.damage.onEnemyKilled(e, {}); continue; }
          }
        }
      }
      if (e.freezeT > 0 && !deps.damage.isEnemyUnstoppable(e)) { e.freezeT = Math.max(0, e.freezeT - dt); continue; }

      // Stage 3: W20 Boss Shield Totem stays stationary and periodically shields boss4 until destroyed by player
      if (e.totem) {
        e.totemTimer = (e.totemTimer ?? 2.4) - dt;
        if (e.totemTimer <= 0) {
          e.totemTimer = 2.4;
          const ownerBoss = ctx.game.enemies.find(o => o.hp > 0 && (o.id === e.totemBossId || o.kind === 'boss4'));
          if (ownerBoss) {
            ownerBoss.shield = Math.min(Math.round(ownerBoss.maxHp * 0.14), (ownerBoss.shield || 0) + 160);
            ctx.ports.vfx.addRing(e.x, e.y, '#6ce2ff', 1.4);
            ctx.game.bolts.push({ pts: [{ x: e.x, y: e.y }, { x: ownerBoss.x, y: ownerBoss.y }], t: 0.25, max: 0.25, col: '#6ce2ff' });
          }
        }
        continue;
      }

      // Stage 5: W30 Abyss Pillar stays stationary and grants modest shield to boss6 until destroyed (fair to all builds)
      if (e.pillar) {
        e.pillarTimer = (e.pillarTimer ?? 2.8) - dt;
        if (e.pillarTimer <= 0) {
          e.pillarTimer = 2.8;
          const ownerBoss = ctx.game.enemies.find(o => o.hp > 0 && (o.id === e.pillarBossId || o.kind === 'boss6'));
          if (ownerBoss && !ownerBoss.signatureLockActive) {
            ownerBoss.shield = Math.min(Math.round(ownerBoss.maxHp * 0.04), (ownerBoss.shield || 0) + 650);
            ctx.ports.vfx.addRing(e.x, e.y, '#ff88dc', 1.5);
            ctx.game.bolts.push({ pts: [{ x: e.x, y: e.y }, { x: ownerBoss.x, y: ownerBoss.y }], t: 0.28, max: 0.28, col: '#ff88dc' });
          }
        }
        continue;
      }

      const dHero = dist(e, h);

      // Elite Affixes (疾奔 / 弹幕 / 灵盾 / 引力)
      if (e.elite && e.affixes?.length) {
        e.affixTimer -= dt;
        if (e.affixTimer <= 0) {
          e.affixTimer = e.isShrineBoss ? 3.0 : 3.8;
          const pick = e.affixes[Math.floor(ctx.game.rnd() * e.affixes.length)].key;
          if (pick === 'sprint' && e.aiState === 'chase' && dHero > 1.8) {
            const len = Math.max(0.01, dHero);
            e.aiState = 'charge'; e.aiTimer = 0.45;
            e.slow = 0; e.slowT = 0; e.freezeT = 0;
            e.aiVx = (h.x - e.x) / len; e.aiVy = (h.y - e.y) / len;
            ctx.ports.vfx.addFloat(e.x, e.y - 0.5, '⚡疾奔·霸体!', '#ffaa44');
          } else if (pick === 'volley') {
            for (let k = 0; k < 8; k++) {
              const ang = (Math.PI * 2 * k) / 8 + ctx.game.waveClock;
              pushProjectile({
                kind:'enemyShot', sx:e.x, sy:e.y, x:e.x, y:e.y,
                tx: clamp(e.x + Math.cos(ang) * 5.2, 0.8, W - 0.8),
                ty: clamp(e.y + Math.sin(ang) * 5.2, 0.8, H - 0.8),
                t:0, dur: 0.72, dmg: Math.round(e.dmg * 0.75),
                sourceMeta: { attackerName: e.name || '精英怪', attackerKind: e.kind, skillName: '精英环状弹幕', isBoss: false, isBossCore: false, isBossAux: false }
              });
            }
            ctx.ports.vfx.addRing(e.x, e.y, '#d86cff', 1.6);
          } else if (pick === 'shield') {
            e.shield = Math.round(e.maxHp * 0.16);
            ctx.ports.vfx.addRing(e.x, e.y, '#6ce2ff', 2.4);
            for (const o of ctx.game.enemies) {
              if (o.hp > 0 && dist(o, e) <= 3.2) o.frenzyT = Math.max(o.frenzyT, 2.0);
            }
          } else if (pick === 'vortex' && dHero <= 6.5 && dHero > 1.2) {
            ctx.ports.vfx.addRing(e.x, e.y, '#a46bff', 4.5);
            const pull = 1.45;
            h.x = clamp(h.x + (e.x - h.x) / dHero * pull, 1.2, W - 1.2);
            h.y = clamp(h.y + (e.y - h.y) / dHero * pull, 1.2, H - 1.2);
            ctx.ports.vfx.addFloat(e.x, e.y - 0.55, '🌀引力牵引!', '#c68cff');
          }
        }
      }

      // Shaman (妖火祭司): buffer heal + frenzy pulse + anti-AFK Demon Fire Meteor on Hero!
      if (e.shaman) {
        e.shamanTimer -= dt;
        if (e.shamanTimer <= 0) {
          e.shamanTimer = 2.6;
          ctx.ports.vfx.addRing(e.x, e.y, '#ff9f43', 3.4);
          for (const o of ctx.game.enemies) {
            if (o.hp > 0 && dist(o, e) <= 3.4) {
              if (!o.signatureLockActive) {
                const healPct = o.boss ? BALANCE.combat.bossShamanHealingPct : BALANCE.combat.normalShamanHealingPct;
                o.hp = Math.min(o.maxHp, o.hp + Math.round(o.maxHp * healPct));
              }
              o.frenzyT = Math.max(o.frenzyT, 2.4);
            }
          }
          if (dHero <= 7.5) {
            const teleBuf = deps.meta.hasMetaAux('aux_telegraph_buffer') ? 0.20 : 0;
            ctx.game.zones.push({
              kind:'bossSlam', leaveLava:true,
              x: clamp(h.x, 1.2, W - 1.2), y: clamp(h.y, 1.2, H - 1.2),
              r: 1.55, t: 1.05 + teleBuf, max: 1.05 + teleBuf, dmg: Math.round(e.dmg * 1.65),
              sourceMeta: { attackerName: e.name || '妖火祭司', attackerKind: e.kind, skillName: '妖火天降点名', isBoss: false, isBossCore: false, isBossAux: false }
            });
            ctx.ports.vfx.addFloat(e.x, e.y - 0.6, '🔥妖火点名!', '#ff9f43', true);
          }
        }
      }

      // 6 Distinct Boss Mechanics (W5/10/15/20/25/30) + Half-HP Frenzy!
      if (e.boss) {
        if (e.kind !== 'boss6' && !e.frenzied && e.hp <= e.maxHp * 0.5) {
          e.frenzied = true;
          e.spd *= 1.25;
          ctx.ports.vfx.addRing(e.x, e.y, '#ff4f42', 3.6);
          ctx.ports.vfx.addFloat(e.x, e.y - 0.8, '🔥 首领半血狂暴！', '#ff4f42', true);
        }

        // Stage 5: W30 Final Boss (boss6) 3-Phase State Machine (Signature Lock + Fair Auxiliary Mechanics)
        if (e.kind === 'boss6') {
          const w30Cfg = BALANCE.w30Boss || {};
          if (e.signatureLockActive) {
            e.hp = e.signatureThresholdHp;
            e.signatureTimer = Math.max(0, (e.signatureTimer || 0) - dt);
            if (e.signatureStage === 'telegraph' && e.signatureTimer <= 0) {
              const shockSec = w30Cfg.signatureShockwaveSeconds || 2.2;
              e.signatureStage = 'shockwave';
              e.signatureTimer = shockSec;
              const sz = e.signatureSafeZone || { x: clamp(h.x, 4, W - 4), y: clamp(h.y, 4, H - 4), r: w30Cfg.signatureSafeZoneRadius || 2.8 };
              ctx.game.zones.push({
                kind: 'w30SigShockwave',
                bossId: e.id,
                x: e.x, y: e.y, r: 17.0,
                safeX: sz.x, safeY: sz.y, safeR: sz.r,
                t: shockSec, max: shockSec,
                dmg: w30Cfg.signatureDamage || 68,
                hitHero: false
              });
              if (ctx.game.w30Battle) {
                const at = Number((ctx.game.w30Battle.elapsedSeconds || 0).toFixed(2));
                ctx.game.w30Battle.phase = 'signature_shockwave';
                ctx.game.w30Battle.phaseTimeline.push({
                  phase: 'signature_shockwave',
                  at,
                  bossHpPct: Math.round(e.hp * 100 / Math.max(1, e.maxHp))
                });
              }
              ctx.ports.audio.play('boss', 1.18);
              ctx.game.shake = Math.max(ctx.game.shake, 11);
              ctx.ports.vfx.addRing(e.x, e.y, '#ff2e63', 5.5);
              ctx.ports.vfx.addFloat(e.x, e.y - 1.0, '💥 终焉裂空冲击波爆发！', '#ff5c7a', true);
            } else if (e.signatureStage === 'shockwave' && e.signatureTimer <= 0) {
              // IMMEDIATE UNLOCK the instant shockwave finishes -> enter mid_skirmish!
              e.signatureStage = 'done';
              e.signatureLockActive = false;
              e.aiState = 'chase';
              e.bossTimer = Math.min(e.bossTimer || 2.5, 2.2);
              e.bossAuxTimer = Math.min(e.bossAuxTimer || 4.0, 3.6);
              ctx.game.zones = ctx.game.zones.filter(z => z.kind !== 'w30SigTelegraph' && z.kind !== 'w30SigShockwave');
              if (ctx.game.w30Battle) {
                const at = Number((ctx.game.w30Battle.elapsedSeconds || 0).toFixed(2));
                ctx.game.w30Battle.signatureLockActive = false;
                ctx.game.w30Battle.signatureLockEndedAt = at;
                ctx.game.w30Battle.phase = 'mid_skirmish';
                ctx.game.w30Battle.phaseTimeline.push({
                  phase: 'mid_skirmish',
                  at,
                  bossHpPct: Math.round(e.hp * 100 / Math.max(1, e.maxHp))
                });
              }
              const sz = e.signatureSafeZone || { x: h.x, y: h.y };
              deps.damage.spawnHealOrb(sz.x, sz.y);
              ctx.ports.vfx.addRing(e.x, e.y, '#72f2b4', 3.4);
              ctx.ports.vfx.addFloat(e.x, e.y - 0.95, '🔓 终焉锁血解除 · 恢复正常扣血！', '#72f2b4', true);
              ctx.ports.ui.showBanner('🔓 终焉冲击波结束 · 首领解除锁血！', '现在可正常造成伤害与吸血，进入中段周旋（35% 进入末段）！', 'good');
            }
            continue; // Channel signature in place (remains hittable for Fire Marks / Frost Slow / Frost Shield!)
          }

          // Mid-skirmish & Final-combo Fair Auxiliary Mechanic Execution
          if (e.signatureTriggered && !e.signatureLockActive) {
            e.bossAuxTimer = (e.bossAuxTimer ?? (w30Cfg.auxCooldownMid || 9.5)) - dt;
            if (e.bossAuxTimer <= 0) {
              e.bossAuxTimer = e.finalPhaseEntered ? (w30Cfg.auxCooldownFinal || 7.5) : (w30Cfg.auxCooldownMid || 9.5);
              e.bossAuxCasts = (e.bossAuxCasts || 0) + 1;
              const auxKey = ctx.game.bossIntel?.w30AuxKey || 'abyss_pillars';
              if (ctx.game.w30Battle) ctx.game.w30Battle.auxTriggers = (ctx.game.w30Battle.auxTriggers || 0) + 1;

              if (auxKey === 'abyss_pillars') {
                const hasPillar = ctx.game.enemies.some(o => o.hp > 0 && o.pillar);
                if (!hasPillar && ctx.game.enemies.length < MAX_ENEMIES) {
                  const ang = ctx.game.rnd() * Math.PI * 2;
                  const px = clamp(e.x + Math.cos(ang) * 3.8, 2.0, W - 2.0);
                  const py = clamp(e.y + Math.sin(ang) * 3.8, 2.0, H - 2.0);
                  const pil = deps.damage.spawnEnemy('pillar', 'west', 1, { x: px, y: py });
                  pil.pillarBossId = e.id;
                  ctx.ports.vfx.addRing(px, py, '#ff78d4', 2.2);
                  ctx.ports.vfx.addFloat(px, py - 0.7, '🔮 护界晶柱降临(击破易伤+回血)!', '#ff9ae0', true);
                } else {
                  deps.damage.spawnHealOrb(clamp(h.x + (ctx.game.rnd() - 0.5) * 4.5, 2.5, W - 2.5), clamp(h.y + (ctx.game.rnd() - 0.5) * 4.5, 2.5, H - 2.5));
                }
              } else if (auxKey === 'eclipse_seekers') {
                const baseAng = Math.atan2(h.y - e.y, h.x - e.x);
                for (let k = 0; k < 5; k++) {
                  const a = baseAng + (k - 2) * 0.28;
                  pushProjectile({
                    kind: 'enemyShot', w30Aux: 'eclipse_seekers', sx: e.x, sy: e.y, x: e.x, y: e.y,
                    tx: clamp(e.x + Math.cos(a) * 9.2, 0.8, W - 0.8),
                    ty: clamp(e.y + Math.sin(a) * 9.2, 0.8, H - 0.8),
                    t: 0, dur: 0.95, dmg: 30
                  });
                }
                ctx.ports.vfx.addFloat(e.x, e.y - 0.9, '🌑 辅助·星蚀追踪弹！', '#d9a4ff', true);
                if (e.bossAuxCasts % 2 === 0) {
                  deps.damage.spawnHealOrb(clamp(h.x + (ctx.game.rnd() - 0.5) * 5.0, 2.5, W - 2.5), clamp(h.y + (ctx.game.rnd() - 0.5) * 5.0, 2.5, H - 2.5));
                }
              } else if (auxKey === 'rift_rings') {
                ctx.game.zones.push({ kind: 'w30RiftRing', w30Aux: 'rift_rings', x: e.x, y: e.y, r: 7.4, t: 1.35, max: 1.35, dmg: 34, hitHero: false });
                ctx.game.zones.push({ kind: 'w30RiftRing', w30Aux: 'rift_rings', x: e.x, y: e.y, r: 9.8, t: 2.05, max: 2.05, dmg: 34, hitHero: false });
                ctx.ports.vfx.addFloat(e.x, e.y - 0.9, '💫 辅助·双重裂空震荡环！', '#ff80c8', true);
                if (e.bossAuxCasts % 2 === 0) {
                  deps.damage.spawnHealOrb(clamp(h.x + (ctx.game.rnd() - 0.5) * 5.0, 2.5, W - 2.5), clamp(h.y + (ctx.game.rnd() - 0.5) * 5.0, 2.5, H - 2.5));
                }
              } else if (auxKey === 'void_guards') {
                const liveGuards = ctx.game.enemies.filter(o => o.hp > 0 && o.voidGuard).length;
                const toSpawn = Math.max(0, Math.min(2, 3 - liveGuards));
                for (let k = 0; k < toSpawn; k++) {
                  if (ctx.game.enemies.length >= MAX_ENEMIES) break;
                  const a = ctx.game.rnd() * Math.PI * 2;
                  deps.damage.spawnEnemy('void_guard', 'west', 1, {
                    x: clamp(e.x + Math.cos(a) * 3.0, 1.5, W - 1.5),
                    y: clamp(e.y + Math.sin(a) * 3.0, 1.5, H - 1.5)
                  });
                }
                ctx.ports.vfx.addFloat(e.x, e.y - 0.9, '👾 辅助·暗潮近卫召临！', '#b896ff', true);
              }
            }
          }
        }

        // Stage 3: W20 Boss (boss4) fair rolled auxiliary mechanic execution
        if (e.kind === 'boss4') {
          if ((e.bossChaseQueue || 0) > 0) {
            e.bossChaseCd = Math.max(0, (e.bossChaseCd || 0) - dt);
            if (e.bossChaseCd <= 0) {
              e.bossChaseQueue--;
              e.bossChaseCd = 0.65;
              const cAng = Math.atan2(h.y - e.y, h.x - e.x);
              for (let k = -1; k <= 2; k++) {
                const a = cAng + (k - 0.5) * 0.20;
                pushProjectile({
                  kind: 'enemyShot', w20Aux: 'chase_barrage', sx: e.x, sy: e.y, x: e.x, y: e.y,
                  tx: clamp(e.x + Math.cos(a) * 8.4, 0.8, W - 0.8),
                  ty: clamp(e.y + Math.sin(a) * 8.4, 0.8, H - 0.8),
                  t: 0, dur: 0.84, dmg: 28
                });
              }
            }
          }
          e.bossAuxTimer = (e.bossAuxTimer ?? 3.6) - dt;
          if (e.bossAuxTimer <= 0) {
            e.bossAuxTimer = e.frenzied ? 5.2 : 6.6;
            const auxKey = ctx.game.bossIntel?.w20AuxKey || 'oppression_ring';
            if (ctx.game.stats) ctx.game.stats.w20BossAuxTriggers = (ctx.game.stats.w20BossAuxTriggers || 0) + 1;
            if (auxKey === 'oppression_ring') {
              ctx.game.zones.push({ kind: 'bossWave', w20Aux: 'oppression_ring', x: e.x, y: e.y, r: 6.2, t: 1.25, max: 1.25, dmg: 38, hitHero: false });
              ctx.ports.vfx.addFloat(e.x, e.y - 0.9, '🔴 辅助机制·领域压迫环！', '#ff6e9c', true);
            } else if (auxKey === 'shield_totem') {
              const hasTotem = ctx.game.enemies.some(o => o.hp > 0 && o.totem);
              if (!hasTotem && ctx.game.enemies.length < MAX_ENEMIES) {
                const ang = ctx.game.rnd() * Math.PI * 2;
                const tx = clamp(e.x + Math.cos(ang) * 3.0, 1.4, W - 1.4);
                const ty = clamp(e.y + Math.sin(ang) * 3.0, 1.4, H - 1.4);
                const tot = deps.damage.spawnEnemy('totem', 'west', 1, { x: tx, y: ty });
                tot.totemBossId = e.id;
                ctx.ports.vfx.addRing(tx, ty, '#6ce2ff', 2.0);
                ctx.ports.vfx.addFloat(tx, ty - 0.65, '🛡️ 护盾图腾降临（可击碎）!', '#8ef4ff', true);
              } else {
                e.shield = Math.min(Math.round(e.maxHp * 0.14), (e.shield || 0) + 140);
              }
            } else if (auxKey === 'chase_barrage') {
              e.bossChaseQueue = 2;
              e.bossChaseCd = 0.01;
              ctx.ports.vfx.addRing(e.x, e.y, '#d47cff', 2.2);
              ctx.ports.vfx.addFloat(e.x, e.y - 0.9, '🟣 辅助机制·追击弹幕！', '#dfb0ff', true);
            } else if (auxKey === 'charged_shockwave') {
              const dirs = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
              for (const a of dirs) {
                ctx.game.zones.push({
                  kind: 'bossSlam', w20Aux: 'charged_shockwave',
                  x: clamp(h.x + Math.cos(a) * 2.1, 1, W - 1),
                  y: clamp(h.y + Math.sin(a) * 2.1, 1, H - 1),
                  r: 1.85, t: 1.30, max: 1.30, dmg: 42
                });
              }
              ctx.ports.vfx.addFloat(e.x, e.y - 0.9, '💥 辅助机制·蓄力震荡波！', '#ff9852', true);
            }
          }
        }
        e.bossTimer -= dt;
        if (e.bossTimer <= 0) {
          e.bossTimer = e.frenzied ? 4.5 : e.kind === 'boss4' ? BALANCE.combat.w20CoreCooldown : 6.0;
          const scale = Math.pow(BALANCE.wave.normalHpGrowth || 1.115, ctx.game.wave - 1);
          const teleBuf = deps.meta.hasMetaAux('aux_telegraph_buffer') ? 0.20 : 0;
          if (e.kind === 'boss1') {
            // 熔岩巨魔 (W5): Charge + 2 lava slam zones + summon 2 bombers
            const len = Math.max(0.01, dHero);
            e.aiState = 'windup'; e.aiTimer = 0.55; e.aiKind = 'charge';
            e.slow = 0; e.slowT = 0; e.freezeT = 0;
            e.aiVx = (h.x - e.x) / len; e.aiVy = (h.y - e.y) / len;
            for (let k = 0; k < 2; k++) {
              const ang = ctx.game.rnd() * Math.PI * 2;
              const dOff = k === 0 ? 0 : 2.1;
              ctx.game.zones.push({
                kind:'bossSlam', leaveLava:true, x: clamp(h.x + Math.cos(ang)*dOff, 1, W-1), y: clamp(h.y + Math.sin(ang)*dOff, 1, H-1),
                r: 1.9, t: 1.4 + teleBuf, max: 1.4 + teleBuf, dmg: 30,
                sourceMeta: { attackerName: e.name, attackerKind: e.kind, skillName: '熔岩裂地重击 (W5核心)', isBoss: true, isBossCore: true, isBossAux: false }
              });
            }
            ctx.ports.vfx.addFloat(e.x, e.y - 0.7, '🔥 熔岩冲撞！', '#ff8c70', true);
            for (let k = 0; k < 2; k++) {
              if (ctx.game.enemies.length >= MAX_ENEMIES) break;
              deps.damage.spawnEnemy('bomber', 'west', scale, { x: clamp(e.x + (ctx.game.rnd()-0.5)*1.8, 0.8, W-0.8), y: clamp(e.y + (ctx.game.rnd()-0.5)*1.8, 0.8, H-0.8) });
            }
          } else if (e.kind === 'boss2') {
            // 暗影死灵王 (W10): 10-orb ring volley + slam + 4 wolves
            for (let k = 0; k < 10; k++) {
              const ang = (Math.PI * 2 * k) / 10 + ctx.game.waveClock;
              pushProjectile({
                kind:'enemyShot', sx:e.x, sy:e.y, x:e.x, y:e.y,
                tx: clamp(e.x + Math.cos(ang) * 7.2, 0.8, W-0.8),
                ty: clamp(e.y + Math.sin(ang) * 7.2, 0.8, H-0.8),
                t:0, dur: 0.88, dmg: 26,
                sourceMeta: { attackerName: e.name, attackerKind: e.kind, skillName: '死灵环状弹幕 (W10核心)', isBoss: true, isBossCore: true, isBossAux: false }
              });
            }
            ctx.game.zones.push({
              kind:'bossSlam', x: h.x, y: h.y, r: 2.1, t: 1.4 + teleBuf, max: 1.4 + teleBuf, dmg: 34,
              sourceMeta: { attackerName: e.name, attackerKind: e.kind, skillName: '死灵裂地重击 (W10核心)', isBoss: true, isBossCore: true, isBossAux: false }
            });
            ctx.ports.vfx.addFloat(e.x, e.y - 0.7, '💀 死灵弹幕阵！', '#d284ff', true);
            for (let k = 0; k < 4; k++) {
              if (ctx.game.enemies.length >= MAX_ENEMIES) break;
              const a = (Math.PI * 2 * k) / 4;
              deps.damage.spawnEnemy('wolf', 'west', scale, { x: clamp(h.x + Math.cos(a)*5.5, 0.8, W-0.8), y: clamp(h.y + Math.sin(a)*5.5, 0.8, H-0.8) });
            }
          } else if (e.kind === 'boss3') {
            // 毁灭泰坦 (W15): Leap Slam + Expanding Shockwave Ring + 2 Brutes
            ctx.game.zones.push({
              kind:'bossSlam', x: h.x, y: h.y, r: 2.7, t: 1.4 + teleBuf, max: 1.4 + teleBuf, dmg: 44,
              sourceMeta: { attackerName: e.name, attackerKind: e.kind, skillName: '泰坦重踏 (W15核心)', isBoss: true, isBossCore: true, isBossAux: false }
            });
            ctx.game.zones.push({
              kind:'bossWave', x: e.x, y: e.y, r: 5.8, t: 1.15 + teleBuf, max: 1.15 + teleBuf, dmg: 36, hitHero: false,
              sourceMeta: { attackerName: e.name, attackerKind: e.kind, skillName: '泰坦裂地震波 (W15核心)', isBoss: true, isBossCore: true, isBossAux: false }
            });
            ctx.ports.vfx.addFloat(e.x, e.y - 0.7, '💥 泰坦裂地波！', '#ff5247', true);
            for (let k = 0; k < 2; k++) {
              if (ctx.game.enemies.length >= MAX_ENEMIES) break;
              deps.damage.spawnEnemy('brute', 'west', scale, { x: clamp(e.x + (ctx.game.rnd()-0.5)*1.8, 0.8, W-0.8), y: clamp(e.y + (ctx.game.rnd()-0.5)*1.8, 0.8, H-0.8) });
            }
          } else if (e.kind === 'boss4') {
            // 天劫魔尊 (W20): Fixed Core = 3 telegraphed thunder slam zones + 6 lightning orbs + 2 Brutes
            for (let k = 0; k < 3; k++) {
              const ang = (Math.PI * 2 * k) / 3 + ctx.game.rnd() * 0.6;
              const distOff = k === 0 ? 0 : 2.3;
              ctx.game.zones.push({
                kind:'bossSlam', x: clamp(h.x + Math.cos(ang)*distOff, 1, W-1), y: clamp(h.y + Math.sin(ang)*distOff, 1, H-1),
                r: 2.0, t: 1.2 + teleBuf, max: 1.2 + teleBuf, dmg: 46,
                sourceMeta: { attackerName: e.name, attackerKind: e.kind, skillName: '天劫三重雷域 (W20固定核心)', isBoss: true, isBossCore: true, isBossAux: false }
              });
            }
            const baseAng = Math.atan2(h.y - e.y, h.x - e.x);
            for (let k = 0; k < 6; k++) {
              const a = baseAng + (k - 2.5) * 0.28;
              pushProjectile({
                kind:'enemyShot', sx:e.x, sy:e.y, x:e.x, y:e.y,
                tx: clamp(e.x + Math.cos(a) * 8.0, 0.8, W-0.8),
                ty: clamp(e.y + Math.sin(a) * 8.0, 0.8, H-0.8),
                t:0, dur: 0.78, dmg: 32,
                sourceMeta: { attackerName: e.name, attackerKind: e.kind, skillName: '天劫扇形紫电弹幕 (W20固定核心)', isBoss: true, isBossCore: true, isBossAux: false }
              });
            }
            ctx.ports.vfx.addFloat(e.x, e.y - 0.7, '⚡ 天劫重雷降临！', '#ff70a8', true);
            for (let k = 0; k < 2; k++) {
              if (ctx.game.enemies.length >= MAX_ENEMIES) break;
              deps.damage.spawnEnemy('brute', 'west', scale, { x: clamp(e.x + (ctx.game.rnd()-0.5)*1.8, 0.8, W-0.8), y: clamp(e.y + (ctx.game.rnd()-0.5)*1.8, 0.8, H-0.8) });
            }
          } else if (e.kind === 'boss5') {
            // 玄冥妖皇 (W25): Expanding frost-fire shockwave + 8 aimed shots + 2 Shamans
            ctx.game.zones.push({
              kind:'bossWave', x: e.x, y: e.y, r: 6.4, t: 1.15 + teleBuf, max: 1.15 + teleBuf, dmg: 44, hitHero: false,
              sourceMeta: { attackerName: e.name, attackerKind: e.kind, skillName: '玄冥寒潮震波 (W25核心)', isBoss: true, isBossCore: true, isBossAux: false }
            });
            for (let k = 0; k < 8; k++) {
              const ang = (Math.PI * 2 * k) / 8 + ctx.game.waveClock;
              pushProjectile({
                kind:'enemyShot', sx:e.x, sy:e.y, x:e.x, y:e.y,
                tx: clamp(e.x + Math.cos(ang) * 8.2, 0.8, W-0.8),
                ty: clamp(e.y + Math.sin(ang) * 8.2, 0.8, H-0.8),
                t:0, dur: 0.80, dmg: 36,
                sourceMeta: { attackerName: e.name, attackerKind: e.kind, skillName: '玄冥寒炎齐射 (W25核心)', isBoss: true, isBossCore: true, isBossAux: false }
              });
            }
            ctx.ports.vfx.addFloat(e.x, e.y - 0.7, '❄️ 玄冥寒潮领域！', '#6ef0ff', true);
            for (let k = 0; k < 2; k++) {
              if (ctx.game.enemies.length >= MAX_ENEMIES) break;
              deps.damage.spawnEnemy('shaman', 'west', scale, { x: clamp(e.x + (ctx.game.rnd()-0.5)*2.0, 0.8, W-0.8), y: clamp(e.y + (ctx.game.rnd()-0.5)*2.0, 0.8, H-0.8) });
            }
          } else {
            // Stage 5: 深渊主宰 (W30 Boss 6) 3-Phase Core Attacks (opening -> mid_skirmish -> final_combo)
            const w30Cfg = BALANCE.w30Boss || {};
            e.bossTimer = e.finalPhaseEntered
              ? (w30Cfg.coreCooldownFinal || 3.4)
              : e.signatureTriggered
                ? (w30Cfg.coreCooldownMid || 4.4)
                : (w30Cfg.coreCooldownOpening || 5.2);
            const slamCount = e.finalPhaseEntered ? 4 : e.signatureTriggered ? 3 : 2;
            const orbCount = e.finalPhaseEntered ? 8 : e.signatureTriggered ? 6 : 5;
            for (let k = 0; k < slamCount; k++) {
              const ang = (Math.PI * 2 * k) / slamCount + ctx.game.rnd() * 0.5;
              const distOff = k === 0 ? 0 : 2.6;
              const dur = (e.finalPhaseEntered ? 1.18 : 1.28) + teleBuf;
              ctx.game.zones.push({
                kind: 'bossSlam',
                leaveLava: !!e.finalPhaseEntered,
                x: clamp(h.x + Math.cos(ang) * distOff, 1.2, W - 1.2),
                y: clamp(h.y + Math.sin(ang) * distOff, 1.2, H - 1.2),
                r: e.finalPhaseEntered ? 2.15 : 1.95,
                t: dur,
                max: dur,
                dmg: e.finalPhaseEntered ? 44 : 36,
                sourceMeta: { attackerName: e.name, attackerKind: e.kind, skillName: e.finalPhaseEntered ? '终末裂界重击 (W30核心)' : '深渊裂界重击 (W30核心)', isBoss: true, isBossCore: true, isBossAux: false }
              });
            }
            if (e.finalPhaseEntered) {
              ctx.game.zones.push({
                kind: 'w30RiftRing', x: e.x, y: e.y, r: 7.5, t: 1.25 + teleBuf, max: 1.25 + teleBuf, dmg: 38, hitHero: false,
                sourceMeta: { attackerName: e.name, attackerKind: e.kind, skillName: '终末扩散震荡波 (W30核心)', isBoss: true, isBossCore: true, isBossAux: false }
              });
            }
            const baseAng = Math.atan2(h.y - e.y, h.x - e.x);
            for (let k = 0; k < orbCount; k++) {
              const a = baseAng + (k - (orbCount - 1) / 2) * 0.24;
              pushProjectile({
                kind: 'enemyShot', sx: e.x, sy: e.y, x: e.x, y: e.y,
                tx: clamp(e.x + Math.cos(a) * 8.6, 0.8, W - 0.8),
                ty: clamp(e.y + Math.sin(a) * 8.6, 0.8, H - 0.8),
                t: 0, dur: 0.86, dmg: e.finalPhaseEntered ? 34 : 28,
                sourceMeta: { attackerName: e.name, attackerKind: e.kind, skillName: e.finalPhaseEntered ? '终末深渊弹幕 (W30核心)' : '深渊齐射弹幕 (W30核心)', isBoss: true, isBossCore: true, isBossAux: false }
              });
            }
            ctx.ports.vfx.addFloat(e.x, e.y - 0.75, e.finalPhaseEntered ? '👑 终末组合·深渊裂界！' : '👑 深渊主宰·裂界轰击！', '#ff80b5', true);
          }
        }
      }

      // Windup / Leap / Charge state machine (Wolf leap & Brute/Boss charge - UNSTOPPABLE!)
      if (e.aiState === 'windup') {
        e.aiTimer -= dt;
        if (e.aiTimer <= 0) {
          e.aiState = e.aiKind === 'leap' ? 'leap' : 'charge';
          e.aiTimer = e.aiState === 'leap' ? 0.30 : 0.48;
          e.slow = 0; e.slowT = 0; e.freezeT = 0;
        }
        continue;
      }
      if (e.aiState === 'leap' || e.aiState === 'charge') {
        e.aiTimer -= dt;
        const mult = e.aiState === 'leap' ? 3.1 : 3.6;
        e.x = clamp(e.x + e.aiVx * e.spd * mult * dt, 0.4, W - 0.4);
        e.y = clamp(e.y + e.aiVy * e.spd * mult * dt, 0.4, H - 0.4);
        if (dist(e, h) <= 0.65 + e.r && e.cd <= 0) {
          e.cd = 0.85;
          h.armorBreakT = 2.5;
          ctx.ports.vfx.addFloat(h.x, h.y - 0.65, '💔 破甲重创!', '#ff6b57', true);
          damageHero(Math.round(e.dmg * (e.aiState === 'charge' ? 1.50 : 1.25)), {
            attackerName: e.name || e.kind,
            attackerKind: e.kind,
            skillName: e.aiState === 'charge' ? '霸体冲锋破甲' : '飞扑突袭破甲',
            isBoss: !!e.boss,
            isBossCore: !!e.boss,
            isBossAux: false
          });
        }
        if (e.aiTimer <= 0) e.aiState = 'chase';
        continue;
      }

      // Trigger Wolf Leap or Brute Charge (clears slow/freeze & enters unstoppable windup!)
      if (e.leaper && e.aiCd <= 0 && dHero >= 2.0 && dHero <= 4.4) {
        e.aiCd = 3.2 + ctx.game.rnd() * 1.2;
        e.aiState = 'windup'; e.aiKind = 'leap'; e.aiTimer = 0.36;
        e.slow = 0; e.slowT = 0; e.freezeT = 0;
        const len = Math.max(0.01, dHero);
        e.aiVx = (h.x - e.x) / len; e.aiVy = (h.y - e.y) / len;
        continue;
      }
      if (e.charger && e.aiCd <= 0 && dHero >= 1.8 && dHero <= 5.5) {
        e.aiCd = 4.6 + ctx.game.rnd() * 1.2;
        e.aiState = 'windup'; e.aiKind = 'charge'; e.aiTimer = 0.55;
        e.slow = 0; e.slowT = 0; e.freezeT = 0;
        const len = Math.max(0.01, dHero);
        e.aiVx = (h.x - e.x) / len; e.aiVy = (h.y - e.y) / len;
        continue;
      }

      // Ranged Mage & Shaman standoff
      if ((e.ranged || e.shaman) && dHero <= e.range) {
        if (e.ranged && e.cd <= 0) {
          e.cd = 1.50;
          const baseAng = Math.atan2(h.y - e.y, h.x - e.x);
          const shots = ctx.game.wave >= 8 ? [-0.16, 0.16] : [0];
          for (const off of shots) {
            const a = baseAng + off;
            const tx = clamp(e.x + Math.cos(a) * Math.min(dHero + 0.6, e.range), 0.8, W - 0.8);
            const ty = clamp(e.y + Math.sin(a) * Math.min(dHero + 0.6, e.range), 0.8, H - 0.8);
            pushProjectile({
              kind:'enemyShot', sx:e.x, sy:e.y, x:e.x, y:e.y, tx, ty,
              t:0, dur: Math.max(0.42, dHero / 7.5), dmg: e.dmg,
              sourceMeta: { attackerName: e.name || '暗影法师', attackerKind: e.kind, skillName: '奥术弹幕', isBoss: false, isBossCore: false, isBossAux: false }
            });
          }
        }
        continue;
      }

      const hitDist = 0.62 + e.r;
      if (dHero <= hitDist) {
        if (e.cd <= 0) {
          const sourceMeta = {
            attackerName: e.name || e.kind,
            attackerKind: e.kind,
            skillName: e.kind === 'void_guard' ? '暗潮近卫突刺 (W30随机辅助)' : e.boss ? '首领近身重击' : '近身撞击',
            isBoss: !!e.boss,
            isBossCore: !!e.boss,
            isBossAux: e.kind === 'void_guard',
            auxKey: e.kind === 'void_guard' ? 'void_guards' : null,
            damageTuned: true
          };
          if (e.boss) {
            const windup = BALANCE.combat.bossMeleeWindup;
            e.cd = windup + 0.95;
            ctx.game.zones.push({
              kind: 'bossSlam', x: e.x, y: e.y, r: hitDist + 0.55,
              t: windup, max: windup, dmg: Math.round(e.dmg * BALANCE.combat.bossMeleeDamageMult), sourceMeta
            });
          } else {
            e.cd = 0.95;
            damageHero(e.dmg, sourceMeta);
          }
        }
        continue;
      }

      const auraSlow = (wfFrostAura && dHero <= 3.4) ? 0.22 : 0;
      const effSlow = (e.charger || e.isShrineBoss) ? Math.max(e.slow, auraSlow) * 0.40 : Math.max(e.slow, auraSlow);
      const frenzyBoost = e.frenzyT > 0 ? 1.35 : 1.0;
      const curSpd = e.spd * Math.max(0.25, 1 - effSlow) * frenzyBoost;
      const mx = (h.x - e.x) / Math.max(0.01, dHero);
      const my = (h.y - e.y) / Math.max(0.01, dHero);
      e.x = clamp(e.x + mx * curSpd * dt, 0.4, W - 0.4);
      e.y = clamp(e.y + my * curSpd * dt, 0.4, H - 0.4);
    }

    // Light separation
    for (let i = 0; i < ctx.game.enemies.length; i++) {
      const a = ctx.game.enemies[i];
      if (a.hp <= 0) continue;
      for (let j = i + 1; j < Math.min(ctx.game.enemies.length, i + 14); j++) {
        const b = ctx.game.enemies[j];
        if (b.hp <= 0) continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        const md = a.r + b.r;
        if (Math.abs(dx) >= md || Math.abs(dy) >= md) continue;
        const d = Math.hypot(dx, dy);
        if (d > 0.001 && d < md) {
          const push = (md - d) * 0.28;
          a.x -= dx / d * push; a.y -= dy / d * push;
          b.x += dx / d * push; b.y += dy / d * push;
        }
      }
    }
    ctx.game.enemies = ctx.game.enemies.filter(e => e.hp > 0);
  }

  return { pushProjectile, updateSeal, triggerSealOnHeroHit, pointToSegDist, updateProjectilesAndZones, updateEnemies };
}
