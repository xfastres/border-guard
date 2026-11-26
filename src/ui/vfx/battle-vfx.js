import { CELL } from '../../data/index.js';
import { getBuildRoute, getW20ActiveState, hasDestinyEnhancement } from '../../core/state-queries.js';

export const EFFECT_LIMITS = {
  high: { particles: 192, stamps: 32, trails: 14, emission: 36, glow: true, beams: 32, bolts: 24, rings: 45, labels: 38 },
  low: { particles: 64, stamps: 12, trails: 5, emission: 12, glow: false, beams: 14, bolts: 10, rings: 18, labels: 18 },
  off: { particles: 0, stamps: 0, trails: 0, emission: 0, glow: false, beams: 6, bolts: 5, rings: 8, labels: 12 },
};

export const SKILL_EFFECT = {
  blades: 'blades', firewave: 'fire', nova: 'frost', thunder: 'thunder',
  berserk: 'blood', stomp: 'stone', swordlance: 'lance', sunward: 'holy',
};

const DIRECTION_EFFECT = {
  fire_chain_surge: 'fire', frost_bastion_counter: 'frost', breaker_momentum: 'stone',
  wind_stride: 'wind', storm_circuit: 'thunder', blood_requital: 'blood', sanctum_verdict: 'holy',
};

export const EFFECT_STYLE = {
  blades: { color: '#dfebf8', core: '#fff8e7' },
  lance: { color: '#cbd9ff', core: '#f8fdff' },
  fire: { color: '#ff804a', core: '#fff0a9' },
  frost: { color: '#8adbf3', core: '#ebfbff' },
  thunder: { color: '#889aff', core: '#eef9ff' },
  blood: { color: '#f85870', core: '#ffafb4' },
  stone: { color: '#e1a25f', core: '#ffda8a' },
  holy: { color: '#e7c172', core: '#fff2c1' },
  wind: { color: '#91dcc7', core: '#effff6' },
  ward: { color: '#9fdbef', core: '#e8fbff' },
  boss: { color: '#bc5375', core: '#ffe4ce' },
};

const RING_EFFECT = {
  '#ff4724': 'fire', '#ff5e2b': 'fire', '#ff6a32': 'fire', '#ff6d38': 'fire', '#ff7b47': 'fire', '#ffe066': 'fire',
  '#7ce8ff': 'frost', '#8ef4ff': 'frost', '#aef8ff': 'frost', '#c4f8ff': 'frost', '#9cf6ff': 'frost', '#88f0ff': 'frost',
  '#d8b2ff': 'thunder', '#9ff5d1': 'wind', '#9effea': 'wind',
  '#ff7999': 'blood', '#ff91a9': 'blood', '#ff98aa': 'blood',
  '#ffbe55': 'stone', '#d89eff': 'stone', '#ff5c42': 'stone',
  '#ffe88e': 'holy', '#ffe795': 'holy', '#ff385c': 'boss',
};

const MODES = ['auto', 'high', 'low', 'off'];
const AUTO = { crowd: 112, crowdRecovery: 88, slowFps: 43, minimalFps: 29, recoveredFps: 54, dwellMs: 1100 };

function fixedPool(size) {
  const entries = Array.from({ length: size }, () => ({ time: 0 }));
  let cursor = 0;
  return {
    entries,
    take(limit) {
      const entry = entries[cursor % limit];
      cursor = (cursor + 1) % limit;
      return entry;
    },
    clear(start = 0) {
      for (let i = start; i < size; i++) entries[i].time = 0;
      if (start === 0) cursor = 0;
    },
  };
}

export function effectTier(game, kind) {
  const br = game.hero.breakthroughs;
  const first = SKILL_EFFECT[br?.w10?.skillKey];
  const second = br?.w20;
  const active = second?.completed && second.baseEffectActive !== false && game.hero.vouchers?.w20;
  const direction = DIRECTION_EFFECT[second?.directionKey];
  const windFamily = kind === 'blades' || kind === 'lance' || kind === 'wind';
  if (active && (direction === kind || (direction === 'wind' && windFamily))) return 2;
  if (first === kind || (windFamily && (first === 'blades' || first === 'lance'))) return 1;
  return 0;
}

