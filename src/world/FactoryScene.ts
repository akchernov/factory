import Phaser from 'phaser';
import { BUILDING_TEXTURE, TEX, orientBuilding, sfx, type FactoryArt } from '../art';
import { MAX_FRAME_DELTA_MS, PLAYER_SPEED_PX_PER_SECOND, START_TILE, TICK_MS, WORLD_GRID } from '../config/game';
import { isInGrid, tileCenter, worldToTile } from '../shared/grid';
import type { BuildingKind, BuildingSnapshot, CommandResult, Direction, FactorySimulation, GridPosition, WorldPosition } from '../shared/types';
import type { FactoryHud } from '../ui';
import { drawTerrain } from './drawTerrain';
import { terrainAt, walkable, type Terrain } from './terrain';

type WorldHud = Pick<FactoryHud, 'render'> & Partial<Pick<FactoryHud,
  'getSelectedBuilding' | 'setFacing' | 'notify' | 'isSelling' | 'toggleSale'>>;

const CLOCKWISE: Record<Direction, Direction> = {
  north: 'east', east: 'south', south: 'west', west: 'north',
};
const FACING_VECTOR: Record<Direction, readonly [number, number]> = {
  north: [0, -1], east: [1, 0], south: [0, 1], west: [-1, 0],
};
const PLACEMENT_ERRORS: Record<Extract<CommandResult, { ok: false }>['reason'], string> = {
  'out-of-bounds': 'Клетка за пределами карты',
  occupied: 'Клетка занята',
  'blocked-terrain': 'Здесь нельзя строить',
  missing: 'Объект не найден',
  'insufficient-funds': 'Не хватает монет',
  'not-implemented': 'Строительство пока недоступно',
};

const PREVIEW_DEPTH = 100_000;
const WORLD_WIDTH = WORLD_GRID.columns * WORLD_GRID.tileSizePx;
const WORLD_HEIGHT = WORLD_GRID.rows * WORLD_GRID.tileSizePx;

export class FactoryScene extends Phaser.Scene {
  private player!: ReturnType<FactoryArt['createPlayer']>;
  private arrows!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<'up' | 'down' | 'left' | 'right', Phaser.Input.Keyboard.Key>;
  private elapsedMs = 0;
  private stepDistance = 0;
  private facing: Direction = 'east';
  private hoveredTile?: GridPosition;
  private pointerOver = false;
  private dragging?: WorldPosition;
  private preview!: Phaser.GameObjects.Graphics;
  private ghost!: Phaser.GameObjects.Image;
  private buildings: readonly BuildingSnapshot[] = [];
  private flowerCells = new Set<number>();

  constructor(
    private readonly simulation: FactorySimulation,
    private readonly art: FactoryArt,
    private readonly hud: WorldHud,
    private readonly terrain?: Terrain,
  ) {
    super('factory');
  }

  preload() {
    this.art.preload(this);
  }

