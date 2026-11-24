import { createGameStateFactory } from '../../core/state.js';
import { createWavesSystem } from './waves.js';
import { createTelemetrySystem } from './telemetry.js';
import { createFinalPrepSystem } from './final-prep.js';
import { createRunLifecycle } from './lifecycle.js';
import { createRunTick } from './tick.js';

export { createGameStateFactory, createRunState } from '../../core/state.js';
export { createWavesSystem, getWavePhaseMeta, getW25To28Pool } from './waves.js';
export { createTelemetrySystem } from './telemetry.js';
export { createFinalPrepSystem, isCancelablePrepModal } from './final-prep.js';
export { createRunLifecycle } from './lifecycle.js';
export { createRunTick } from './tick.js';

export function createRunSystem(ctx, deps) {
  const { makeGame } = createGameStateFactory(ctx, {
    generateRunId: deps.meta.generateRunId,
    getMetaSave: deps.meta.getMetaSave,
  });
  const runDeps = {
    ...deps,
    makeGame,
    get waves() { return waves; },
    get telemetry() { return telemetry; },
    get finalPrep() { return finalPrep; },
    get lifecycle() { return lifecycle; },
  };
  const waves = createWavesSystem(ctx, runDeps);
  const telemetry = createTelemetrySystem(ctx, runDeps);
  const finalPrep = createFinalPrepSystem(ctx, runDeps);
  const lifecycle = createRunLifecycle(ctx, runDeps);
  const tick = createRunTick(ctx, runDeps);
  return { makeGame, ...waves, ...telemetry, ...finalPrep, ...lifecycle, ...tick };
}