export function createBattleVfx(runtimeCtx, { preferReducedMotion = false } = {}) {
  const particles = fixedPool(EFFECT_LIMITS.high.particles);
  const stamps = fixedPool(EFFECT_LIMITS.high.stamps);
  const trails = fixedPool(EFFECT_LIMITS.high.trails);
  const skills = Object.entries(SKILL_EFFECT);
  const priorTimers = Object.fromEntries(skills.map(([key]) => [key, 0]));
  let mode = 'auto';
  let quality = preferReducedMotion ? 'off' : 'high';
  let previousGame = null;
  let previousPhase = '';
  let lastBossId = null;
  let heading = 0;
  let lastX = 0, lastY = 0, lastShield = 0, lastDash = 0, lastUlt = 0, lastLeech = 0, lastHp = 0;
  let hitX = 0, hitY = 0, hitTime = -10;
  let clock = 0, lastTrail = -10, qualityAt = -Infinity, emitCount = 0;
  let state = 8269;
  let shake = 0;

  function random() {
    // Private visual stream. Gameplay and its replay retain the original RNG sequence.
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  }

  function setQuality(next) {
    if (quality === next) return;
    quality = next;
    const cap = EFFECT_LIMITS[quality];
    particles.clear(cap.particles);
    stamps.clear(cap.stamps);
    trails.clear(cap.trails);
    if (next === 'off') shake = 0;
  }

  function cycleMode() {
    mode = MODES[(MODES.indexOf(mode) + 1) % MODES.length];
    if (mode !== 'auto') setQuality(mode);
    else setQuality(preferReducedMotion ? 'off' : 'high');
    qualityAt = -Infinity;
    return mode;
  }

  function reset(game) {
    previousGame = game;
    previousPhase = game.phase;
    lastBossId = null;
    const h = game.hero;
    lastX = h.x; lastY = h.y; lastShield = h.shield || 0; lastDash = h.dashCd || 0;
    lastUlt = h.ultTimer || 0; lastLeech = h.leechUsed || 0; lastHp = h.hp;
    for (const key of Object.keys(SKILL_EFFECT)) priorTimers[key] = h.skillTimers?.[key] || 0;
    heading = 0; lastTrail = -10; clock = 0; hitTime = -10; shake = 0;
    particles.clear();
    stamps.clear();
    trails.clear();
  }

  function advance(dt) {
    clock += dt;
    emitCount = 0;
    shake = Math.max(0, shake - dt * 0.75);
    const cap = EFFECT_LIMITS[quality];
    for (let i = 0; i < cap.particles; i++) {
      const p = particles.entries[i];
      if (p.time <= 0) continue;
      p.time -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += p.gravity * dt;
    }
    for (let i = 0; i < cap.stamps; i++) stamps.entries[i].time -= dt;
    for (let i = 0; i < cap.trails; i++) trails.entries[i].time -= dt;
  }

  function burst(kind, x, y, radius, tier = effectTier(runtimeCtx.game, kind), label = '') {
    const cap = EFFECT_LIMITS[quality];
    if (!cap.stamps) return;
    const e = stamps.take(cap.stamps);
    e.kind = kind; e.x = x * CELL; e.y = y * CELL;
    e.radius = Math.max(9, Math.min(152, radius * CELL));
    e.tier = tier; e.label = label; e.toX = null; e.toY = null; e.angle = random() * Math.PI * 2;
    e.time = e.max = (kind === 'boss' ? .72 : .40) + tier * .11;
    const count = Math.min(cap.emission - emitCount, (quality === 'low' ? 3 : 5) + tier * 3);
    for (let i = 0; i < count; i++) {
      const p = particles.take(cap.particles);
      const a = random() * Math.PI * 2;
      const speed = (26 + random() * 86) * (1 + tier * .18);
      p.kind = kind; p.x = e.x; p.y = e.y;
      p.vx = Math.cos(a) * speed; p.vy = Math.sin(a) * speed;
      p.gravity = kind === 'stone' ? 130 : kind === 'fire' ? -28 : 12;
      p.size = 1.4 + random() * (tier + 2.2);
      p.time = p.max = .26 + random() * .34;
    }
    emitCount += Math.max(count, 0);
    return e;
  }

  function onRing(x, y, color, radius) {
    const game = runtimeCtx.game;
    const kind = RING_EFFECT[color];
    if (!game || game.phase !== 'wave' || !kind) return;
    if (game !== previousGame) reset(game);
    burst(kind, x, y, radius);
  }

  function onFloat(x, y, message) {
    const game = runtimeCtx.game;
    if (!game || game.phase !== 'wave' || quality === 'off') return;
    if (game !== previousGame) reset(game);
    if (/^\d+!?$/.test(message)) {
      hitX = x; hitY = y; hitTime = clock;
    }
    if ((/^[\d]+!$|斩杀/u).test(message) && shake < .04) {
      shake = .12;
      burst('blades', x, y + .24, .54, 0);
    }
  }

  function sample(now, fps) {
    const game = runtimeCtx.game;
    if (game !== previousGame) reset(game);
    if (mode === 'auto' && !preferReducedMotion && now - qualityAt > AUTO.dwellMs) {
      const crowded = game.enemies.length >= AUTO.crowd || fps < AUTO.slowFps;
      const calm = game.enemies.length <= AUTO.crowdRecovery && fps >= AUTO.recoveredFps;
      let next = quality;
      if (quality === 'high' && crowded) next = 'low';
      else if (quality === 'low' && fps < AUTO.minimalFps) next = 'off';
      else if (calm) next = quality === 'off' ? 'low' : 'high';
      if (next !== quality) { setQuality(next); qualityAt = now; }
    }
    const h = game.hero;
    const dx = h.x - lastX, dy = h.y - lastY;
    if (Math.abs(dx) + Math.abs(dy) > .025) heading = Math.atan2(dy, dx);

    if (game.phase !== previousPhase) {
      previousPhase = game.phase;
      if (game.phase === 'wave' && (game.wave % 5 === 0 || game.wave === 28)) {
        burst('boss', h.x, h.y, 3.2, 1);
      } else if (game.phase !== 'wave') {
        particles.clear(); trails.clear(); stamps.clear();
      }
    }
    const cap = EFFECT_LIMITS[quality];
    if (game.phase === 'wave' && cap.particles) {
      const boss = game.enemies.find(e => e.boss && e.hp > 0);
      if (boss && boss.id !== lastBossId) {
        lastBossId = boss.id;
        burst('boss', boss.x, boss.y, 2.9, game.wave >= 20 ? 2 : 1);
      }
      const dash = h.dashCd > lastDash + .35;
      const overdrive = h.ultTimer > lastUlt + .35;
      let dashKind = 'fire';
      if (dash) {
        const direction = getW20ActiveState(game).directionKey || getBuildRoute(game)?.direction;
        if (direction === 'wind_stride' || hasDestinyEnhancement(game, 'destiny_phantom_stride')) dashKind = 'wind';
      }
      if ((dash || clock - lastTrail > (quality === 'low' ? .115 : .048)) && Math.hypot(dx, dy) > .035) {
        const n = dash ? (quality === 'low' ? 3 : 6) : 1;
        for (let i = 0; i < n; i++) {
          const trail = trails.take(cap.trails);
          const progress = dash ? i / n : 0;
          trail.x = (lastX + dx * progress) * CELL;
          trail.y = (lastY + dy * progress) * CELL;
          trail.angle = heading; trail.kind = dash ? dashKind : 'lance';
          trail.time = trail.max = dash ? .26 + progress * .11 : .16;
        }
        lastTrail = clock;
      }
      if (dash) burst(dashKind, h.x, h.y, 1.1);
      if (overdrive) burst(h.skills?.berserk ? 'blood' : 'holy', h.x, h.y, 2.25);
      if (lastShield > 0 && h.shield <= 0 && h.invuln > 0) burst('frost', h.x, h.y, 1.38, 1);
      if (h.shield > lastShield && h.shield - lastShield >= 8 && clock - hitTime < .24) {
        burst('ward', h.x, h.y, 1.23, 0, `+${Math.round(h.shield - lastShield)} 盾`);
      }
      if (h.leechUsed > lastLeech && h.hp > lastHp && clock - hitTime < .26) {
        const stream = burst('blood', hitX, hitY, .78, 0, `+${Math.ceil(h.hp - lastHp)}`);
        if (stream) { stream.toX = h.x * CELL; stream.toY = h.y * CELL; }
      }
      for (const [key, kind] of skills) {
        const cd = h.skillTimers?.[key] || 0;
        if (cd > priorTimers[key] + .22 && (kind === 'fire' || kind === 'lance')) burst(kind, h.x, h.y, .72);
        priorTimers[key] = cd;
      }
    }
    lastX = h.x; lastY = h.y; lastShield = h.shield || 0;
    lastDash = h.dashCd || 0; lastUlt = h.ultTimer || 0; lastLeech = h.leechUsed || 0; lastHp = h.hp;
  }

  return {
    sample, advance, onRing, onFloat, cycleMode,
    get quality() { return quality; }, get mode() { return mode; }, get limits() { return EFFECT_LIMITS[quality]; },
    get heading() { return heading; }, get shake() { return shake; },
    particles: particles.entries, stamps: stamps.entries, trails: trails.entries,
  };
}
