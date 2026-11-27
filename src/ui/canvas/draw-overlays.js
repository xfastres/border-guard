import { clamp } from '../../core/math.js';
import BALANCE from '../../data/balance.js';
import { CELL, MAIN_WAVES } from '../../data/index.js';

export function createOverlaysDrawer(runtimeCtx, { ctx, cam, worldToScreen }) {
  function drawTopTelegraphs(){
    const game = runtimeCtx.game;
    if (!game?.zones?.length) return;
    for (const z of game.zones) {
      if (z.kind === 'w30SigTelegraph' || z.kind === 'w30SigShockwave') {
        const zx = z.x * CELL, zy = z.y * CELL, zr = z.r * CELL;
        const sx = z.safeX * CELL, sy = z.safeY * CELL, sr = (z.safeR || 2.8) * CELL;
        const prog = 1 - clamp(z.t / Math.max(0.01, z.max), 0, 1);
        ctx.save();
        if (z.kind === 'w30SigTelegraph') {
          // High-contrast crimson danger ring + sweeping charge wave
          ctx.beginPath(); ctx.arc(zx, zy, zr, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(255,30,66,0.12)'; ctx.fill();
          ctx.strokeStyle = '#ff2e63'; ctx.lineWidth = 4; ctx.setLineDash([12, 8]); ctx.stroke();
          ctx.setLineDash([]);
          ctx.beginPath(); ctx.arc(zx, zy, Math.max(10, zr * prog), 0, Math.PI * 2);
          ctx.strokeStyle = '#ffe678'; ctx.lineWidth = 3.5; ctx.stroke();
        } else {
          // Erupting high-contrast shockwave rings
          const curR = Math.max(12, zr * prog);
          ctx.beginPath(); ctx.arc(zx, zy, curR, 0, Math.PI * 2);
          ctx.strokeStyle = '#ff2e63'; ctx.lineWidth = 10; ctx.stroke();
          ctx.beginPath(); ctx.arc(zx, zy, curR, 0, Math.PI * 2);
          ctx.strokeStyle = '#fff0a0'; ctx.lineWidth = 3.5; ctx.stroke();
        }
        // Ultra-clear Emerald/Cyan Safe Zone (drawn on TOP so hero ALWAYS sees safety!)
        ctx.beginPath(); ctx.arc(sx, sy, sr, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(72,255,178,0.24)'; ctx.fill();
        ctx.strokeStyle = '#62ffb8'; ctx.lineWidth = 4; ctx.stroke();
        ctx.beginPath(); ctx.arc(sx, sy, sr * 0.72, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 1.6; ctx.setLineDash([6, 6]); ctx.stroke();
        ctx.setLineDash([]);
        ctx.font = '900 13px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = '#eafff5';
        ctx.fillText(z.kind === 'w30SigTelegraph' ? `安全区 (${z.t.toFixed(1)}s)` : '安全区(免疫冲击波)', sx, sy - sr - 10);
        ctx.restore();
      } else if (z.kind === 'bossSlam') {
        const x = z.x * CELL, y = z.y * CELL, radius = z.r * CELL;
        const progress = 1 - clamp(z.t / z.max, 0, 1);
        ctx.save();
        ctx.beginPath(); ctx.arc(x, y, radius, 0, 2 * Math.PI);
        ctx.strokeStyle = '#370e1b'; ctx.lineWidth = 5; ctx.stroke();
        ctx.strokeStyle = '#ff6e69'; ctx.lineWidth = 2; ctx.stroke();
        ctx.beginPath(); ctx.arc(x, y, radius, -Math.PI / 2, -Math.PI / 2 + 2 * Math.PI * progress);
        ctx.strokeStyle = '#ffdf9a'; ctx.lineWidth = 3.5; ctx.stroke();
        ctx.restore();
      } else if (z.kind === 'w30RiftRing') {
        const zx = z.x * CELL, zy = z.y * CELL, zr = z.r * CELL;
        const prog = 1 - clamp(z.t / Math.max(0.01, z.max), 0, 1);
        ctx.save();
        ctx.beginPath(); ctx.arc(zx, zy, Math.max(8, zr * prog), 0, Math.PI * 2);
        ctx.strokeStyle = '#ff52b8'; ctx.lineWidth = 7; ctx.stroke();
        ctx.beginPath(); ctx.arc(zx, zy, Math.max(8, zr * prog), 0, Math.PI * 2);
        ctx.strokeStyle = '#ffe88a'; ctx.lineWidth = 2.5; ctx.stroke();
        ctx.restore();
      }
    }
  }

  function drawW30BossTopBar(){
    const game = runtimeCtx.game;
    if (!game || game.wave !== MAIN_WAVES || game.phase !== 'wave') return;
    const boss = game.enemies.find(e => e.kind === 'boss6' && e.hp > 0);
    if (!boss) return;
    const narrow = cam.w <= 700;
    const barW = narrow ? cam.w - 36 : Math.min(520, Math.max(260, cam.w * .44));
    const barH = narrow ? 9 : 13;
    const x = (cam.w - barW) / 2;
    const y = narrow ? 146 : 108;
    const ratio = clamp(boss.hp / Math.max(1, boss.maxHp), 0, 1);
    const sigPct = BALANCE.w30Boss?.signatureThresholdPct ?? 0.80;
    const finPct = BALANCE.w30Boss?.finalPhaseThresholdPct ?? 0.35;
    const bState = game.w30Battle;
    const phaseTag = boss.signatureLockActive
      ? '终焉锁血 · 入安全区'
      : boss.finalPhaseEntered
        ? '末段组合压制'
        : boss.signatureTriggered
          ? '中段周旋'
          : '开场交锋';

    ctx.save();
    ctx.fillStyle = 'rgba(10,16,22,0.86)';
    ctx.fillRect(x - 10, y - 24, barW + 20, barH + 34);
    ctx.strokeStyle = boss.signatureLockActive ? '#ffd97d' : '#ff4d6d';
    ctx.lineWidth = 2;
    ctx.strokeRect(x - 10, y - 24, barW + 20, barH + 34);

    ctx.font = '900 12px sans-serif'; ctx.textAlign = 'left'; ctx.fillStyle = '#fff3d6';
    ctx.fillText(`深渊主宰 · ${phaseTag}`, x, y - 8, barW * .62);
    ctx.textAlign = 'right'; ctx.fillStyle = '#ffd97d';
    ctx.fillText(`${Math.round(ratio * 100)}% · ${Number(bState?.elapsedSeconds || 0).toFixed(0)}s`, x + barW, y - 8);

    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(x, y, barW, barH);
    ctx.fillStyle = boss.signatureLockActive ? '#ffd166' : boss.finalPhaseEntered ? '#ff385c' : '#ff5270';
    ctx.fillRect(x, y, barW * ratio, barH);

    // 80% Signature & 35% Final Phase threshold markers
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x + barW * sigPct - 1, y - 2, 2, barH + 4);
    ctx.fillRect(x + barW * finPct - 1, y - 2, 2, barH + 4);
    ctx.restore();
  }

  function drawEdgeIndicators(){
    const game = runtimeCtx.game;
    const padX = 36, padTop = 108, padBot = 106;
    const targets = [];
    for (const e of game.enemies) {
      if (e.boss) targets.push({ x: e.x, y: e.y, col: '#ff5247', label: 'BOSS' });
      else if (e.elite) targets.push({ x: e.x, y: e.y, col: e.isShrineBoss ? '#ff3b5c' : '#c978ff', label: e.isShrineBoss ? '妖王' : '精英' });
    }
    if (game.shrine && !game.shrine.active && !game.shrine.cleared) {
      targets.push({ x: game.shrine.x, y: game.shrine.y, col: '#ff4d6d', label: '妖碑' });
    }
    for (const c of game.chests) {
      targets.push({ x: c.x, y: c.y, col: '#ffe066', label: c.legend ? '遗物' : '宝箱' });
    }
    for (const t of targets) {
      const sp = worldToScreen(t.x, t.y);
      if (sp.x >= 24 && sp.x <= cam.w - 24 && sp.y >= padTop && sp.y <= cam.h - padBot) continue;
      const cx = cam.w / 2, cy = cam.h / 2;
      const ang = Math.atan2(sp.y - cy, sp.x - cx);
      const ix = clamp(sp.x, padX, cam.w - padX);
      const iy = clamp(sp.y, padTop, cam.h - padBot);
      ctx.save();
      ctx.translate(ix, iy);
      ctx.rotate(ang);
      ctx.beginPath();
      ctx.moveTo(12, 0); ctx.lineTo(-7, -7); ctx.lineTo(-4, 0); ctx.lineTo(-7, 7); ctx.closePath();
      ctx.fillStyle = t.col; ctx.fill();
      ctx.strokeStyle = '#10191f'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.restore();
      ctx.font = '900 10px sans-serif'; ctx.textAlign = 'center';
      ctx.fillStyle = t.col;
      ctx.fillText(t.label, ix, iy - 12);
    }
  }

  return { drawTopTelegraphs, drawW30BossTopBar, drawEdgeIndicators };
}
