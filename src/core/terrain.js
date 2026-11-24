import { W, H } from '../data/index.js';
import { mulberry32 } from './rng.js';

export function buildTerrainProps(seed){
  const r = mulberry32(seed ^ 0x9e3779b9);
  const props = [];
  for (let i = 0; i < 18; i++) {
    props.push({ kind: 'rune', x: 5 + r() * (W - 10), y: 5 + r() * (H - 10), rad: 1.4 + r() * 1.4, col: i % 2 ? 'rgba(114,242,180,0.09)' : 'rgba(108,226,255,0.09)' });
  }
  for (let i = 0; i < 180; i++) {
    props.push({ kind: r() < 0.55 ? 'stone' : 'tuft', x: 1.5 + r() * (W - 3), y: 1.5 + r() * (H - 3), s: 0.22 + r() * 0.35, rot: r() * Math.PI * 2 });
  }
  return props;
}
