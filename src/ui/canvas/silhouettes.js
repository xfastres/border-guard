import { polygon } from './spell-effects.js';

const TAU = Math.PI * 2;

export function drawTraveler(ctx, x, y, r, direction, h, realmColor, quality) {
  const shield = h.shield > 0;
  const accent = h.armorBreakT > 0 ? '#ff9d88' : shield ? '#a6ebff' : realmColor;
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = '#050b10ce';
  ctx.beginPath(); ctx.ellipse(0, r * .39, r * 1.15, r * .62, 0, 0, TAU); ctx.fill();

  ctx.rotate(direction);
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(0, 0, r * 1.33, -.78, .78);
  ctx.moveTo(-r * 1.33, 0); ctx.arc(0, 0, r * 1.33, Math.PI, Math.PI + .68);
  ctx.strokeStyle = accent; ctx.globalAlpha = .73; ctx.stroke();
  ctx.globalAlpha = 1;
  if (shield) {
    ctx.beginPath(); polygon(ctx, 0, 0, r * 1.49, 6, .25);
    ctx.strokeStyle = '#a6eeffbd'; ctx.stroke();
    if (quality === 'high') {
      ctx.beginPath(); ctx.ellipse(0, 0, r * 1.57, r * 1.31, Math.PI / 6, -1.8, .6);
      ctx.strokeStyle = '#a6eaff45'; ctx.lineWidth = 4; ctx.stroke();
    }
  }

  // Cloak, jade lamellar, faceplate, and the blade on the leading edge.
  ctx.beginPath();
  ctx.moveTo(r * .78, -r * .35); ctx.quadraticCurveTo(-r * .2, -r * .82, -r * .65, -r * .56);
  ctx.lineTo(-r * 1.18, -r * .81); ctx.lineTo(-r * .82, 0); ctx.lineTo(-r * 1.23, r * .7);
  ctx.quadraticCurveTo(-r * .2, r * 1.13, r * .6, r * .32); ctx.closePath();
  ctx.fillStyle = h.invuln > 0 ? '#edf8ed' : '#183e42';
  ctx.fill(); ctx.strokeStyle = '#80b0ac'; ctx.lineWidth = 1; ctx.stroke();

  ctx.beginPath();
  polygon(ctx, r * .20, -r * .02, r * .63, 5, -.2);
  ctx.fillStyle = h.invuln > 0 ? '#fff9dd' : '#629e90'; ctx.fill();
  ctx.strokeStyle = '#cde5cd'; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(r * .71, -r * .30); ctx.lineTo(r * .42, -.08 * r);
  ctx.lineTo(r * .71, r * .23); ctx.strokeStyle = '#101c24'; ctx.lineWidth = 2.2; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(r * .12, r * .60); ctx.lineTo(r * 1.18, r * .41); ctx.lineTo(r * 1.42, r * .47);
  ctx.lineTo(r * 1.20, r * .62); ctx.lineTo(r * .03, r * .79); ctx.closePath();
  ctx.fillStyle = '#f1e2b9'; ctx.fill();
  ctx.beginPath(); ctx.moveTo(r * 1.35, -r * .27); ctx.lineTo(r * 1.68, 0); ctx.lineTo(r * 1.35, r * .27);
  ctx.strokeStyle = accent; ctx.lineWidth = 1.35; ctx.stroke();
  ctx.restore();
}

export function drawEnemyBody(ctx, e, x, y, r, clock, quality) {
  const major = e.boss || e.elite;
  const special = e.kind === 'shaman' || e.kind === 'mage' || e.totem || e.pillar;
  const look = special ? 4 : e.kind === 'wolf' ? 3 : e.kind === 'brute' || major ? 6 : 5;
  const size = major ? r * 1.22 : r;
  const accent = e.signatureLockActive ? '#f1d885' : e.finalPhaseEntered ? '#fb5484'
    : e.signatureTriggered ? '#b0a2fa' : e.boss ? '#ed9784' : e.elite ? '#c4a2f4' : e.col;
  const rim = e.fireMarkT > 0 ? '#ff8d54' : e.shield > 0 || e.slowT > 0 ? '#8bdcf4' : accent;
  if (major || quality === 'high') {
    ctx.fillStyle = '#05090da1';
    ctx.beginPath(); ctx.ellipse(x, y + size * .42, size * 1.13, size * .70, 0, 0, TAU); ctx.fill();
  }

  if (major) {
    const outer = size + (e.boss ? 10 : 5);
    ctx.lineWidth = e.boss ? 2.1 : 1.15;
    ctx.strokeStyle = accent;
    ctx.globalAlpha = e.boss ? .57 : .59;
    ctx.beginPath(); polygon(ctx, x, y, outer, e.boss ? 8 : 6, e.boss ? clock * .24 : .18); ctx.stroke();
    if (e.boss || quality === 'high') {
      ctx.beginPath(); ctx.arc(x, y, outer + 4, .15, 2.65);
      ctx.moveTo(x + Math.cos(3.25) * (outer + 4), y + Math.sin(3.25) * (outer + 4));
      ctx.arc(x, y, outer + 4, 3.25, 5.77);
      ctx.globalAlpha = .33; ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  ctx.beginPath();
  polygon(ctx, x, y, size, look, look === 4 ? 0 : -Math.PI / 2);
  ctx.fillStyle = e.flash > 0 ? '#fff7e8' : e.freezeT > 0 ? '#5486a0' : major ? '#372833' : '#212b30';
  ctx.fill();
  ctx.strokeStyle = rim;
  ctx.lineWidth = major || e.shield > 0 ? 1.6 : .95;
  ctx.stroke();

  ctx.beginPath();
  if (special) {
    polygon(ctx, x, y - size * .06, size * .45, 4);
  } else {
    ctx.moveTo(x - size * .56, y - size * .36); ctx.lineTo(x - size * .12, y - size * .14);
    ctx.lineTo(x - size * .34, y + size * .11); ctx.closePath();
    ctx.moveTo(x + size * .56, y - size * .36); ctx.lineTo(x + size * .12, y - size * .14);
    ctx.lineTo(x + size * .34, y + size * .11); ctx.closePath();
  }
  ctx.fillStyle = e.flash > 0 ? '#e98d80' : e.freezeT > 0 ? '#e1f8ff' : accent;
  ctx.fill();
  if (e.boss) {
    const brow = y - size * .48;
    ctx.beginPath(); ctx.moveTo(x - size * .66, brow + 3);
    ctx.lineTo(x - size * .6, brow - 9); ctx.lineTo(x, brow - 3);
    ctx.lineTo(x + size * .6, brow - 9); ctx.lineTo(x + size * .66, brow + 3);
    ctx.strokeStyle = accent; ctx.lineWidth = 1.5; ctx.stroke();
  }
  if (e.freezeT > 0) {
    ctx.beginPath(); polygon(ctx, x, y, size + 2.8, 6, .25);
    ctx.fillStyle = '#9de3f442'; ctx.fill(); ctx.strokeStyle = '#d6f5fe'; ctx.lineWidth = 1.3; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - size * .62, y + size * .62); ctx.lineTo(x + size * .45, y - size * .56); ctx.stroke();
  }
}
