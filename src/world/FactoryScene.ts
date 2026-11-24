import Phaser from 'phaser';
import type { FactoryArt } from '../art';
import { MAX_FRAME_DELTA_MS, PLAYER_SPEED_PX_PER_SECOND, START_TILE, TICK_MS, WORLD_GRID } from '../config/game';
import { isInGrid, tileCenter, worldToTile } from '../shared/grid';
import type { BuildingKind, CommandResult, Direction, FactorySimulation, GridPosition } from '../shared/types';
import type { FactoryHud } from '../ui';

type WorldHud = Pick<FactoryHud, 'render'> & { getSelectedBuilding?(): BuildingKind };

const CLOCKWISE: Record<Direction, Direction> = {
  north: 'east', east: 'south', south: 'west', west: 'north',
};

const FACING_VECTOR: Record<Direction, readonly [number, number]> = {
  north: [0, -1], east: [1, 0], south: [0, 1], west: [-1, 0],
};

const PLACEMENT_ERRORS: Record<Extract<CommandResult, { ok: false }>['reason'], string> = {
  'out-of-bounds': 'Клетка за пределами карты',
  occupied: 'Клетка занята',
  missing: 'Объект не найден',
  'insufficient-funds': 'Не хватает монет',
  'not-implemented': 'Строительство пока недоступно',
};

export class FactoryScene extends Phaser.Scene {
  private player!: ReturnType<FactoryArt['createPlayer']>;
  private arrows!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<'up' | 'down' | 'left' | 'right', Phaser.Input.Keyboard.Key>;
  private elapsedMs = 0;
  private facing: Direction = 'east';
  private hoveredTile?: GridPosition;
  private preview!: Phaser.GameObjects.Graphics;
  private placementMessage!: Phaser.GameObjects.Text;
  private messageTimer?: Phaser.Time.TimerEvent;

  constructor(
    private readonly simulation: FactorySimulation,
    private readonly art: FactoryArt,
    private readonly hud: WorldHud,
  ) {
    super('factory');
  }

  preload() {
    this.art.preload(this);
  }

  create() {
    this.elapsedMs = 0;
    this.facing = 'east';
    this.hoveredTile = undefined;
    this.messageTimer = undefined;
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

    this.preview = this.add.graphics().setDepth(100);
    this.placementMessage = this.add.text(columns * tileSizePx / 2, 8, '', {
      backgroundColor: '#18241b',
      color: '#fff4d1',
      fontFamily: 'system-ui, sans-serif',
      fontSize: '16px',
      padding: { x: 10, y: 5 },
    }).setOrigin(0.5, 0).setDepth(101).setVisible(false);

    keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.R, false).on('down', this.rotateBuilding, this);
    this.input.on('pointermove', this.updateHover, this);
    this.input.on('gameout', this.clearHover, this);
    this.input.on('pointerdown', this.placeBuilding, this);
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

  private updateHover(pointer: Phaser.Input.Pointer) {
    const position = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const tile = worldToTile(position, WORLD_GRID);
    this.hoveredTile = isInGrid(tile, WORLD_GRID) ? tile : undefined;
    this.drawPreview();
  }

  private clearHover() {
    this.hoveredTile = undefined;
    this.drawPreview();
  }

  private rotateBuilding(event: KeyboardEvent) {
    if (event.ctrlKey || event.altKey || event.metaKey) return;
    this.facing = CLOCKWISE[this.facing];
    this.drawPreview();
  }

  private drawPreview() {
    this.preview.clear();
    if (!this.hoveredTile) return;

    const { tileSizePx } = WORLD_GRID;
    const { x, y } = tileCenter(this.hoveredTile, WORLD_GRID);
    const left = x - tileSizePx / 2 + 1;
    const top = y - tileSizePx / 2 + 1;
    const [dx, dy] = FACING_VECTOR[this.facing];
    const color = 0xffd264;

    this.preview.fillStyle(color, 0.24).fillRect(left, top, tileSizePx - 2, tileSizePx - 2);
    this.preview.lineStyle(2, color).strokeRect(left, top, tileSizePx - 2, tileSizePx - 2);
    this.preview.fillStyle(color).fillTriangle(
      x + dx * 10, y + dy * 10,
      x - dx * 6 - dy * 6, y - dy * 6 + dx * 6,
      x - dx * 6 + dy * 6, y - dy * 6 - dx * 6,
    );
  }

  private placeBuilding(pointer: Phaser.Input.Pointer) {
    if (pointer.button !== 0) return;
    this.updateHover(pointer);
    const tile = this.hoveredTile;
    if (!tile) return;

    // The starter HUD has no hotbar; Gameplay supplies the getter on its HUD.
    const kind = this.hud.getSelectedBuilding?.() ?? 'hive';
    const result = this.simulation.dispatch({ type: 'place', kind, tile, facing: this.facing });

    this.messageTimer?.remove();
    this.messageTimer = undefined;
    this.placementMessage.setVisible(!result.ok);
    if (result.ok) {
      this.renderSnapshot();
      return;
    }

    this.placementMessage.setText(PLACEMENT_ERRORS[result.reason]);
    this.messageTimer = this.time.delayedCall(2200, () => {
      this.placementMessage.setVisible(false);
      this.messageTimer = undefined;
    });
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