  create() {
    this.elapsedMs = 0;
    this.stepDistance = 0;
    this.facing = 'east';
    this.hoveredTile = undefined;
    this.pointerOver = false;
    this.dragging = undefined;

    const keyboard = this.input.keyboard!;
    this.arrows = keyboard.createCursorKeys();
    this.wasd = {
      up: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      down: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      left: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      right: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    };

    if (this.terrain) drawTerrain(this, this.terrain);
    else if (this.textures.exists(TEX.grass)) {
      this.add.image(0, 0, TEX.grass).setOrigin(0).setDisplaySize(WORLD_WIDTH, WORLD_HEIGHT).setDepth(-100);
    }

    const { flowers } = this.simulation.getSnapshot();
    this.flowerCells = new Set(flowers.map(this.cellIndex));
    for (const flower of flowers) this.art.drawFlower(this, tileCenter(flower, WORLD_GRID));
    this.player = this.art.createPlayer(this, tileCenter(START_TILE, WORLD_GRID));

    const camera = this.cameras.main;
    camera.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    camera.setZoom(this.limitZoom(Math.min(1.05, camera.width / 930)));
    this.centerCamera();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.resizeCamera, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.resizeCamera, this);
    });

    this.preview = this.add.graphics().setDepth(PREVIEW_DEPTH);
    this.ghost = this.add.image(0, 0, TEX.hive).setDepth(PREVIEW_DEPTH - 1).setAlpha(0.65).setVisible(false);
    this.hud.setFacing?.(this.facing);

    window.addEventListener('keydown', this.handleShortcut);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      window.removeEventListener('keydown', this.handleShortcut);
    });
    this.input.mouse?.disableContextMenu();
    this.input.on('pointerdown', this.handlePointerDown, this);
    this.input.on('pointermove', this.handlePointerMove, this);
    this.input.on('pointerup', this.endDrag, this);
    this.input.on('pointerupoutside', this.endDrag, this);
    this.input.on('gameout', this.clearHover, this);
    this.input.on('wheel', this.zoomAtPointer, this);
    this.renderSnapshot();
  }

  update(_time: number, deltaMs: number) {
    const frameMs = Math.min(deltaMs, MAX_FRAME_DELTA_MS);
    this.movePlayer(Math.min(frameMs, 40) / 1000);
    if (this.pointerOver && !this.dragging) this.updateHover(this.input.activePointer);

    this.elapsedMs += frameMs;
    if (this.elapsedMs < TICK_MS) return;
    const money = this.simulation.getSnapshot().money;
    while (this.elapsedMs >= TICK_MS) {
      this.simulation.step();
      this.elapsedMs -= TICK_MS;
    }
    if (this.simulation.getSnapshot().money > money) sfx.sell();
    this.renderSnapshot();
  }

  centerCamera() {
    if (this.player) this.cameras.main.centerOn(this.player.x, this.player.y);
  }

  rotatePlacement() {
    if (this.hud.isSelling?.()) this.hud.toggleSale?.();
    this.facing = CLOCKWISE[this.facing];
    sfx.rotate();
    this.hud.setFacing?.(this.facing);
    if (this.preview) this.drawPreview();
  }

  private resizeCamera() {
    const camera = this.cameras.main;
    const { x, y } = camera.midPoint;
    camera.setZoom(this.limitZoom(camera.zoom));
    camera.centerOn(x, y);
  }

  private limitZoom(target: number): number {
    const camera = this.cameras.main;
    const minZoom = Math.max(0.37, camera.width / WORLD_WIDTH, camera.height / WORLD_HEIGHT);
    return Phaser.Math.Clamp(target, minZoom, Math.max(3, minZoom));
  }

  private pointerWorld(pointer: Phaser.Input.Pointer): WorldPosition {
    const camera = this.cameras.main;
    const cx = camera.width / 2;
    const cy = camera.height / 2;
    return {
      x: camera.scrollX + cx + (pointer.x - cx) / camera.zoom,
      y: camera.scrollY + cy + (pointer.y - cy) / camera.zoom,
    };
  }

  private zoomAtPointer(pointer: Phaser.Input.Pointer, _over: unknown, _dx: number, deltaY: number) {
    if (deltaY === 0) return;
    const camera = this.cameras.main;
    const world = this.pointerWorld(pointer);
    const zoom = this.limitZoom(camera.zoom * Math.exp(Phaser.Math.Clamp(-deltaY * 0.0018, -0.28, 0.28)));
    camera.setZoom(zoom);
    camera.centerOn(world.x + (camera.width / 2 - pointer.x) / zoom,
      world.y + (camera.height / 2 - pointer.y) / zoom);
    if (!this.dragging) this.updateHover(pointer);
  }

  private renderSnapshot() {
    const snapshot = this.simulation.getSnapshot();
    this.buildings = snapshot.buildings;
    this.art.syncBuildings(this, this.buildings);
    this.hud.render(snapshot);
  }

  private cellIndex(tile: GridPosition): number {
    return tile.row * WORLD_GRID.columns + tile.col;
  }

  private buildingAt(tile: GridPosition): BuildingSnapshot | undefined {
    return this.buildings.find(({ tile: at }) => at.col === tile.col && at.row === tile.row);
  }

  private updateHover(pointer: Phaser.Input.Pointer) {
    this.pointerOver = true;
    const tile = worldToTile(this.pointerWorld(pointer), WORLD_GRID);
    this.hoveredTile = isInGrid(tile, WORLD_GRID) ? tile : undefined;
    this.drawPreview();
  }

  private clearHover() {
    this.pointerOver = false;
    this.hoveredTile = undefined;
    this.drawPreview();
  }

  private handlePointerDown(pointer: Phaser.Input.Pointer) {
    if (pointer.button === 1 || (pointer.button === 0 && this.arrows.space.isDown)) {
      this.dragging = { x: pointer.x, y: pointer.y };
      this.game.canvas.style.cursor = 'grabbing';
      this.clearHover();
      return;
    }
    this.updateHover(pointer);
    if (pointer.button === 2) this.rotateHovered();
    if (pointer.button === 0 && this.hoveredTile) {
      if (this.hud.isSelling?.()) this.sellBuilding(this.hoveredTile);
      else this.placeBuilding(this.hoveredTile);
    }
  }

  private handlePointerMove(pointer: Phaser.Input.Pointer) {
    if (!this.dragging) {
      this.updateHover(pointer);
      return;
    }
    const camera = this.cameras.main;
    const dx = (this.dragging.x - pointer.x) / camera.zoom;
    const dy = (this.dragging.y - pointer.y) / camera.zoom;
    camera.setScroll(camera.clampX(camera.scrollX + dx), camera.clampY(camera.scrollY + dy));
    this.dragging = { x: pointer.x, y: pointer.y };
  }

  private endDrag() {
    if (!this.dragging) return;
    this.dragging = undefined;
    this.game.canvas.style.cursor = '';
  }

  private handleShortcut = (event: KeyboardEvent) => {
    if (event.repeat || event.ctrlKey || event.altKey || event.metaKey) return;
    if (event.code === 'KeyC') this.centerCamera();
    if (event.code === 'KeyR' && !this.dragging) this.rotateHovered();
    if (event.code === 'KeyX') this.hud.toggleSale?.();
    if (event.code === 'Escape' && this.hud.isSelling?.()) this.hud.toggleSale?.();
    if (event.code === 'Delete' && !this.dragging && this.hoveredTile) this.sellBuilding(this.hoveredTile);
  };

  private rotateHovered() {
    const building = this.hoveredTile && this.buildingAt(this.hoveredTile);
    if (!building) {
      this.rotatePlacement();
      return;
    }
    this.applyCommand(this.simulation.dispatch({
      type: 'rotate', tile: building.tile, facing: CLOCKWISE[building.facing],
    }));
    sfx.rotate();
  }

  private drawPreview() {
    this.preview.clear();
    this.ghost.setVisible(false);
    const tile = this.hoveredTile;
    if (!tile) return;

    const building = this.buildingAt(tile);
    const selling = this.hud.isSelling?.();
    if (selling && !building) return;
    const blocked = this.flowerCells.has(this.cellIndex(tile))
      || (this.terrain && !walkable(terrainAt(this.terrain, tile)));
    const { tileSizePx } = WORLD_GRID;
    const { x, y } = tileCenter(tile, WORLD_GRID);
    const left = x - tileSizePx / 2 + 1;
    const top = y - tileSizePx / 2 + 1;
    const color = blocked || selling ? 0xe48369 : 0xf4ce7d;
    this.preview.lineStyle(1.5, color, 0.95).strokeRect(left, top, tileSizePx - 2, tileSizePx - 2);
    this.preview.fillStyle(color, 0.14).fillRect(left, top, tileSizePx - 2, tileSizePx - 2);
    if (blocked || selling) return;

    const facing = building?.facing ?? this.facing;
    const [dx, dy] = FACING_VECTOR[facing];
    this.preview.fillStyle(color).fillTriangle(
      x + dx * 15, y + dy * 15,
      x + dx * 8 - dy * 4, y + dy * 8 + dx * 4,
      x + dx * 8 + dy * 4, y + dy * 8 - dx * 4,
    );
    if (building) return;
    const kind = this.selectedKind();
    const texture = BUILDING_TEXTURE[kind];
    if (this.ghost.texture.key !== texture) this.ghost.setTexture(texture);
    this.ghost.setAngle(0);
    orientBuilding(this.ghost, kind, facing);
    this.ghost.setDisplaySize(30, 30).setPosition(x, y).setVisible(true);
  }

  private selectedKind(): BuildingKind {
    return this.hud.getSelectedBuilding?.() ?? 'hive';
  }

  private placeBuilding(tile: GridPosition) {
    this.applyCommand(this.simulation.dispatch({
      type: 'place', kind: this.selectedKind(), tile, facing: this.facing,
    }));
  }

  private sellBuilding(tile: GridPosition) {
    const before = this.simulation.getSnapshot().money;
    const result = this.simulation.dispatch({ type: 'remove', tile });
    this.applyCommand(result);
    if (result.ok) {
      const refund = this.simulation.getSnapshot().money - before;
      this.hud.notify?.(`Постройка продана · +${refund} монет`);
    }
  }

  private applyCommand(result: CommandResult) {
    if (result.ok) {
      this.renderSnapshot();
      this.drawPreview();
    } else {
      sfx.reject();
      this.hud.notify?.(PLACEMENT_ERRORS[result.reason]);
    }
  }

  private canWalk(x: number, y: number): boolean {
    if (!this.terrain) return true;
    for (const [dx, dy] of [[-6, -6], [-6, 6], [6, -6], [6, 6]] as const) {
      const tile = worldToTile({ x: x + dx, y: y + dy }, WORLD_GRID);
      if (!walkable(terrainAt(this.terrain, tile))) return false;
    }
    return true;
  }

  private movePlayer(deltaSeconds: number) {
    const dx = Number(this.wasd.right.isDown || this.arrows.right.isDown)
      - Number(this.wasd.left.isDown || this.arrows.left.isDown);
    const dy = Number(this.wasd.down.isDown || this.arrows.down.isDown)
      - Number(this.wasd.up.isDown || this.arrows.up.isDown);
    const distance = Math.hypot(dx, dy);
    if (distance === 0) return;

    const margin = WORLD_GRID.tileSizePx / 2;
    const speed = PLAYER_SPEED_PX_PER_SECOND * deltaSeconds / distance;
    const x = Phaser.Math.Clamp(this.player.x + dx * speed, margin, WORLD_WIDTH - margin);
    const y = Phaser.Math.Clamp(this.player.y + dy * speed, margin, WORLD_HEIGHT - margin);
    const previousX = this.player.x;
    const previousY = this.player.y;
    if (this.canWalk(x, this.player.y)) this.player.x = x;
    if (this.canWalk(this.player.x, y)) this.player.y = y;
    const travelled = Math.hypot(this.player.x - previousX, this.player.y - previousY);
    if (travelled === 0) return;
    if (!this.dragging) this.centerCamera();
    this.stepDistance += travelled;
    if (this.stepDistance >= 44) {
      sfx.walk();
      this.stepDistance %= 44;
    }
  }
}
