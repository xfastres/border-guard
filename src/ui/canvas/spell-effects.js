import { CELL } from '../../data/index.js';
import { EFFECT_STYLE, effectTier } from '../vfx/battle-vfx.js';

const TAU = Math.PI * 2;

export function polygon(ctx, x, y, size, sides, angle = 0) {
  for (let i = 0; i < sides; i++) {
    const a = angle + TAU * i / sides;
    const px = x + Math.cos(a) * size, py = y + Math.sin(a) * size;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function spokes(ctx, x, y, radius, n, angle, scale = .82) {
  for (let i = 0; i < n; i++) {
    const a = angle + i * TAU / n;
    const dx = Math.cos(a) * radius, dy = Math.sin(a) * radius;
    ctx.moveTo(x + dx * scale, y + dy * scale);
    ctx.lineTo(x + dx, y + dy);
  }
}

function traceStamp(ctx, e, r, u) {
  const { kind, x, y, angle } = e;
  ctx.beginPath();
  if (kind === 'frost' || kind === 'ward') {
    polygon(ctx, x, y, r, 6, angle);
    spokes(ctx, x, y, r * 1.12, 6, angle, .58);
  } else if (kind === 'stone') {
    polygon(ctx, x, y, r, 8, angle);
    spokes(ctx, x, y, r * 1.28, 8, angle, .61);
  } else if (kind === 'holy' || kind === 'boss') {
    ctx.arc(x, y, r, 0, TAU);
    spokes(ctx, x, y, r * 1.11, kind === 'boss' ? 12 : 8, angle);
    polygon(ctx, x, y, r * .85, 4, Math.PI / 4 + u * .36);
  } else if (kind === 'thunder') {
    for (let i = 0; i < 9; i++) {
      const a = angle + i * TAU / 9;
      const x1 = Math.cos(a), y1 = Math.sin(a);
      ctx.moveTo(x + x1 * r * .43, y + y1 * r * .43);
      ctx.lineTo(x + (x1 * .74 - y1 * .12) * r, y + (y1 * .74 + x1 * .12) * r);
      ctx.lineTo(x + x1 * r, y + y1 * r);
    }
  } else if (kind === 'wind' || kind === 'blades' || kind === 'lance') {
    for (let i = 0; i < 3; i++) {
      const a = angle + i * TAU / 3 + u * 1.6;
      ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
      ctx.arc(x, y, r, a, a + .82);
    }
  } else {
    ctx.arc(x, y, r, 0, TAU);
    ctx.moveTo(x + r * .72, y);
    ctx.arc(x, y, r * .72, 0, TAU);
  }
}

export function drawSpellSurface(ctx, scene, visible) {
  const cap = scene.limits;
  if (!cap.stamps) return;
  ctx.save();
  for (let i = 0; i < cap.stamps; i++) {
    const e = scene.stamps[i];
    if (e.time <= 0 || !visible(e.x, e.y, e.radius * 1.4)) continue;
    const u = 1 - e.time / e.max;
    const style = EFFECT_STYLE[e.kind];
    const r = e.radius * (.34 + .66 * u);
    traceStamp(ctx, e, r, u);
    if (cap.glow) {
      ctx.globalAlpha = (1 - u) * .18;
      ctx.strokeStyle = style.color; ctx.lineWidth = 7 + e.tier * 3; ctx.stroke();
    }
    ctx.globalAlpha = (1 - u) * .89;
    ctx.strokeStyle = style.core; ctx.lineWidth = 1 + .55 * e.tier; ctx.stroke();
    if (e.tier) {
      ctx.beginPath();
      polygon(ctx, e.x, e.y, r * 1.15, e.kind === 'frost' ? 6 : 8, e.angle - u);
      ctx.globalAlpha *= e.tier === 1 ? .41 : .65;
      ctx.strokeStyle = style.color; ctx.lineWidth = 1.2; ctx.stroke();
    }
    if (e.tier === 2 && cap.glow) {
      ctx.beginPath();
      spokes(ctx, e.x, e.y, r * 1.23, 12, u + e.angle, .95);
      ctx.stroke();
    }
    if (e.kind === 'blood' && e.toX !== null) {
      const tx = e.toX, ty = e.toY;
      const dx = tx - e.x, dy = ty - e.y;
      ctx.beginPath(); ctx.moveTo(e.x, e.y);
      ctx.quadraticCurveTo(e.x + dx * .45 - dy * .2, e.y + dy * .45 + dx * .2, tx, ty);
      ctx.strokeStyle = style.color; ctx.lineWidth = 3.2; ctx.globalAlpha = (1 - u) * .82; ctx.stroke();
      ctx.strokeStyle = style.core; ctx.lineWidth = 1.1; ctx.stroke();
    }
  }
  ctx.restore();
}

export function drawSpellParticles(ctx, scene, visible) {
  const cap = scene.limits;
  if (!cap.particles) return;
  ctx.save();
  for (let i = 0; i < cap.particles; i++) {
    const p = scene.particles[i];
    if (p.time <= 0 || !visible(p.x, p.y, 18)) continue;
    const style = EFFECT_STYLE[p.kind];
    const u = p.time / p.max;
    ctx.globalAlpha = u * .76;
    ctx.fillStyle = u > .65 ? style.core : style.color;
    ctx.strokeStyle = style.color;
    ctx.beginPath();
    if (p.kind === 'frost' || p.kind === 'holy' || p.kind === 'stone') {
      polygon(ctx, p.x, p.y, p.size * u, p.kind === 'stone' ? 3 : 4, p.time * 6);
      ctx.fill();
    } else {
      ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * .07 * u, p.y - p.vy * .07 * u);
      ctx.lineWidth = p.size * u;
      ctx.stroke();
    }
  }
  for (let i = 0; i < cap.stamps; i++) {
    const e = scene.stamps[i];
    if (e.time <= 0 || !e.label || !visible(e.x, e.y, 38)) continue;
    const u = e.time / e.max;
    ctx.globalAlpha = u;
    ctx.font = '700 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = e.kind === 'blood' ? '#f4a2b6' : '#ace7ff';
    ctx.fillText(e.label, e.toX ?? e.x, (e.toY ?? e.y) - 24 - (1 - u) * 16);
  }
  ctx.restore();
}

export function drawAfterimages(ctx, scene) {
  const cap = scene.limits;
  if (!cap.trails) return;
  ctx.save();
  for (let i = 0; i < cap.trails; i++) {
    const t = scene.trails[i];
    if (t.time <= 0) continue;
    const u = t.time / t.max;
    ctx.save(); ctx.translate(t.x, t.y); ctx.rotate(t.angle);
    ctx.globalAlpha = u * (t.kind === 'lance' ? .19 : .39);
    ctx.fillStyle = EFFECT_STYLE[t.kind].color;
    ctx.beginPath();
    ctx.moveTo(8, 0); ctx.quadraticCurveTo(2, -9, -5, -6);
    ctx.lineTo(-19 * u, 0); ctx.lineTo(-5, 6); ctx.quadraticCurveTo(2, 9, 8, 0);
    ctx.fill();
    if (t.kind === 'fire') {
      ctx.fillStyle = EFFECT_STYLE.fire.core;
      ctx.fillRect(-16 * u, -1, 19 * u, 2);
    }
    ctx.restore();
  }
  ctx.restore();
}

export function drawAttackBody(ctx, p, game, scene) {
  const x = p.x * CELL, y = p.y * CELL;
  const branch = p.w10Branch || '';
  const velocity = p.vx || p.vy ? Math.atan2(p.vy, p.vx)
    : Math.atan2((p.ty || p.y) - (p.sy || p.y), (p.tx || p.x) - (p.sx || p.x));
  const kind = p.comboStyle === 'wanjian' ? 'blades' : branch.startsWith('bk_') ? 'blood'
    : p.kind === 'firewave' || p.kind === 'fireball' ? 'fire' : p.kind === 'frostball' || branch.startsWith('nv_') || branch.includes('frost') ? 'frost'
      : branch.startsWith('th_') ? 'thunder' : p.opts?.skillKey === 'swordlance' ? 'lance' : p.opts?.isWind ? 'wind' : 'blades';
  const style = EFFECT_STYLE[kind];
  const tier = effectTier(game, kind);
  const heavy = scene?.limits.glow;
  const tail = scene?.quality === 'off' ? 7 : 14 + tier * 10;
  ctx.save();
  ctx.translate(x, y); ctx.rotate(velocity);
  ctx.beginPath();
  if (kind === 'fire' || kind === 'blood') {
    ctx.moveTo(-tail, 0); ctx.quadraticCurveTo(2, -3, 3, -11);
    ctx.quadraticCurveTo(25, 0, 3, 11);
    ctx.quadraticCurveTo(2, 3, -tail, 0); ctx.closePath();
  } else if (kind === 'frost' || kind === 'thunder') {
    polygon(ctx, 0, 0, kind === 'frost' ? 8 : 6.5, kind === 'frost' ? 6 : 4);
    ctx.moveTo(-3, 2); ctx.lineTo(-tail, 4); ctx.lineTo(-7, -2);
  } else {
    ctx.moveTo(13, 0); ctx.lineTo(1, 3.6); ctx.quadraticCurveTo(-tail * .45, 5, -tail, 0);
    ctx.quadraticCurveTo(-tail * .25, -.4, 1, -3.6); ctx.closePath();
  }
  ctx.fillStyle = style.color; ctx.globalAlpha = .73; ctx.fill();
  if (heavy) {
    ctx.globalAlpha = .22; ctx.strokeStyle = style.color; ctx.lineWidth = 7 + tier * 2; ctx.stroke();
  }
  ctx.globalAlpha = .96;
  ctx.beginPath(); ctx.moveTo(-tail * .38, 0); ctx.lineTo(kind === 'fire' ? 13 : 10, 0);
  ctx.strokeStyle = style.core; ctx.lineWidth = 1.8 + tier * .35; ctx.stroke();
  if (tier === 2 && heavy) {
    ctx.beginPath(); ctx.moveTo(-7, -6); ctx.lineTo(1, -3); ctx.moveTo(-7, 6); ctx.lineTo(1, 3);
    ctx.strokeStyle = style.color; ctx.stroke();
  }
  ctx.restore();
}

export function traceBolt(ctx, points, now, detailed) {
  ctx.beginPath();
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const x = p.x * CELL, y = p.y * CELL;
    if (i === 0) { ctx.moveTo(x, y); continue; }
    if (detailed) {
      const a = points[i - 1], dx = x - a.x * CELL, dy = y - a.y * CELL;
      const n = Math.max(1, Math.hypot(dx, dy));
      for (let j = 1; j < 6; j++) {
        const jitter = Math.sin(now * .08 + i * 12.2 + j * 5.19) * (j % 2 ? 9 : 6);
        ctx.lineTo(a.x * CELL + dx * j / 6 - dy * jitter / n, a.y * CELL + dy * j / 6 + dx * jitter / n);
      }
    }
    ctx.lineTo(x, y);
  }
}
