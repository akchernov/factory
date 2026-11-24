import Phaser from 'phaser';
import { createArt, sfx } from './art';
import { START_TILE, WORLD_GRID } from './config/game';
import { createSimulation } from './core';
import { createHud } from './ui';
import { FactoryScene } from './world/FactoryScene';
import { generateTerrain } from './world/terrain';
import './style.css';

const app = document.querySelector<HTMLElement>('#app')!;
const fullscreenButton = document.querySelector<HTMLButtonElement>('#fullscreen')!;
const fullscreenStatus = document.querySelector<HTMLElement>('#fullscreen-status')!;
const soundButton = document.querySelector<HTMLButtonElement>('#sound-toggle')!;

soundButton.addEventListener('click', () => {
  sfx.setMuted(!sfx.isMuted());
  soundButton.textContent = sfx.isMuted() ? 'Звук: выкл' : 'Звук: вкл';
  soundButton.setAttribute('aria-pressed', String(!sfx.isMuted()));
});

if (document.fullscreenEnabled) {
  fullscreenButton.hidden = false;
  fullscreenButton.addEventListener('click', async () => {
    fullscreenStatus.textContent = '';
    try {
      if (document.fullscreenElement === app) {
        await document.exitFullscreen();
      } else {
        await app.requestFullscreen();
      }
    } catch {
      fullscreenStatus.textContent = 'Не удалось переключить режим экрана';
    }
  });
  document.addEventListener('fullscreenchange', () => {
    fullscreenButton.textContent = document.fullscreenElement === app
      ? 'В окно'
      : 'На весь экран';
  });
}

const url = new URL(location.href);
const seedParam = url.searchParams.get('seed');
const seed = seedParam && /^\d{1,10}$/.test(seedParam)
  ? Number(seedParam) >>> 0
  : crypto.getRandomValues(new Uint32Array(1))[0]!;
url.searchParams.set('seed', String(seed));
history.replaceState(history.state, '', url);
document.querySelector('#map-seed')!.textContent = `Карта ${seed}`;

const terrain = generateTerrain(WORLD_GRID, START_TILE, seed);
const simulation = createSimulation(WORLD_GRID, undefined, terrain.flowers, terrain.blocked);
const hud = createHud(document.querySelector<HTMLElement>('#hud')!);
const scene = new FactoryScene(simulation, createArt(), hud, terrain);
document.querySelector('#center-camera')!.addEventListener('click', () => scene.centerCamera());
document.querySelector('#rotate-building')!.addEventListener('click', () => scene.rotatePlacement());

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: 768,
  height: 480,
  scale: { mode: Phaser.Scale.RESIZE },
  backgroundColor: '#18241b',
  scene,
});
