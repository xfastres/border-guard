import { createBuildEffects } from './build-effects.js';
import { createCombatDamage } from './damage.js';
import { createCombatHooks } from './hooks.js';
import { createCombatSimulation } from './simulation.js';

export { createCombatDamage, isEnemyUnstoppable } from './damage.js';
export { createCombatHooks } from './hooks.js';
export { createCombatSimulation, pointToSegDist } from './simulation.js';

export function createCombatCore(ctx, deps) {
  const hooks = createCombatHooks(ctx, {
    ...deps,
    get damage() { return damage; },
  });
  const damage = createCombatDamage(ctx, { ...deps, hooks });
  return { ...hooks, ...damage };
}

export function createCombatSystem(ctx, deps) {
  const combatDeps = {
    ...deps,
    get hooks() { return hooks; },
    get damage() { return damage; },
    get simulation() { return simulation; },
    get builds() { return builds; },
  };
  const hooks = createCombatHooks(ctx, combatDeps);
  const damage = createCombatDamage(ctx, combatDeps);
  const simulation = createCombatSimulation(ctx, combatDeps);
  const builds = createBuildEffects(ctx, combatDeps);
  return { ...hooks, ...damage, ...simulation, ...builds };
}
