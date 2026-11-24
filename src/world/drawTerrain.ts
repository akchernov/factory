import Phaser from 'phaser';
import { TEX } from '../art';
import { tileCenter } from '../shared/grid';
import type { RiverSection, Terrain } from './terrain';

const CHUNK_TILES = 16;

function makeRiver(river: readonly RiverSection[], tileSize: number, bank: number): Path2D {
  const path = new Path2D();
  const edge = (section: RiverSection, side: 'left' | 'right') =>
    section[side] * tileSize + (side === 'left' ? -bank : bank);
  const first = river[0]!;
  const last = river[river.length - 1]!;
  const height = river.length * tileSize;

  path.moveTo(edge(first, 'left'), 0);
  for (let row = 0; row < river.length - 1; row++) {
    const x = edge(river[row]!, 'left');
    const next = edge(river[row + 1]!, 'left');
    path.quadraticCurveTo(x, (row + 0.5) * tileSize, (x + next) / 2, (row + 1) * tileSize);
  }
  path.lineTo(edge(last, 'left'), height);
  path.lineTo(edge(last, 'right'), height);
  for (let row = river.length - 1; row > 0; row--) {
    const x = edge(river[row]!, 'right');
    const next = edge(river[row - 1]!, 'right');
    path.quadraticCurveTo(x, (row + 0.5) * tileSize, (x + next) / 2, row * tileSize);
  }
  path.lineTo(edge(first, 'right'), 0);
  path.closePath();
  return path;
}

function makePattern(source: CanvasImageSource | undefined, terrain: Terrain) {
  const canvas = document.createElement('canvas');
  canvas.width = 384;
  canvas.height = 240;
  const ctx = canvas.getContext('2d')!;
  if (source) ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  else {
    ctx.fillStyle = '#4b6334';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.fillStyle = 'rgba(22, 35, 32, 0.27)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const water = document.createElement('canvas');
  water.width = 256;
  water.height = 128;
  const waves = water.getContext('2d')!;
  waves.fillStyle = '#235063';
  waves.fillRect(0, 0, water.width, water.height);
  const random = new Phaser.Math.RandomDataGenerator([String(terrain.seed)]);
  for (let i = 0; i < 125; i++) {
    const x = random.between(1, water.width - 29);
    const y = random.between(2, water.height - 1);
    const length = random.between(4, 27);
    waves.strokeStyle = i % 3 === 0 ? 'rgba(181, 228, 222, 0.17)' : 'rgba(89, 162, 163, 0.22)';
    waves.lineWidth = random.realInRange(0.4, 1.4);
    waves.beginPath();
    waves.moveTo(x, y);
    waves.quadraticCurveTo(x + length / 2, y - 2, x + length, y);
    waves.stroke();
  }
  return { grass: canvas, water };
}

function drawBridge(ctx: CanvasRenderingContext2D, terrain: Terrain, row: number) {
  const { tileSizePx: size } = terrain.grid;
  const a = terrain.river[row]!;
  const b = terrain.river[row + 1]!;
  const x = Math.min(a.left, b.left) * size - 11;
  const width = (Math.max(a.right, b.right) * size + 11) - x;
  const y = row * size;
  ctx.fillStyle = 'rgba(10, 23, 24, 0.45)';
  ctx.fillRect(x - 5, y + 5, width + 10, 2 * size + 7);
  ctx.fillStyle = '#493625';
  ctx.fillRect(x, y, width, 2 * size);
  for (let step = 2; step < width - 2; step += 7) {
    ctx.fillStyle = step % 3 === 0 ? '#a78150' : '#876641';
    ctx.fillRect(x + step, y + 4, Math.min(6, width - step), 2 * size - 8);
  }
  ctx.fillStyle = '#be9c65';
  ctx.fillRect(x, y + 2, width, 3);
  ctx.fillRect(x, y + 2 * size - 5, width, 3);
}

export function drawTerrain(scene: Phaser.Scene, terrain: Terrain) {
  const { columns, rows, tileSizePx: size } = terrain.grid;
  const grass = scene.textures.get(TEX.grass).getSourceImage();
  const pattern = makePattern(grass instanceof HTMLImageElement ? grass : undefined, terrain);
  const bank = makeRiver(terrain.river, size, 9);
  const shallows = makeRiver(terrain.river, size, 3);
  const river = makeRiver(terrain.river, size, -5);
  const textureKeys: string[] = [];

  for (let row = 0; row < rows; row += CHUNK_TILES) {
    for (let col = 0; col < columns; col += CHUNK_TILES) {
      const x = col * size;
      const y = row * size;
      const width = Math.min(CHUNK_TILES, columns - col) * size;
      const height = Math.min(CHUNK_TILES, rows - row) * size;
      const key = `terrain-${terrain.seed}-${col}-${row}`;
      const texture = scene.textures.createCanvas(key, width, height)!;
      const ctx = texture.context;
      ctx.translate(-x, -y);
      ctx.fillStyle = ctx.createPattern(pattern.grass, 'repeat')!;
      ctx.fillRect(x, y, width, height);

      const light = ctx.createRadialGradient(columns * size * 0.52, rows * size * 0.48, 80,
        columns * size * 0.52, rows * size * 0.48, rows * size * 0.63);
      light.addColorStop(0, 'rgba(190, 184, 98, 0.13)');
      light.addColorStop(1, 'rgba(11, 31, 32, 0.26)');
      ctx.fillStyle = light;
      ctx.fillRect(x, y, width, height);

      ctx.fillStyle = '#908463';
      ctx.fill(bank);
      ctx.fillStyle = '#43817f';
      ctx.fill(shallows);
      ctx.fillStyle = ctx.createPattern(pattern.water, 'repeat')!;
      ctx.fill(river);
      for (const bridge of terrain.bridges) drawBridge(ctx, terrain, bridge);

      for (let tileRow = Math.max(0, row - 1); tileRow < Math.min(rows, row + height / size + 1); tileRow++) {
        for (let tileCol = Math.max(0, col - 1); tileCol < Math.min(columns, col + width / size + 1); tileCol++) {
          if (terrain.tiles[tileRow * columns + tileCol] !== 'rock') continue;
          ctx.fillStyle = 'rgba(129, 125, 105, 0.36)';
          ctx.beginPath();
          ctx.arc((tileCol + 0.5) * size, (tileRow + 0.5) * size, size * 0.69, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      texture.refresh();
      textureKeys.push(key);
      scene.add.image(x, y, key).setOrigin(0).setDepth(-100);
    }
  }

  for (const prop of terrain.props) {
    const center = tileCenter(prop.tile, terrain.grid);
    const { col, row } = prop.tile;
    const x = center.x + ((col * 71 + row * 13 + terrain.seed) % 17) - 8;
    const y = center.y + ((col * 17 + row * 61 + terrain.seed) % 15) - 7;
    const key = prop.kind === 'tree' ? TEX.trees : TEX.rocks;
    if (!scene.textures.exists(key)) continue;
    const size = prop.kind === 'tree' && prop.variant === 3 ? prop.size * 0.73 : prop.size;
    scene.add.ellipse(x + size * 0.08, y, size * 0.53, size * 0.23, 0x101d16, 0.28)
      .setDepth(-30);
    scene.add.image(x, y + 5, key, prop.variant).setOrigin(0.5, 0.91)
      .setDisplaySize(size, size).setFlipX((col + row + terrain.seed) % 2 === 0).setDepth(y);
  }

  scene.events.once('shutdown', () => {
    for (const key of textureKeys) scene.textures.remove(key);
  });
}
