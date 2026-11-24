import type Phaser from 'phaser';

/**
 * All textures are drawn in code at load time: no external files, works offline
 * and in the one-file Vercel build. Replace any key with a real PNG in
 * public/assets/ later (scene.load.image(KEY, 'assets/x.png')) and nothing else changes.
 */
export const TEX = {
  player: 'art-player',
  flower: 'art-flower',
  flowerB: 'art-flower-b',
  hive: 'art-hive',
  belt: 'art-belt',
  extractor: 'art-extractor',
  packer: 'art-packer',
  market: 'art-market',
  bee: 'art-bee',
  shadow: 'art-shadow',
  spark: 'art-spark',
  nectar: 'art-item-nectar',
  comb: 'art-item-comb',
  honey: 'art-item-honey',
  jar: 'art-item-jar',
} as const;

const T = 32; // tile size

type G = Phaser.GameObjects.Graphics;

function make(scene: Phaser.Scene, key: string, w: number, h: number, draw: (g: G) => void) {
  if (scene.textures.exists(key)) return;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  draw(g);
  g.generateTexture(key, w, h);
  g.destroy();
}

function hex(g: G, cx: number, cy: number, r: number, fill: number, line?: number) {
  const pts: Phaser.Types.Math.Vector2Like[] = [];
  for (let i = 0; i < 6; i++) {
    const a = Math.PI / 3 * i + Math.PI / 6;
    pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
  }
  g.fillStyle(fill).fillPoints(pts, true);
  if (line !== undefined) g.lineStyle(1, line).strokePoints(pts, true);
}

