import type Phaser from 'phaser';
import type { BuildingSnapshot, WorldPosition } from '../shared/types';

export interface FactoryArt {
  preload(scene: Phaser.Scene): void;
  createPlayer(scene: Phaser.Scene, position: WorldPosition): Phaser.GameObjects.Components.Transform & Phaser.GameObjects.GameObject;
  drawFlower(scene: Phaser.Scene, position: WorldPosition): void;
  syncBuildings(scene: Phaser.Scene, buildings: readonly BuildingSnapshot[]): void;
}

export function createArt(): FactoryArt {
  return {
    preload() {},
    createPlayer(scene, { x, y }) {
      return scene.add.circle(x, y, 10, 0xffd264).setStrokeStyle(2, 0x442b19).setDepth(1);
    },
    drawFlower(scene, { x, y }) {
      scene.add.circle(x, y, 6, 0xff92b2);
      scene.add.circle(x, y, 2, 0xffe296);
    },
    syncBuildings() {},
  };
}
