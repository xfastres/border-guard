import { createCombatDamage } from './damage.js';
import { createCombatHooks } from './hooks.js';

export { createCombatDamage, isEnemyUnstoppable } from './damage.js';
export { createCombatHooks } from './hooks.js';

export function createCombatCore(ctx, deps) {
  const hooks = createCombatHooks(ctx, {
    ...deps,
    get damage() { return damage; },
  });
  const damage = createCombatDamage(ctx, { ...deps, hooks });
  return { ...hooks, ...damage };
}
