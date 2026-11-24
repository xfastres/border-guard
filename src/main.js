import './ui/styles/game.css';
import './legacy/game.js';

const gameApi = window.BG60;
if (!gameApi || gameApi.version !== '0.60.0-stage6') {
  throw new Error('Border Guard modular entry failed to initialize the v0.60 game API.');
}

document.documentElement.dataset.bgGameBooted = gameApi.version;
document.documentElement.dataset.bgGameWave = String(gameApi.game?.wave ?? 'unknown');
