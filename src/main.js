import './ui/styles/base.css';
import './ui/styles/topbar.css';
import './ui/styles/subbar.css';
import './ui/styles/hud.css';
import './ui/styles/dock.css';
import './ui/styles/feedback.css';
import './ui/styles/modals.css';
import './ui/styles/meta.css';
import './ui/styles/compact-ui.css';
import './ui/styles/visual.css';
import { bootBrowserGame } from './app/bootstrap.js';

bootBrowserGame();

const gameApi = window.BG60;
if (!gameApi || gameApi.version !== '0.60.0-stage6') {
  throw new Error('Border Guard modular entry failed to initialize the v0.60 game API.');
}

document.documentElement.dataset.bgGameBooted = gameApi.version;
document.documentElement.dataset.bgGameWave = String(gameApi.game?.wave ?? 'unknown');
