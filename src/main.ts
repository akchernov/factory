import Phaser from 'phaser';
import { ctl } from './game/controller';
import { createUi } from './game/ui';
import { WorldScene } from './game/WorldScene';
import './style.css';

const scene = new WorldScene();

const game = new Phaser.Game({
  type: Phaser.WEBGL,
  parent: 'game',
  backgroundColor: '#1d3a22',
  scale: { mode: Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight },
  render: { antialias: true, roundPixels: false, powerPreference: 'high-performance' },
  scene,
});

(window as unknown as { __problem: (b: never) => string | null }).__problem = (b) => scene.problemOf(b);
(window as unknown as { __scene: WorldScene }).__scene = scene;

function start() {
  ctl.started = true;
  document.body.classList.add('playing');
}

const ui = createUi(
  () => {
    ctl.reset();
    scene.resetWorld();
    start();
    ctl.save();
  },
  () => {
    if (ctl.load()) scene.resetWorld();
    start();
  },
  (x, y) => scene.focusOn(x, y),
);

game.events.on(Phaser.Core.Events.POST_STEP, () => ui.update());
window.addEventListener('beforeunload', () => ctl.save());
