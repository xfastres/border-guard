import { clamp } from '../../core/math.js';
import { hasCombo, perkLv } from '../../core/state-queries.js';
import { CELL, ELEMENTS } from '../../data/index.js';

export function createEntitiesDrawer(runtimeCtx, { ctx, hero, unlock, combat }) {
  const { getHeroStats, hasDualRes } = hero;
  const { getRealm } = unlock;
  const { isEnemyUnstoppable } = combat;

  function drawArtifacts(){
    const game = runtimeCtx.game;
    const h = game.hero;
    const hx = h.x * CELL, hy = h.y * CELL;
    const inCombat = game.phase === 'wave' && game.enemies.length > 0;

    // Frost Domain perk aura ring + Dual Wind+Frost Aura
    const fdLv = perkLv(game, 'frost_domain');
    if (fdLv > 0 && inCombat) {
      const rad = (fdLv >= 2 ? 4.5 : 3.2) * CELL;
      ctx.save();
      ctx.beginPath(); ctx.arc(hx, hy, rad, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(108,226,255,0.06)'; ctx.fill();
      ctx.strokeStyle = 'rgba(108,226,255,0.32)'; ctx.lineWidth = 1.6;
      ctx.setLineDash([6, 6]); ctx.stroke();
      ctx.restore();
    }
    if (hasDualRes('wind_frost') && inCombat) {
      ctx.save();
      ctx.beginPath(); ctx.arc(hx, hy, 3.4 * CELL, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(132,255,216,0.26)'; ctx.lineWidth = 1.8;
      ctx.setLineDash([10, 6]); ctx.stroke();
      ctx.restore();
    }

    // Subtle Realm + Active Seal halo under Hero (no cluttered orbiting balls!)
    const rCol = getRealm(h.realm).col;
    if (h.realm > 0 || (inCombat && game.seal)) {
      const col = (inCombat && game.seal) ? ELEMENTS[game.seal.elem].color : rCol;
      ctx.save();
      ctx.beginPath();
      ctx.arc(hx, hy, 22 + h.realm * 2 + Math.sin(performance.now() / 160) * 2, 0, Math.PI * 2);
      ctx.strokeStyle = col;
      ctx.globalAlpha = inCombat ? 0.44 : 0.28;
      ctx.lineWidth = 2.2 + h.realm * 0.35;
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawHero(){
    const game = runtimeCtx.game;
    const h = game.hero;
    const hx = h.x * CELL, hy = h.y * CELL;
    const hs = getHeroStats();
    const rSpec = getRealm(h.realm);

    // Overdrive golden aura
    if (h.ultTimer > 0) {
      ctx.beginPath();
      ctx.arc(hx, hy, 30 + Math.sin(performance.now()/80)*4, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,220,90,0.22)'; ctx.fill();
      ctx.strokeStyle = '#ffe878'; ctx.lineWidth = 2; ctx.stroke();
    }

    // Orbiting Blades (旋风飞刃: tightened radius matching combat collision!) + Combo Array Auras
    const bLv = h.skills.blades || 0;
    const hasWanjian = hasCombo(game, 'wanjian');
    const hasIceBlades = hasCombo(game, 'ice_blades');
    if (hasWanjian) {
      const rot = performance.now() / 650;
      ctx.save();
      ctx.translate(hx, hy); ctx.rotate(rot);
      ctx.beginPath(); ctx.arc(0, 0, 1.35 * CELL, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,228,120,0.45)'; ctx.lineWidth = 2; ctx.setLineDash([7, 5]); ctx.stroke();
      ctx.setLineDash([]);
      for (let k = 0; k < 8; k++) {
        const a = (Math.PI * 2 * k) / 8;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * 1.15 * CELL, Math.sin(a) * 1.15 * CELL);
        ctx.lineTo(Math.cos(a) * 1.48 * CELL, Math.sin(a) * 1.48 * CELL);
        ctx.strokeStyle = 'rgba(255,240,160,0.62)'; ctx.lineWidth = 2; ctx.stroke();
      }
      ctx.restore();
    }
    if (bLv > 0 && game.phase === 'wave' && game.enemies.length > 0) {
      const count = bLv + 1;
      const orbitR = (1.65 + bLv * 0.10) * hs.skillRangeMult * CELL;
      ctx.beginPath();
      ctx.arc(hx, hy, orbitR, 0, Math.PI * 2);
      ctx.strokeStyle = hasIceBlades ? 'rgba(130,245,255,0.42)' : 'rgba(142,244,255,0.12)';
      ctx.lineWidth = hasIceBlades ? 2.4 : 1.5;
      ctx.stroke();
      if (hasIceBlades) {
        ctx.save();
        ctx.translate(hx, hy); ctx.rotate(-h.bladeAngle * 0.5);
        for (let t = 0; t < 2; t++) {
          ctx.beginPath();
          for (let p = 0; p < 3; p++) {
            const a = (Math.PI * 2 * p) / 3 + t * Math.PI;
            const x = Math.cos(a) * orbitR * 0.92, y = Math.sin(a) * orbitR * 0.92;
            if (p === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          }
          ctx.closePath();
          ctx.strokeStyle = 'rgba(160,248,255,0.22)'; ctx.lineWidth = 1.6; ctx.stroke();
        }
        ctx.restore();
      }
      for (let i = 0; i < count; i++) {
        const ang = h.bladeAngle + (Math.PI * 2 * i) / count;
        const bx = hx + Math.cos(ang) * orbitR;
        const by = hy + Math.sin(ang) * orbitR;
        ctx.save();
        ctx.translate(bx, by);
        ctx.rotate(ang + Math.PI / 2);
        const bScale = hasIceBlades ? 1.32 : 1.0;
        ctx.beginPath();
        ctx.moveTo(0, -12 * bScale); ctx.lineTo(5.5 * bScale, 6 * bScale); ctx.lineTo(0, 3 * bScale); ctx.lineTo(-5.5 * bScale, 6 * bScale); ctx.closePath();
        ctx.fillStyle = hasIceBlades ? '#b6f8ff' : hasWanjian ? '#ffe888' : '#8ef4ff'; ctx.fill();
        ctx.strokeStyle = hasIceBlades ? '#52d6ff' : '#ffffff'; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.restore();
      }
    }

    // Hero Body (size & rim glow scale with Cultivation Realm!)
    const bodyR = 14 + h.realm * 0.8;
    ctx.beginPath();
    ctx.arc(hx, hy, bodyR, 0, Math.PI * 2);
    ctx.fillStyle = h.invuln > 0 ? '#ffffff' : '#2a8fff';
    ctx.fill();
    ctx.strokeStyle = (h.armorBreakT || 0) > 0 ? '#ff6b57' : h.shield > 0 ? '#8ef5ff' : rSpec.col;
    ctx.lineWidth = (h.armorBreakT || 0) > 0 ? 4 : 3;
    ctx.stroke();
    // Crown / realm crest
    ctx.fillStyle = rSpec.col;
    ctx.beginPath();
    ctx.moveTo(hx - 7, hy - 9); ctx.lineTo(hx - 4, hy - 16); ctx.lineTo(hx, hy - 11);
    ctx.lineTo(hx + 4, hy - 16); ctx.lineTo(hx + 7, hy - 9); ctx.closePath();
    ctx.fill();

    // HP Bar (Sole Lifeline!)
    const r = clamp(h.hp / h.maxHp, 0, 1);
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillRect(hx - 18, hy - 25, 36, 6);
    ctx.fillStyle = r < 0.35 ? '#ff6250' : '#6cf29c';
    ctx.fillRect(hx - 17, hy - 24, 34 * r, 4);
  }

  function drawEnemies(){
    const game = runtimeCtx.game;
    for (const e of game.enemies) {
      const ex = e.x * CELL, ey = e.y * CELL;
      const rad = e.r * CELL;

      // Telegraph leap / charge corridor during windup
      if (e.aiState === 'windup') {
        const lineLen = (e.aiKind === 'leap' ? 3.2 : 4.6) * CELL;
        ctx.save();
        ctx.strokeStyle = 'rgba(255,70,56,0.72)';
        ctx.lineWidth = e.boss ? 16 : 8;
        ctx.setLineDash([8, 6]);
        ctx.beginPath();
        ctx.moveTo(ex, ey);
        ctx.lineTo(ex + e.aiVx * lineLen, ey + e.aiVy * lineLen);
        ctx.stroke();
        ctx.restore();
      }

      // Unstoppable Gold-Crimson Aura during windup/leap/charge!
      if (isEnemyUnstoppable(e)) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(ex, ey, rad + 7, 0, Math.PI * 2);
        ctx.strokeStyle = '#ffcc4d'; ctx.lineWidth = 2.8; ctx.stroke();
        ctx.beginPath();
        ctx.arc(ex, ey, rad + 10, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,82,66,0.65)'; ctx.lineWidth = 1.8; ctx.stroke();
        ctx.font = '900 10px sans-serif'; ctx.textAlign = 'center';
        ctx.fillStyle = '#ffdf6e';
        ctx.fillText('🛡️霸体', ex, ey - rad - 16);
        ctx.restore();
      }
      if (e.elite || e.boss || e.frenzyT > 0) {
        ctx.beginPath();
        ctx.arc(ex, ey, rad + 6, 0, Math.PI * 2);
        ctx.fillStyle = e.boss ? 'rgba(255,65,50,0.22)' : e.isShrineBoss ? 'rgba(255,59,92,0.28)' : e.elite ? 'rgba(190,102,255,0.22)' : 'rgba(255,159,67,0.20)';
        ctx.fill();
      }
      ctx.beginPath();
      ctx.arc(ex, ey, rad, 0, Math.PI * 2);
      ctx.fillStyle = e.flash > 0 ? '#ffffff' : e.freezeT > 0 ? '#8ceeff' : e.col;
      ctx.fill();
      ctx.strokeStyle = e.fireMarkT > 0 ? '#ff6d38' : e.shield > 0 ? '#6ce2ff' : e.slowT > 0 ? '#7ce8ff' : e.rim;
      ctx.lineWidth = (e.boss || e.elite || e.shield > 0 || e.fireMarkT > 0) ? 3 : 1.8;
      ctx.stroke();

      // Fire Mark indicator (W10 Fire breakthrough hook)
      if (e.fireMarkT > 0) {
        ctx.font = '900 10px sans-serif'; ctx.textAlign = 'center';
        ctx.fillStyle = '#ff9a52';
        ctx.fillText(`🔥×${e.fireMarkStacks || 1}`, ex, ey + rad + 11);
      }

      // Elite affix tag
      if (e.elite && e.affixes?.length) {
        ctx.font = '900 10px sans-serif'; ctx.textAlign = 'center';
        ctx.fillStyle = e.isShrineBoss ? '#ff8ca0' : '#e6c2ff';
        ctx.fillText(e.affixes.map(a => a.name).join('·'), ex, ey - rad - 13);
      }

      // HP Bar for damaged / elites / bosses
      if (e.hp < e.maxHp || e.elite || e.boss || e.shield > 0) {
        const bw = e.boss ? 48 : e.elite ? 32 : 20;
        const r = clamp(e.hp / e.maxHp, 0, 1);
        ctx.fillStyle = 'rgba(0,0,0,0.72)';
        ctx.fillRect(ex - bw/2, ey - rad - 9, bw, 4.5);
        ctx.fillStyle = e.boss ? '#ff4f42' : e.isShrineBoss ? '#ff3b5c' : e.elite ? '#d284ff' : '#ff7b61';
        ctx.fillRect(ex - bw/2 + 0.5, ey - rad - 8.5, (bw - 1) * r, 3.5);
        if (e.shield > 0) {
          const sr = clamp(e.shield / (e.maxHp * 0.16), 0, 1);
          ctx.fillStyle = '#6ce2ff';
          ctx.fillRect(ex - bw/2 + 0.5, ey - rad - 11, (bw - 1) * sr, 2);
        }
      }
    }
  }

  function drawPickups(){
    const game = runtimeCtx.game;
    const h = game.hero;
    const isHarvest = game.phase === 'harvest';
    for (const g of game.gems) {
      const gx = g.x * CELL, gy = g.y * CELL;
      const s = g.big ? 6 : 4;
      if (isHarvest || g.magnetized) {
        const dx = h.x * CELL - gx, dy = h.y * CELL - gy;
        const d = Math.max(1, Math.hypot(dx, dy));
        const trail = Math.min(26, d * 0.45);
        ctx.strokeStyle = g.big ? 'rgba(255,228,120,0.55)' : 'rgba(110,244,255,0.48)';
        ctx.lineWidth = g.big ? 3 : 2;
        ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(gx - (dx/d)*trail, gy - (dy/d)*trail); ctx.stroke();
      }
      ctx.fillStyle = g.big ? '#ffe478' : '#6ef4ff';
      ctx.beginPath();
      ctx.moveTo(gx, gy - s); ctx.lineTo(gx + s * 0.8, gy); ctx.lineTo(gx, gy + s); ctx.lineTo(gx - s * 0.8, gy); ctx.closePath();
      ctx.fill();
    }
    for (const c of game.chests) {
      const cx = c.x * CELL, cy = c.y * CELL + Math.sin(c.bob) * 3;
      ctx.beginPath();
      ctx.arc(cx, cy, 16, 0, Math.PI * 2);
      ctx.fillStyle = c.legend ? 'rgba(255,196,64,0.3)' : c.shrineTier ? 'rgba(255,65,95,0.34)' : 'rgba(196,120,255,0.28)';
      ctx.fill();
      ctx.font = '20px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(c.legend ? '👑' : c.shrineTier ? '🩸' : '📦', cx, cy);
    }
    for (const orb of (game.healOrbs || [])) {
      const ox = orb.x * CELL, oy = orb.y * CELL + Math.sin(orb.bob || 0) * 3;
      ctx.beginPath();
      ctx.arc(ox, oy, 14, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(98,255,184,0.32)'; ctx.fill();
      ctx.strokeStyle = '#62ffb8'; ctx.lineWidth = 2.2; ctx.stroke();
      ctx.font = '16px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('💚', ox, oy);
    }
  }

  return { drawArtifacts, drawHero, drawEnemies, drawPickups };
}
