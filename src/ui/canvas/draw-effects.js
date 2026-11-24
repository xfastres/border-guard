import { clamp } from '../../core/math.js';
import { CELL } from '../../data/index.js';

export function createEffectsDrawer(runtimeCtx, { ctx }) {
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
      ctx.fillText(s.active ? '🩸妖王试炼中' : '🩸血煞妖碑(踩入挑战)', sx, sy - sr - 6);
      ctx.restore();
    }

    for (const z of game.zones) {
      const zx = z.x * CELL, zy = z.y * CELL, zr = z.r * CELL;
      if (z.kind === 'lava' || z.kind === 'fireVortex') {
        ctx.beginPath(); ctx.arc(zx, zy, zr, 0, Math.PI * 2);
        ctx.fillStyle = z.kind === 'fireVortex'
          ? `rgba(255,120,40,${0.26 * (z.t / z.max)})`
          : `rgba(255,95,35,${0.25 * (z.t / z.max)})`;
        ctx.fill();
        if (z.kind === 'fireVortex') {
          ctx.strokeStyle = 'rgba(255,190,85,0.65)'; ctx.lineWidth = 2; ctx.stroke();
        }
      } else if (z.kind === 'frostVortex' || z.kind === 'frostTrail') {
        ctx.beginPath(); ctx.arc(zx, zy, zr, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(108,226,255,${0.22 * (z.t / z.max)})`; ctx.fill();
        ctx.strokeStyle = 'rgba(142,244,255,0.45)'; ctx.lineWidth = 1.6; ctx.stroke();
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
    for (const p of game.projectiles) {
      const px = p.x * CELL, py = p.y * CELL;
      if (p.kind === 'firewave') {
        const a = Math.atan2(p.vy, p.vx);
        ctx.save(); ctx.translate(px, py); ctx.rotate(a);
        if (p.comboStyle === 'wanjian') {
          ctx.beginPath();
          ctx.moveTo(20, 0); ctx.lineTo(-2, -6); ctx.lineTo(-6, -2); ctx.lineTo(-16, -2);
          ctx.lineTo(-16, 2); ctx.lineTo(-6, 2); ctx.lineTo(-2, 6); ctx.closePath();
          ctx.fillStyle = '#ffe878'; ctx.fill();
          ctx.strokeStyle = '#8ef8ff'; ctx.lineWidth = 2; ctx.stroke();
          ctx.beginPath(); ctx.moveTo(-6, -8); ctx.lineTo(-6, 8);
          ctx.strokeStyle = '#ffd24c'; ctx.lineWidth = 2.5; ctx.stroke();
        } else {
          ctx.beginPath(); ctx.arc(0, 0, 14, -1.1, 1.1);
          ctx.strokeStyle = p.isThunderFireCombo ? '#d284ff' : (p.w10Branch ? '#ff542e' : '#ff8c42'); ctx.lineWidth = 5.5; ctx.stroke();
          ctx.strokeStyle = p.isThunderFireCombo ? '#ffe878' : '#fff0a0'; ctx.lineWidth = 2; ctx.stroke();
          if (p.isThunderFireCombo) {
            ctx.beginPath(); ctx.moveTo(-4, -12); ctx.lineTo(4, -4); ctx.lineTo(-3, 4); ctx.lineTo(5, 12);
            ctx.strokeStyle = '#ffe878'; ctx.lineWidth = 1.8; ctx.stroke();
          }
        }
        ctx.restore();
      } else if (p.kind === 'arrow') {
        const a = Math.atan2(p.vy, p.vx);
        ctx.save(); ctx.translate(px, py); ctx.rotate(a);
        ctx.strokeStyle = p.w10Branch ? '#8cf0ff' : '#8ef8c6'; ctx.lineWidth = 2.8;
        ctx.beginPath(); ctx.moveTo(-7, 0); ctx.lineTo(7, 0); ctx.stroke();
        ctx.restore();
      } else if (p.kind === 'fireball') {
        ctx.beginPath(); ctx.arc(px, py, 6.5, 0, Math.PI * 2);
        ctx.fillStyle = '#ff7b38'; ctx.fill();
        ctx.strokeStyle = '#fff09c'; ctx.lineWidth = 1.6; ctx.stroke();
      } else if (p.kind === 'frostball') {
        ctx.beginPath(); ctx.arc(px, py, 5.5, 0, Math.PI * 2);
        ctx.fillStyle = '#7beeff'; ctx.fill();
      } else if (p.kind === 'enemyShot') {
        ctx.beginPath(); ctx.arc(p.tx * CELL, p.ty * CELL, 8, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,102,196,0.35)'; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.beginPath(); ctx.arc(px, py, 5.2, 0, Math.PI * 2);
        ctx.fillStyle = '#ff66c4'; ctx.fill();
        ctx.strokeStyle = '#ffd6f0'; ctx.lineWidth = 1.2; ctx.stroke();
      }
    }
    for (const b of game.beams) {
      const alpha = b.t / b.max;
      ctx.save();
      ctx.strokeStyle = b.col || `rgba(255,232,120,${alpha})`;
      ctx.globalAlpha = b.col ? alpha : 1;
      ctx.lineWidth = b.w * alpha;
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(b.x1 * CELL, b.y1 * CELL); ctx.lineTo(b.x2 * CELL, b.y2 * CELL); ctx.stroke();
      ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
      ctx.lineWidth = Math.max(1.5, b.w * 0.35 * alpha);
      ctx.stroke();
      ctx.restore();
    }
    for (const l of game.bolts) {
      const alpha = l.t / l.max;
      ctx.save();
      ctx.strokeStyle = l.col;
      ctx.globalAlpha = alpha;
      ctx.lineWidth = l.comboThunderFire ? 5 : 3;
      ctx.beginPath();
      l.pts.forEach((pt, i) => {
        const lx = pt.x * CELL + (i > 0 ? (Math.random()-0.5)*7 : 0);
        const ly = pt.y * CELL + (i > 0 ? (Math.random()-0.5)*7 : 0);
        if (i === 0) ctx.moveTo(lx, ly); else ctx.lineTo(lx, ly);
      });
      ctx.stroke();
      if (l.comboThunderFire) {
        ctx.strokeStyle = '#ffe878';
        ctx.lineWidth = 1.6;
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  function drawRingsAndFloats(){
    const game = runtimeCtx.game;
    for (const r of game.rings) {
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
    for (const f of game.floats) {
      const alpha = clamp(f.t / f.max * 1.4, 0, 1);
      ctx.globalAlpha = alpha;
      ctx.font = f.big ? '900 15px sans-serif' : '800 12px sans-serif';
      ctx.fillStyle = '#000';
      ctx.fillText(f.txt, f.x * CELL + 1, f.y * CELL + 1);
      ctx.fillStyle = f.col;
      ctx.fillText(f.txt, f.x * CELL, f.y * CELL);
    }
    ctx.globalAlpha = 1;
  }

  return { drawZones, drawProjectilesBeamsBolts, drawRingsAndFloats };
}
