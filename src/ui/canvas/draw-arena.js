import { CELL, H, W } from '../../data/index.js';
import { polygon } from './spell-effects.js';

const TAU = Math.PI * 2;
const STONE_TILE = 384;
const AMBIENT_TINT = { jade: '#11353124', amber: '#381b1570', ice: '#18263e73', crimson: '#32172c97' };
const COLORS = {
  jade: ['#a7d9ca12', '#0b1c2342', '#050a0dcf'],
  amber: ['#e3b07112', '#30211a48', '#0d0809da'],
  ice: ['#8098fa17', '#24284f53', '#070915e5'],
  crimson: ['#db58721c', '#47152d63', '#100610ed'],
};

function noise(index) {
  const value = Math.sin(index * 97.173 + 42.345) * 43758.5453;
  return value - Math.floor(value);
}

function makeStoneTile(makeSurface) {
  const surface = makeSurface?.(STONE_TILE, STONE_TILE);
  const ctx = surface?.getContext?.('2d');
  if (!ctx) return null;
  const w = STONE_TILE;
  ctx.fillStyle = '#152023';
  ctx.fillRect(0, 0, w, w);
  for (let i = 0; i < 60; i++) {
    const x = noise(i + 1) * w, y = noise(i + 145) * w;
    const r = 12 + noise(i + 81) * 44;
    // Wrap every cloud at the tile edge so the repeating stone has no seams.
    const xWrap = x < r ? w : x > w - r ? -w : 0;
    const yWrap = y < r ? w : y > w - r ? -w : 0;
    for (let j = 0; j <= Boolean(xWrap); j++) {
      for (let k = 0; k <= Boolean(yWrap); k++) {
        const px = x + j * xWrap, py = y + k * yWrap;
        const paint = ctx.createRadialGradient?.(px, py, 0, px, py, r);
        if (!paint?.addColorStop) continue;
        paint.addColorStop(0, i % 3 ? '#52636725' : '#05090e90');
        paint.addColorStop(1, 'transparent');
        ctx.fillStyle = paint;
        ctx.fillRect(px - r, py - r, r * 2, r * 2);
      }
    }
  }
  for (let i = 0; i < 820; i++) {
    const x = noise(i + 423) * w, y = noise(i + 84) * w;
    ctx.fillStyle = i % 4 ? '#94a39e11' : '#04080a92';
    ctx.fillRect(x, y, (i % 7) * .27 + .55, .7);
  }
  ctx.lineWidth = .65;
  for (let i = 0; i < 23; i++) {
    const x = noise(i + 151) * w, y = noise(i + 374) * w;
    const len = Math.min(18 + noise(i + 395) * 67, w - x - 1, (w - y - 1) * 2);
    if (len < 8) continue;
    ctx.beginPath(); ctx.moveTo(x, y);
    ctx.lineTo(x + len * .31, y - len * .06); ctx.lineTo(x + len * .57, y + len * .16);
    ctx.lineTo(x + len * .83, y + len * .14); ctx.lineTo(x + len, y + len * .45);
    ctx.strokeStyle = '#0a1015b0'; ctx.stroke();
  }
  return surface;
}

function traceRune(ctx, x, y, radius, angle) {
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, TAU);
  ctx.moveTo(x + radius * .87, y); ctx.arc(x, y, radius * .87, 0, TAU);
  polygon(ctx, x, y, radius * .76, 8, angle);
  for (let i = 0; i < 8; i++) {
    const a = angle + i * TAU / 8;
    const dx = Math.cos(a), dy = Math.sin(a);
    ctx.moveTo(x + dx * radius * .87, y + dy * radius * .87);
    ctx.lineTo(x + dx * radius * 1.05, y + dy * radius * 1.05);
  }
}

