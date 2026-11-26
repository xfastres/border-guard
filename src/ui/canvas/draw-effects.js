import { clamp } from '../../core/math.js';
import { CELL } from '../../data/index.js';
import { withoutIcons } from '../shared/icons.js';
import { EFFECT_LIMITS } from '../vfx/battle-vfx.js';
import { drawAttackBody, polygon, traceBolt } from './spell-effects.js';

function isBossShieldLink(bolt) {
  return bolt.col === '#6ce2ff' || bolt.col === '#ff88dc';
}

export function createEffectsDrawer(runtimeCtx, { ctx, scene, visible = () => true, now = () => performance.now() }) {
  function drawZones(){
    const game = runtimeCtx.game;
    // Optional Blood Shrine (血煞妖碑)
    if (game.shrine && !game.shrine.cleared) {
      const s = game.shrine;
      const sx = s.x * CELL, sy = s.y * CELL, sr = s.r * CELL;
      ctx.save();
      ctx.beginPath(); ctx.arc(sx, sy, sr, 0, Math.PI * 2);
      ctx.fillStyle = s.active ? 'rgba(255,48,80,0.24)' : 'rgba(255,58,92,0.14)';
      ctx.fill();
      ctx.strokeStyle = s.active ? '#ff8096' : '#ff3b5c';
      ctx.lineWidth = 2.5;
      if (!s.active) ctx.setLineDash([6, 5]);
      ctx.stroke();
      ctx.setLineDash([]);
      if (!s.active && s.charge > 0) {
        ctx.beginPath();
        ctx.arc(sx, sy, sr * clamp(s.charge / 0.30, 0, 1), 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,70,100,0.35)'; ctx.fill();
      }
      ctx.font = '900 12px sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#ff9cb0';
      ctx.fillText(s.active ? '妖王试炼中' : '血煞妖碑 · 踩入挑战', sx, sy - sr - 6);
      ctx.restore();
    }

    for (const z of game.zones) {
      const zx = z.x * CELL, zy = z.y * CELL, zr = z.r * CELL;
      if (!visible(zx, zy, zr + 20)) continue;
      if (z.kind === 'lava' || z.kind === 'fireVortex') {
        ctx.beginPath(); ctx.arc(zx, zy, zr, 0, Math.PI * 2);
        ctx.fillStyle = z.kind === 'fireVortex'
          ? `rgba(255,120,40,${0.26 * (z.t / z.max)})`
          : `rgba(255,95,35,${0.25 * (z.t / z.max)})`;
        ctx.fill();
        ctx.strokeStyle = z.kind === 'fireVortex' ? '#f7ac5b8c' : '#ec743b75';
        ctx.lineWidth = z.kind === 'fireVortex' ? 2 : 1.25;
        ctx.stroke();
        if (scene?.limits.glow) {
          ctx.beginPath();
          ctx.ellipse(zx, zy, zr * .75, zr * .42, .45, .4, 4.5);
          ctx.strokeStyle = '#6a3128a0'; ctx.lineWidth = 2; ctx.stroke();
        }
      } else if (z.kind === 'frostVortex' || z.kind === 'frostTrail') {
        ctx.beginPath(); ctx.arc(zx, zy, zr, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(108,226,255,${0.22 * (z.t / z.max)})`; ctx.fill();
        ctx.strokeStyle = '#9de5f99e'; ctx.lineWidth = 1.6; ctx.stroke();
        if (scene?.quality !== 'off') {
          ctx.beginPath(); polygon(ctx, zx, zy, zr * .84, 6, z.t * .42); ctx.stroke();
          ctx.beginPath(); ctx.ellipse(zx, zy - 4, zr * .82, zr * .36, -.31, 0, Math.PI * 2);
          ctx.fillStyle = '#ccf7ff1c'; ctx.fill();
        }
      } else if (z.kind === 'thunderField') {
        ctx.beginPath(); ctx.arc(zx, zy, zr, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(198,136,255,${0.22 * (z.t / z.max)})`; ctx.fill();
        ctx.strokeStyle = 'rgba(216,166,255,0.5)'; ctx.lineWidth = 1.8; ctx.stroke();
      } else if (z.kind === 'enemyLava') {
        ctx.beginPath(); ctx.arc(zx, zy, zr, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,55,30,${0.28 * (z.t / z.max)})`; ctx.fill();
        ctx.strokeStyle = 'rgba(255,110,60,0.45)'; ctx.lineWidth = 1.5; ctx.stroke();
      } else if (z.kind === 'poisonPool') {
        ctx.beginPath(); ctx.arc(zx, zy, zr, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(60,245,135,${0.22 * (z.t / z.max)})`; ctx.fill();
        ctx.strokeStyle = 'rgba(82,255,154,0.45)'; ctx.lineWidth = 1.5; ctx.stroke();
      } else if (z.kind === 'poisonBomb') {
        const prog = 1 - z.t / z.max;
        ctx.beginPath(); ctx.arc(zx, zy, zr, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(82,255,154,0.14)'; ctx.fill();
        ctx.strokeStyle = '#52ff9a'; ctx.lineWidth = 2; ctx.stroke();
        ctx.beginPath(); ctx.arc(zx, zy, zr * prog, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(82,255,154,0.30)'; ctx.fill();
      } else if (z.kind === 'bossWave') {
        const prog = 1 - z.t / z.max;
        ctx.beginPath(); ctx.arc(zx, zy, Math.max(6, zr * prog), 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255,90,65,${1 - prog * 0.4})`; ctx.lineWidth = 6; ctx.stroke();
      } else if (z.kind === 'bossSlam') {
        const prog = 1 - z.t / z.max;
        ctx.beginPath(); ctx.arc(zx, zy, zr, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,55,40,0.16)'; ctx.fill();
        ctx.strokeStyle = '#ff5642'; ctx.lineWidth = 2.5; ctx.stroke();
        ctx.beginPath(); ctx.arc(zx, zy, zr * prog, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,70,50,0.28)'; ctx.fill();
      }
    }
  }

  function drawProjectilesBeamsBolts(){
    const game = runtimeCtx.game;
    const limits = scene?.limits || EFFECT_LIMITS.high;
    const time = now();
    for (const p of game.projectiles) {
      const px = p.x * CELL, py = p.y * CELL;
      if (p.kind === 'enemyShot') {
        const tx = p.tx * CELL, ty = p.ty * CELL;
        if (visible(tx, ty, 12)) {
          ctx.beginPath(); ctx.arc(tx, ty, 8, 0, Math.PI * 2);
          ctx.strokeStyle = '#ff83bb76'; ctx.lineWidth = 1.5; ctx.stroke();
        }
        if (!visible(px, py, 15)) continue;
        ctx.beginPath(); polygon(ctx, px, py, 6, 4);
        ctx.fillStyle = '#e8579c'; ctx.fill();
        ctx.strokeStyle = '#ffdae9'; ctx.lineWidth = 1.2; ctx.stroke();
      } else if (visible(px, py, 40)) drawAttackBody(ctx, p, game, scene);
    }
    const beams = game.beams;
    for (let i = Math.max(0, beams.length - limits.beams); i < beams.length; i++) {
      const b = beams[i];
      const alpha = b.t / b.max;
      ctx.save();
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(b.x1 * CELL, b.y1 * CELL); ctx.lineTo(b.x2 * CELL, b.y2 * CELL);
      ctx.strokeStyle = b.col || '#f6cb75'; ctx.globalAlpha = alpha * (limits.glow ? .32 : .6);
      ctx.lineWidth = Math.max(1, b.w * alpha * 1.6); ctx.stroke();
      if (limits.glow) {
        ctx.strokeStyle = '#fff8de'; ctx.globalAlpha = alpha;
        ctx.lineWidth = Math.max(1.6, b.w * .40 * alpha); ctx.stroke();
      }
      ctx.restore();
    }
    const bolts = game.bolts;
    // Keep the boss shield source identifiable even when a lightning build saturates the effect budget.
    const shieldCap = Math.min(4, limits.bolts);
    let shieldLinks = 0;
    for (let i = bolts.length - 1; i >= 0 && shieldLinks < shieldCap; i--) {
      if (!isBossShieldLink(bolts[i])) continue;
      drawBolt(bolts[i], time + i * 41, limits, true);
      shieldLinks++;
    }
    let remaining = limits.bolts - shieldLinks;
    for (let i = bolts.length - 1; i >= 0 && remaining > 0; i--) {
      if (isBossShieldLink(bolts[i])) continue;
      drawBolt(bolts[i], time + i * 41, limits, false);
      remaining--;
    }
  }

  function drawBolt(bolt, time, limits, bossLink) {
    const point = bolt.pts.at(-1);
    if (!point) return;
    const alpha = bolt.t / bolt.max;
    ctx.save();
    traceBolt(ctx, bolt.pts, time, !bossLink && scene?.quality !== 'off');
    ctx.strokeStyle = bossLink ? bolt.col : bolt.comboThunderFire ? '#ff9f56' : '#8d9cff';
    ctx.globalAlpha = alpha * (bossLink ? .8 : .48);
    ctx.lineWidth = limits.glow ? 8 : 4;
    ctx.stroke();
    ctx.strokeStyle = '#eff4ff'; ctx.globalAlpha = alpha;
    ctx.lineWidth = 1.65; ctx.stroke();
    if (limits.glow) {
      const x = point.x * CELL, y = point.y * CELL;
      ctx.beginPath(); polygon(ctx, x, y, 11 + 7 * (1 - alpha), 6, .2);
      ctx.globalAlpha = alpha * .47;
      ctx.strokeStyle = '#a09bf3'; ctx.lineWidth = 1; ctx.stroke();
    }
    ctx.restore();
  }

  function drawRingsAndFloats(){
    const game = runtimeCtx.game;
    const limits = scene?.limits || EFFECT_LIMITS.high;
    for (let i = Math.max(0, game.rings.length - limits.rings); i < game.rings.length; i++) {
      const r = game.rings[i];
      if (!visible(r.x * CELL, r.y * CELL, r.r * CELL)) continue;
      const u = 1 - r.t / r.max;
      ctx.beginPath();
      ctx.arc(r.x * CELL, r.y * CELL, Math.max(4, r.r * CELL * (0.28 + 0.72 * u)), 0, Math.PI * 2);
      ctx.strokeStyle = r.col;
      ctx.globalAlpha = 1 - u;
      ctx.lineWidth = 3 * (1 - u * 0.5);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.textAlign = 'center';
    for (let i = Math.max(0, game.floats.length - limits.labels); i < game.floats.length; i++) {
      const f = game.floats[i];
      if (!visible(f.x * CELL, f.y * CELL, 26)) continue;
      const alpha = clamp(f.t / f.max * 1.4, 0, 1);
      const crit = /^\d+!$|斩杀/u.test(f.txt);
      const dx = crit && scene?.limits.glow ? Math.sin(f.t * 38) * 2.5 : 0;
      const text = withoutIcons(f.txt);
      const x = f.x * CELL + dx, y = f.y * CELL;
      ctx.globalAlpha = alpha;
      ctx.font = crit ? '900 22px sans-serif' : f.big ? '900 15px sans-serif' : '800 12px sans-serif';
      ctx.fillStyle = '#000';
      ctx.fillText(text, x + 1, y + 1);
      ctx.fillStyle = f.col;
      ctx.fillText(text, x, y);
    }
    ctx.globalAlpha = 1;
  }

  return { drawZones, drawProjectilesBeamsBolts, drawRingsAndFloats };
}
