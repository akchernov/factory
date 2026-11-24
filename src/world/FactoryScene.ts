import Phaser from 'phaser';
import type { FactoryArt } from '../art';
import { MAX_FRAME_DELTA_MS, PLAYER_SPEED_PX_PER_SECOND, START_TILE, TICK_MS, WORLD_GRID } from '../config/game';
import { tileCenter } from '../shared/grid';
import type { FactorySimulation } from '../shared/types';
import type { FactoryHud } from '../ui';

export class FactoryScene extends Phaser.Scene {
  private player!: ReturnType<FactoryArt['createPlayer']>;
  private arrows!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<'up' | 'down' | 'left' | 'right', Phaser.Input.Keyboard.Key>;
  private elapsedMs = 0;

  constructor(
    private readonly simulation: FactorySimulation,
    private readonly art: FactoryArt,
    private readonly hud: FactoryHud,
  ) {
    super('factory');
  }

  preload() {
    this.art.preload(this);
  }

  create() {
    this.elapsedMs = 0;
    const keyboard = this.input.keyboard!;
    this.arrows = keyboard.createCursorKeys();
    this.wasd = {
      up: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      down: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      left: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      right: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    };

    const { columns, rows, tileSizePx } = WORLD_GRID;
    const ground = this.add.graphics();
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < columns; col++) {
        ground.fillStyle((row + col) % 2 === 0 ? 0x385840 : 0x3c5d44);
        ground.fillRect(col * tileSizePx, row * tileSizePx, tileSizePx - 1, tileSizePx - 1);
      }
    }

    const snapshot = this.simulation.getSnapshot();
    for (const flower of snapshot.flowers) this.art.drawFlower(this, tileCenter(flower, WORLD_GRID));
    this.player = this.art.createPlayer(this, tileCenter(START_TILE, WORLD_GRID));
    this.renderSnapshot();
  }

  update(_time: number, deltaMs: number) {
    const frameMs = Math.min(deltaMs, MAX_FRAME_DELTA_MS);
    this.movePlayer(frameMs / 1000);
    this.elapsedMs += frameMs;
    if (this.elapsedMs < TICK_MS) return;
    while (this.elapsedMs >= TICK_MS) {
      this.simulation.step();
      this.elapsedMs -= TICK_MS;
    }
    this.renderSnapshot();
  }

  private renderSnapshot() {
    const snapshot = this.simulation.getSnapshot();
    this.art.syncBuildings(this, snapshot.buildings);
    this.hud.render(snapshot);
  }

  private movePlayer(deltaSeconds: number) {
    const dx = Number(this.wasd.right.isDown || this.arrows.right.isDown)
      - Number(this.wasd.left.isDown || this.arrows.left.isDown);
    const dy = Number(this.wasd.down.isDown || this.arrows.down.isDown)
      - Number(this.wasd.up.isDown || this.arrows.up.isDown);
    const distance = Math.hypot(dx, dy);
    if (distance === 0) return;

    const { columns, rows, tileSizePx } = WORLD_GRID;
    const margin = tileSizePx / 2;
    const speed = PLAYER_SPEED_PX_PER_SECOND * deltaSeconds / distance;
    this.player.setPosition(
      Phaser.Math.Clamp(this.player.x + dx * speed, margin, columns * tileSizePx - margin),
      Phaser.Math.Clamp(this.player.y + dy * speed, margin, rows * tileSizePx - margin),
    );
  }
}
