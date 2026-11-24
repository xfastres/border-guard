import { CELL, H, W } from '../../data/index.js';

export function createArenaDrawer(runtimeCtx, { ctx, cam, perfStats }) {
  function drawArena(){
    // Strict visible viewport AABB culling (never iterates all 3072 tiles!)
    const halfW = (cam.w / (2 * cam.zoom)) / CELL;
    const halfH = (cam.h / (2 * cam.zoom)) / CELL;
    const cxTile = cam.x / CELL, cyTile = cam.y / CELL;
    const x0 = Math.max(0, Math.floor(cxTile - halfW) - 1);
    const x1 = Math.min(W - 1, Math.ceil(cxTile + halfW) + 1);
    const y0 = Math.max(0, Math.floor(cyTile - halfH) - 1);
    const y1 = Math.min(H - 1, Math.ceil(cyTile + halfH) + 1);

    let tilesDrawn = 0;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        ctx.fillStyle = ((x + y) % 2) ? '#121f24' : '#152329';
        ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
        tilesDrawn++;
      }
    }
    perfStats.culledTiles = tilesDrawn;

    // Subtle spatial landmark grid every 8 tiles
    ctx.strokeStyle = 'rgba(130,205,198,0.08)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let x = Math.ceil(x0 / 8) * 8; x <= x1; x += 8) {
      ctx.moveTo(x * CELL, y0 * CELL);
      ctx.lineTo(x * CELL, (y1 + 1) * CELL);
    }
    for (let y = Math.ceil(y0 / 8) * 8; y <= y1; y += 8) {
      ctx.moveTo(x0 * CELL, y * CELL);
      ctx.lineTo((x1 + 1) * CELL, y * CELL);
    }
    ctx.stroke();

    // Culled non-blocking terrain landmarks (ancient rune circles, flagstones, tufts)
    let propsDrawn = 0;
    for (const p of runtimeCtx.terrainProps) {
      const pad = p.rad || 1;
      if (p.x + pad < x0 || p.x - pad > x1 + 1 || p.y + pad < y0 || p.y - pad > y1 + 1) continue;
      propsDrawn++;
      const px = p.x * CELL, py = p.y * CELL;
      if (p.kind === 'rune') {
        ctx.beginPath();
        ctx.arc(px, py, p.rad * CELL, 0, Math.PI * 2);
        ctx.strokeStyle = p.col;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(px, py, p.rad * CELL * 0.55, 0, Math.PI * 2);
        ctx.stroke();
      } else if (p.kind === 'stone') {
        ctx.save();
        ctx.translate(px, py); ctx.rotate(p.rot);
        ctx.fillStyle = 'rgba(170,205,205,0.06)';
        const sw = p.s * CELL;
        ctx.fillRect(-sw, -sw * 0.65, sw * 2, sw * 1.3);
        ctx.restore();
      } else {
        ctx.beginPath();
        ctx.arc(px, py, p.s * CELL * 0.55, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(92,195,140,0.08)';
        ctx.fill();
      }
    }
    perfStats.culledProps = propsDrawn;

    // Glowing Secret Realm Boundary (世界结界光墙)
    ctx.strokeStyle = 'rgba(108,226,255,0.55)';
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, W * CELL - 4, H * CELL - 4);
    ctx.strokeStyle = 'rgba(255,214,102,0.22)';
    ctx.lineWidth = 10;
    ctx.strokeRect(7, 7, W * CELL - 14, H * CELL - 14);
  }

  return { drawArena };
}
