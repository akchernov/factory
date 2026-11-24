import Phaser from 'phaser';
import { createArt } from './art';
import { WORLD_GRID } from './config/game';
import { createSimulation } from './core';
import { createHud } from './ui';
import { FactoryScene } from './world/FactoryScene';
import './style.css';

const simulation = createSimulation(WORLD_GRID);
const hud = createHud(document.querySelector<HTMLParagraphElement>('#hud')!);
const scene = new FactoryScene(simulation, createArt(), hud);

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: 768,
  height: 480,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene,
});