export function createArenaDrawer(runtimeCtx, { ctx, cam, perfStats, makeSurface }) {
  let texture;
  const tonedTiles = new Map();
  const patterns = new Map();
  let lightingKey = '';
  let lighting = null;

  function toneForWave() {
    const { wave, phase } = runtimeCtx.game;
    const boss = phase === 'wave' && wave % 5 === 0;
    return boss && wave >= 28 ? 'crimson' : boss && wave >= 20 ? 'ice'
      : boss || wave > 24 ? 'amber' : 'jade';
  }

  function lowDetailTile() {
    const tone = toneForWave();
    if (!tonedTiles.has(tone)) {
      const tile = makeSurface(STONE_TILE, STONE_TILE);
      const painter = tile.getContext('2d');
      painter.drawImage(texture, 0, 0);
      painter.fillStyle = AMBIENT_TINT[tone];
      painter.fillRect(0, 0, STONE_TILE, STONE_TILE);
      tonedTiles.set(tone, tile);
    }
    return tonedTiles.get(tone);
  }

  function drawArena(quality) {
    if (quality !== 'off' && texture === undefined) texture = makeStoneTile(makeSurface);
    const halfW = (cam.w / (2 * cam.zoom)) / CELL;
    const halfH = (cam.h / (2 * cam.zoom)) / CELL;
    const x0 = Math.max(0, Math.floor(cam.x / CELL - halfW) - 1);
    const x1 = Math.min(W, Math.ceil(cam.x / CELL + halfW) + 1);
    const y0 = Math.max(0, Math.floor(cam.y / CELL - halfH) - 1);
    const y1 = Math.min(H, Math.ceil(cam.y / CELL + halfH) + 1);
    if (texture && quality !== 'off') {
      const tile = quality === 'high' ? texture : lowDetailTile();
      if (!patterns.has(tile)) patterns.set(tile, ctx.createPattern?.(tile, 'repeat') || null);
      const pattern = patterns.get(tile);
      if (pattern) {
        ctx.fillStyle = pattern;
        ctx.fillRect(x0 * CELL, y0 * CELL, (x1 - x0) * CELL, (y1 - y0) * CELL);
      } else {
        ctx.save();
        ctx.beginPath(); ctx.rect(0, 0, W * CELL, H * CELL); ctx.clip();
        const left = Math.floor(x0 * CELL / STONE_TILE) * STONE_TILE;
        const top = Math.floor(y0 * CELL / STONE_TILE) * STONE_TILE;
        for (let y = top; y < y1 * CELL; y += STONE_TILE) {
          for (let x = left; x < x1 * CELL; x += STONE_TILE) ctx.drawImage(tile, x, y);
        }
        ctx.restore();
      }
    } else {
      ctx.fillStyle = '#162124';
      ctx.fillRect(x0 * CELL, y0 * CELL, (x1 - x0) * CELL, (y1 - y0) * CELL);
    }
    perfStats.culledTiles = (x1 - x0) * (y1 - y0);

    let propsDrawn = 0;
    for (const p of runtimeCtx.terrainProps) {
      if (quality === 'off') break;
      const pad = p.rad || 1;
      if (p.x + pad < x0 || p.x - pad > x1 || p.y + pad < y0 || p.y - pad > y1) continue;
      propsDrawn++;
      const x = p.x * CELL, y = p.y * CELL;
      if (p.kind === 'rune') {
        traceRune(ctx, x, y, p.rad * CELL, .14);
        ctx.strokeStyle = '#b0b99242'; ctx.lineWidth = 1.2; ctx.stroke();
      } else if (p.kind === 'stone') {
        ctx.save(); ctx.translate(x, y); ctx.rotate(p.rot);
        const size = p.s * CELL;
        ctx.fillStyle = '#34434a48'; ctx.strokeStyle = '#819b9b2b'; ctx.lineWidth = .9;
        ctx.beginPath(); polygon(ctx, 0, 0, size, 5); ctx.fill(); ctx.stroke(); ctx.restore();
      } else {
        ctx.beginPath(); ctx.ellipse(x, y, p.s * CELL * .8, p.s * CELL * .3, -.4, 0, TAU);
        ctx.fillStyle = '#627a641b'; ctx.fill();
      }
    }
    perfStats.culledProps = propsDrawn;

    const cx = W * CELL / 2, cy = H * CELL / 2, r = CELL * 4.25;
    if (cx + r >= x0 * CELL && cx - r <= x1 * CELL && cy + r >= y0 * CELL && cy - r <= y1 * CELL) {
      traceRune(ctx, cx, cy, r, Math.PI / 8);
      ctx.strokeStyle = '#b8a26c48'; ctx.lineWidth = 1.2; ctx.stroke();
      traceRune(ctx, cx, cy, r * .49, -Math.PI / 8);
      ctx.strokeStyle = '#91ac9e2b'; ctx.stroke();
    }
    ctx.strokeStyle = '#85b5b768'; ctx.lineWidth = 2;
    ctx.strokeRect(2, 2, W * CELL - 4, H * CELL - 4);
    ctx.strokeStyle = '#bb99653f'; ctx.lineWidth = 1;
    ctx.strokeRect(8, 8, W * CELL - 16, H * CELL - 16);
  }

  function drawLighting(quality, pixelRatio) {
    if (quality !== 'high' || !makeSurface) return;
    const tone = toneForWave();
    const theme = tone + quality + cam.w + 'x' + cam.h;
    if (theme !== lightingKey) {
      lightingKey = theme;
      const w = Math.max(32, Math.round(cam.w * .22));
      const h = Math.max(32, Math.round(cam.h * .22));
      if (!lighting) lighting = makeSurface(w, h);
      if (lighting.width !== w) lighting.width = w;
      if (lighting.height !== h) lighting.height = h;
      const painter = lighting.getContext('2d');
      const paint = painter.createRadialGradient?.(w * .5, h * .47, 3, w * .5, h * .47, Math.max(w, h) * .65);
      if (!paint?.addColorStop) { lighting = null; return; }
      const [center, middle, edge] = COLORS[tone];
      paint.addColorStop(0, center);
      paint.addColorStop(.57, middle);
      paint.addColorStop(1, edge);
      painter.clearRect(0, 0, w, h);
      painter.fillStyle = paint;
      painter.fillRect(0, 0, w, h);
    }
    if (!lighting) return;
    ctx.save();
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    ctx.drawImage(lighting, 0, 0, cam.w, cam.h);
    ctx.restore();
  }

  return { drawArena, drawLighting };
}