export function createTextures(scene: Phaser.Scene) {
  // Soft round shadow under buildings and the player.
  make(scene, TEX.shadow, 32, 12, (g) => {
    g.fillStyle(0x000000, 0.18).fillEllipse(16, 6, 30, 10);
    g.fillStyle(0x000000, 0.14).fillEllipse(16, 6, 22, 7);
  });

  // Beekeeper: white suit, veil hat, top-down-ish.
  make(scene, TEX.player, 24, 28, (g) => {
    g.fillStyle(0x3b2a1a).fillRoundedRect(5, 22, 5, 5, 2).fillRoundedRect(14, 22, 5, 5, 2); // boots
    g.fillStyle(0xf4efe0).fillRoundedRect(4, 11, 16, 13, 5); // suit
    g.lineStyle(1, 0xb9b09a).strokeRoundedRect(4, 11, 16, 13, 5);
    g.fillStyle(0xe6dcc4).fillRoundedRect(1, 13, 5, 8, 2).fillRoundedRect(18, 13, 5, 8, 2); // arms
    g.fillStyle(0xffd264).fillCircle(12, 8, 7); // hat brim
    g.fillStyle(0xf1c24a).fillCircle(12, 7, 4.5);
    g.fillStyle(0x2a2a2a, 0.55).fillRect(7, 9, 10, 4); // veil mesh
    g.fillStyle(0xffe9b0).fillCircle(9.5, 10.5, 1).fillCircle(14.5, 10.5, 1);
  });

  // Two flower variants for variety.
  const flower = (key: string, petal: number, center: number) => make(scene, key, T, T, (g) => {
    g.fillStyle(0x4f8a3c).fillRect(15, 16, 2, 12);
    g.fillStyle(0x5fa548).fillEllipse(11, 24, 8, 4).fillEllipse(21, 22, 8, 4);
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 3 * i;
      g.fillStyle(petal).fillCircle(16 + Math.cos(a) * 6, 12 + Math.sin(a) * 6, 4.5);
    }
    g.fillStyle(center).fillCircle(16, 12, 4);
    g.fillStyle(0xffffff, 0.35).fillCircle(14.5, 10.5, 1.5);
  });
  flower(TEX.flower, 0xff92b2, 0xffe296);
  flower(TEX.flowerB, 0xfff3c4, 0xf2a93b);

  // Skep-style hive: stacked straw rings and an entrance.
  make(scene, TEX.hive, T, T, (g) => {
    g.fillStyle(0x7a4e26).fillRect(4, 26, 24, 4);
    const rings = [0xd9a54a, 0xcf9a3e, 0xd9a54a, 0xcf9a3e, 0xc48e35];
    rings.forEach((c, i) => {
      const w = 24 - i * 3.5;
      g.fillStyle(c).fillRoundedRect(16 - w / 2, 22 - i * 4.5, w, 6, 3);
      g.lineStyle(1, 0x8a5d24, 0.8).strokeRoundedRect(16 - w / 2, 22 - i * 4.5, w, 6, 3);
    });
    g.fillStyle(0xe8bb5c).fillCircle(16, 3.5, 3);
    g.fillStyle(0x3a240e).fillEllipse(16, 24, 7, 4); // entrance
  });

  // Belt tile: dark rubber with chevrons pointing east (rotated in-game).
  make(scene, TEX.belt, T, T, (g) => {
    g.fillStyle(0x5c5f66).fillRect(0, 3, T, T - 6);
    g.fillStyle(0x2f3136).fillRect(0, 5, T, T - 10);
    g.fillStyle(0x8c9098).fillRect(0, 3, T, 2).fillRect(0, T - 5, T, 2);
    g.lineStyle(3, 0xffc23d, 0.9);
    for (const x of [4, 20]) {
      g.beginPath();
      g.moveTo(x, 10); g.lineTo(x + 6, 16); g.lineTo(x, 22);
      g.strokePath();
    }
  });

  // Honey extractor: steel drum with a crank.
  make(scene, TEX.extractor, T, T, (g) => {
    g.fillStyle(0x7d8792).fillRoundedRect(4, 6, 24, 22, 6);
    g.fillStyle(0xaeb8c2).fillRoundedRect(6, 8, 20, 6, 3);
    g.lineStyle(1, 0x4d5560).strokeRoundedRect(4, 6, 24, 22, 6);
    g.fillStyle(0x5b6470).fillCircle(16, 18, 6);
    g.fillStyle(0xf2b134).fillCircle(16, 18, 3);
    g.fillStyle(0x3b2a1a).fillRect(15, 1, 2, 6).fillRect(15, 1, 8, 2); // crank
    g.fillStyle(0xf2b134).fillRect(26, 22, 4, 3); // spout
  });

  // Packer: wooden table with a jar.
  make(scene, TEX.packer, T, T, (g) => {
    g.fillStyle(0x8b5a2b).fillRoundedRect(2, 8, 28, 20, 3);
    g.fillStyle(0xa86f38).fillRect(2, 8, 28, 4);
    g.lineStyle(1, 0x5d3a19).strokeRoundedRect(2, 8, 28, 20, 3);
    g.fillStyle(0xf6d36b, 0.95).fillRoundedRect(10, 12, 12, 13, 3);
    g.fillStyle(0xe39b1f).fillRect(10, 18, 12, 7);
    g.fillStyle(0xc0392b).fillRect(9, 10, 14, 3);
    g.fillStyle(0xffffff, 0.5).fillRect(12, 14, 2, 8);
  });

  // Market stall with a striped awning.
  make(scene, TEX.market, T, T, (g) => {
    g.fillStyle(0x7a4e26).fillRect(4, 12, 3, 18).fillRect(25, 12, 3, 18);
    g.fillStyle(0xb7834a).fillRect(3, 20, 26, 9);
    for (let i = 0; i < 5; i++) g.fillStyle(i % 2 ? 0xfff4d1 : 0xd9473a).fillRect(2 + i * 5.6, 4, 5.6, 9);
    g.fillStyle(0xd9473a);
    for (let i = 0; i < 5; i++) g.fillCircle(4.8 + i * 5.6, 13, 2.8);
    g.fillStyle(0xf2b134).fillCircle(10, 20, 3).fillCircle(16, 20, 3).fillCircle(22, 20, 3);
  });

  // Bee: 8x6, wings drawn separately by the flutter tween via scaleY.
  make(scene, TEX.bee, 10, 8, (g) => {
    g.fillStyle(0xdff3ff, 0.85).fillEllipse(4, 2, 5, 4).fillEllipse(7, 2, 4, 3);
    g.fillStyle(0xf7c531).fillEllipse(5, 5, 8, 5);
    g.fillStyle(0x2a1d0e).fillRect(4, 3, 1.5, 4).fillRect(6.5, 3, 1.5, 4);
    g.fillStyle(0x2a1d0e).fillCircle(9, 5, 1.3);
  });

  make(scene, TEX.spark, 6, 6, (g) => {
    g.fillStyle(0xffffff).fillCircle(3, 3, 3);
  });

  // Belt items, 12x12.
  make(scene, TEX.nectar, 12, 12, (g) => {
    g.fillStyle(0xfff0a0).fillCircle(6, 7, 4);
    g.fillStyle(0xffffff, 0.6).fillCircle(4.5, 5.5, 1.2);
  });
  make(scene, TEX.comb, 12, 12, (g) => {
    hex(g, 6, 6, 5.5, 0xe9a92a, 0x9a6512);
    hex(g, 6, 6, 2.5, 0xffd463);
  });
  make(scene, TEX.honey, 12, 12, (g) => {
    g.fillStyle(0xe08e0b).fillCircle(6, 7.5, 4);
    g.fillTriangle(6, 1, 2.5, 6.5, 9.5, 6.5);
    g.fillStyle(0xffffff, 0.5).fillCircle(4.5, 7, 1.2);
  });
  make(scene, TEX.jar, 12, 12, (g) => {
    g.fillStyle(0xc0392b).fillRect(3, 1, 6, 2.5);
    g.fillStyle(0xf2a31b).fillRoundedRect(2, 3, 8, 8.5, 2);
    g.fillStyle(0xfff4d1).fillRect(3, 6, 6, 2.5);
  });
}
