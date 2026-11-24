import Phaser from 'phaser';
import type { BuildingKind, BuildingSnapshot, Direction, Resource, WorldPosition } from '../shared/types';
import { sfx } from './sound';
import { TEX, createTextures } from './textures';

export { sfx } from './sound';
export { TEX } from './textures';

export interface FactoryArt {
  preload(scene: Phaser.Scene): void;
  createPlayer(scene: Phaser.Scene, position: WorldPosition): Phaser.GameObjects.Components.Transform & Phaser.GameObjects.GameObject;
  drawFlower(scene: Phaser.Scene, position: WorldPosition): void;
  syncBuildings(scene: Phaser.Scene, buildings: readonly BuildingSnapshot[]): void;
}

const TILE = 32;
const HALF = TILE / 2;
const BEE_RANGE_PX = TILE * 2.5;
const BEES_PER_HIVE = 3;

const ANGLE: Record<Direction, number> = { east: 0, south: 90, west: 180, north: -90 };
const BODY: Record<BuildingKind, string> = {
  hive: TEX.hive,
  conveyor: TEX.belt,
  extractor: TEX.extractor,
  packer: TEX.packer,
  market: TEX.market,
};
const ITEM: Record<Resource, string> = { nectar: TEX.nectar, comb: TEX.comb, honey: TEX.honey, jar: TEX.jar };
/** Which resource a building shows as its "product" (for the icon and the produce burst). */
const PRODUCT: Partial<Record<BuildingKind, Resource>> = { hive: 'comb', extractor: 'honey', packer: 'jar' };
const RESOURCES: readonly Resource[] = ['jar', 'honey', 'comb', 'nectar'];

interface View {
  kind: BuildingKind;
  root: Phaser.GameObjects.Container;
  body: Phaser.GameObjects.Image | Phaser.GameObjects.TileSprite;
  item: Phaser.GameObjects.Image;
  bees: Phaser.GameObjects.Image[];
  lastProduct: number;
  lastTotal: number;
}

function center(b: BuildingSnapshot): WorldPosition {
  return { x: b.tile.col * TILE + HALF, y: b.tile.row * TILE + HALF };
}

function total(b: BuildingSnapshot): number {
  return b.inventory.nectar + b.inventory.comb + b.inventory.honey + b.inventory.jar;
}

export function createArt(): FactoryArt {
  const views = new Map<string, View>();
  const flowers: WorldPosition[] = [];
  let flowerIndex = 0;
  let sparks: Phaser.GameObjects.Particles.ParticleEmitter | null = null;
  let beltScroll: Phaser.Time.TimerEvent | null = null;

  function burst(scene: Phaser.Scene, x: number, y: number, tint: number, count = 6) {
    sparks ??= scene.add.particles(0, 0, TEX.spark, {
      speed: { min: 20, max: 60 },
      lifespan: 450,
      scale: { start: 0.8, end: 0 },
      alpha: { start: 0.9, end: 0 },
      gravityY: 60,
      emitting: false,
    }).setDepth(30);
    sparks.setParticleTint(tint);
    sparks.explode(count, x, y);
  }

  /** Bee loops hive -> random nearby flower -> hive with a buzzing wobble. */
  function flyBee(scene: Phaser.Scene, bee: Phaser.GameObjects.Image, home: WorldPosition) {
    if (!bee.active) return;
    const near = flowers.filter((f) => Phaser.Math.Distance.Between(f.x, f.y, home.x, home.y) <= BEE_RANGE_PX);
    const target = near.length
      ? Phaser.Utils.Array.GetRandom(near)
      : { x: home.x + Phaser.Math.Between(-20, 20), y: home.y + Phaser.Math.Between(-20, 20) };
    const out = { x: target.x + Phaser.Math.Between(-6, 6), y: target.y + Phaser.Math.Between(-8, 2) };
    bee.setFlipX(out.x < bee.x);
    scene.tweens.chain({
      targets: bee,
      tweens: [
        { x: out.x, y: out.y, duration: Phaser.Math.Between(900, 1500), ease: 'Sine.easeInOut' },
        { x: out.x + 2, duration: 150, yoyo: true, repeat: Phaser.Math.Between(2, 4) }, // hover on the flower
        {
          x: home.x + Phaser.Math.Between(-4, 4), y: home.y + 4, duration: Phaser.Math.Between(900, 1500), ease: 'Sine.easeInOut',
          onStart: () => bee.setFlipX(home.x < bee.x),
        },
      ],
      onComplete: () => scene.time.delayedCall(Phaser.Math.Between(200, 900), () => flyBee(scene, bee, home)),
    });
  }

  function createView(scene: Phaser.Scene, b: BuildingSnapshot): View {
    const { x, y } = center(b);
    const root = scene.add.container(x, y).setDepth(b.kind === 'conveyor' ? 2 : 5);
    const parts: Phaser.GameObjects.GameObject[] = [];
    let body: View['body'];

    if (b.kind === 'conveyor') {
      // TileSprite lets the chevrons scroll; the whole sprite rotates by facing.
      body = scene.add.tileSprite(0, 0, TILE, TILE, TEX.belt).setAngle(ANGLE[b.facing]);
      parts.push(body);
    } else {
      parts.push(scene.add.image(0, 12, TEX.shadow));
      body = scene.add.image(0, 0, BODY[b.kind]);
      parts.push(body);
      // Small arrow shows where the building outputs.
      if (b.kind !== 'market') {
        const arrow = scene.add.triangle(0, 0, 0, -4, 6, 0, 0, 4, 0xffd264).setAlpha(0.85);
        const a = Phaser.Math.DegToRad(ANGLE[b.facing]);
        arrow.setPosition(Math.cos(a) * 14, Math.sin(a) * 14).setRotation(a);
        parts.push(arrow);
      }
    }
    const item = scene.add.image(0, b.kind === 'conveyor' ? 0 : -14, TEX.comb).setVisible(false);
    parts.push(item);
    root.add(parts);

    // Pop-in on placement.
    root.setScale(0.2);
    scene.tweens.add({ targets: root, scale: 1, duration: 260, ease: 'Back.easeOut' });
    burst(scene, x, y, 0xfff4d1, 8);
    sfx.place();

    const bees: Phaser.GameObjects.Image[] = [];
    if (b.kind === 'hive') {
      for (let i = 0; i < BEES_PER_HIVE; i++) {
        const bee = scene.add.image(x, y + 4, TEX.bee).setDepth(20);
        scene.tweens.add({ targets: bee, scaleY: 0.8, duration: 60, yoyo: true, repeat: -1 }); // wing flutter
        bees.push(bee);
        scene.time.delayedCall(i * 500, () => flyBee(scene, bee, { x, y }));
      }
      // Gentle breathing so a hive looks alive.
      scene.tweens.add({ targets: body, scaleY: 1.04, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }
    if (b.kind === 'extractor') {
      scene.tweens.add({ targets: body, angle: { from: -2, to: 2 }, duration: 120, yoyo: true, repeat: -1, paused: true });
    }

    return { kind: b.kind, root, body, item, bees, lastProduct: 0, lastTotal: 0 };
  }

  function destroyView(scene: Phaser.Scene, view: View) {
    for (const bee of view.bees) {
      scene.tweens.killTweensOf(bee);
      bee.destroy();
    }
    scene.tweens.killTweensOf(view.body);
    burst(scene, view.root.x, view.root.y, 0x9a8a70, 10);
    sfx.remove();
    scene.tweens.add({
      targets: view.root, scale: 0, alpha: 0, duration: 180, ease: 'Back.easeIn',
      onComplete: () => view.root.destroy(),
    });
  }

  function updateView(scene: Phaser.Scene, view: View, b: BuildingSnapshot) {
    // Item icon: belts show what they carry, machines show their product stock.
    const shown = b.kind === 'conveyor'
      ? RESOURCES.find((r) => b.inventory[r] > 0)
      : PRODUCT[b.kind] && b.inventory[PRODUCT[b.kind]!] > 0 ? PRODUCT[b.kind] : undefined;
    if (shown) view.item.setTexture(ITEM[shown]).setVisible(true);
    else view.item.setVisible(false);

    const product = PRODUCT[b.kind];
    if (product) {
      const now = b.inventory[product];
      if (now > view.lastProduct) {
        burst(scene, view.root.x, view.root.y - 8, product === 'jar' ? 0xff7043 : 0xffc23d, 5);
        scene.tweens.add({ targets: view.body, scaleX: 1.12, scaleY: 0.9, duration: 90, yoyo: true });
        if (b.kind !== 'hive') sfx.produce();
      }
      view.lastProduct = now;
    }

    // Extractor shakes only while it has input to work on.
    if (b.kind === 'extractor') {
      const tween = scene.tweens.getTweensOf(view.body)[0];
      if (b.inventory.comb > 0) tween?.resume();
      else { tween?.pause(); view.body.setAngle(0); }
    }
    view.lastTotal = total(b);
  }

  return {
    preload(scene) {
      // Real PNGs from public/assets/ can be loaded here with the same TEX keys.
      createTextures(scene);
    },
    createPlayer(scene, { x, y }) {
      createTextures(scene);
      const root = scene.add.container(x, y).setDepth(10);
      const shadow = scene.add.image(0, 12, TEX.shadow).setScale(0.7);
      const body = scene.add.image(0, 0, TEX.player);
      root.add([shadow, body]);
      // Walk bob: runs only while the container is moving.
      let lastX = x;
      let lastY = y;
      scene.events.on(Phaser.Scenes.Events.UPDATE, (time: number) => {
        if (!root.active) return;
        const moving = root.x !== lastX || root.y !== lastY;
        if (moving) {
          body.y = Math.sin(time / 70) * 1.5;
          body.angle = Math.sin(time / 90) * 4;
          if (root.x !== lastX) body.setFlipX(root.x < lastX);
        } else {
          body.y *= 0.8;
          body.angle *= 0.8;
        }
        lastX = root.x;
        lastY = root.y;
      });
      return root;
    },
    drawFlower(scene, position) {
      createTextures(scene);
      flowers.push(position);
      const key = flowerIndex++ % 3 === 2 ? TEX.flowerB : TEX.flower;
      const flower = scene.add.image(position.x, position.y, key).setDepth(1);
      // Sway in the wind with a per-flower phase.
      scene.tweens.add({
        targets: flower, angle: { from: -4, to: 4 }, duration: Phaser.Math.Between(1400, 2000),
        yoyo: true, repeat: -1, ease: 'Sine.easeInOut', delay: Phaser.Math.Between(0, 800),
      });
    },
    syncBuildings(scene, buildings) {
      beltScroll ??= scene.time.addEvent({
        delay: 50, loop: true,
        callback: () => {
          for (const v of views.values()) {
            if (v.kind === 'conveyor') (v.body as Phaser.GameObjects.TileSprite).tilePositionX -= 1;
          }
        },
      });

      const seen = new Set<string>();
      for (const b of buildings) {
        seen.add(b.id);
        let view = views.get(b.id);
        if (!view) {
          view = createView(scene, b);
          views.set(b.id, view);
        }
        updateView(scene, view, b);
      }
      for (const [id, view] of views) {
        if (seen.has(id)) continue;
        destroyView(scene, view);
        views.delete(id);
      }
    },
  };
}

/** Optional helpers for World/UI: floating "+12" over the market, coin sound, etc. */
export const fx = {
  sale(scene: Phaser.Scene, at: WorldPosition, amount: number) {
    const t = scene.add.text(at.x, at.y - 10, `+${amount}`, {
      fontFamily: 'system-ui, sans-serif', fontSize: '13px', fontStyle: 'bold', color: '#ffd264', stroke: '#2a1d0e', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(31);
    scene.tweens.add({ targets: t, y: at.y - 34, alpha: 0, duration: 900, ease: 'Cubic.easeOut', onComplete: () => t.destroy() });
    sfx.sell();
  },
};
