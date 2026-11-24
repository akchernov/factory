import Phaser from 'phaser';
import { BUILDINGS, FLOWER_IDS, FLOWERS, HIVE, ITEMS, SPECIES, type BuildingId, type ItemId } from '../core/data';
import { Terrain } from '../core/map';
import { DX, DY, FAIL_TEXT, type Building, type Dir, type GameEvent } from '../core/sim';
import { audio } from './audio';
import { ctl } from './controller';
import { BELT_FRAMES, TILE, createProceduralTextures } from './textures';

const SPRITES = [
  'b_hive', 'b_extractor', 'b_packer', 'b_brewery', 'b_market', 'b_lab', 'b_breeder', 'b_chest', 'b_chandlery', 'b_monument', 'b_well',
  'bee', 'p_down', 'p_left', 'p_right',
  'd_oak', 'd_linden', 'd_pine', 'd_rock', 'd_bush', 'd_stump', 'd_lily',
  'f_sunflower', 'f_lavender', 'f_poppy', 'f_heather', 'f_daisy', 'f_buckwheat',
  'i_nectar', 'i_comb', 'i_honey', 'i_jar', 'i_wax', 'i_candle', 'i_mead', 'i_jelly', 'i_research', 'i_bee', 'i_pollen',
  'i_propolis', 'i_coin', 'i_lavender', 'i_cake',
];

const BELT_TYPES = new Set<BuildingId>(['belt', 'belt2', 'belt3']);
const ANGLE = [0, 90, 180, 270];

interface View {
  b: Building;
  root: Phaser.GameObjects.Container;
  body: Phaser.GameObjects.Sprite | Phaser.GameObjects.Image;
  items: Phaser.GameObjects.Image[];
  bees: Bee[];
  bubble?: Phaser.GameObjects.Container;
  glow?: Phaser.GameObjects.Image;
  smoke?: Phaser.GameObjects.Particles.ParticleEmitter;
  workTween?: Phaser.Tweens.Tween;
  curve: boolean;
  dir: Dir;
}

interface Bee {
  img: Phaser.GameObjects.Image;
  state: 'out' | 'in' | 'home';
  tx: number;
  ty: number;
  wait: number;
  speed: number;
}

export class WorldScene extends Phaser.Scene {
  private views = new Map<number, View>();
  private ghost!: Phaser.GameObjects.Container;
  private ghostImg!: Phaser.GameObjects.Image | Phaser.GameObjects.Sprite;
  private ghostArrow!: Phaser.GameObjects.Image;
  private ghostRange!: Phaser.GameObjects.Graphics;
  private ghostText!: Phaser.GameObjects.Text;
  private selectGfx!: Phaser.GameObjects.Graphics;
  private night!: Phaser.GameObjects.Rectangle;
  private glowLayer!: Phaser.GameObjects.Layer;
  private player!: Phaser.GameObjects.Container;
  private playerImg!: Phaser.GameObjects.Image;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private acc = 0;
  private dragging = false;
  private dragStart: { x: number; y: number } | null = null;
  private lastDragTile: { x: number; y: number } | null = null;
  private panning: { x: number; y: number; sx: number; sy: number } | null = null;
  private terrainLayer!: Phaser.GameObjects.Layer;
  private decoByIdx = new Map<number, Phaser.GameObjects.Image[]>();
  private addDeco(i: number, img: Phaser.GameObjects.Image) {
    const list = this.decoByIdx.get(i);
    if (list) list.push(img);
    else this.decoByIdx.set(i, [img]);
  }
  private beltFrame = 0;
  private sparks!: Phaser.GameObjects.Particles.ParticleEmitter;
  private dust!: Phaser.GameObjects.Particles.ParticleEmitter;
  private pollen!: Phaser.GameObjects.Particles.ParticleEmitter;
  private fireflies!: Phaser.GameObjects.Particles.ParticleEmitter;
  private butterflies: { img: Phaser.GameObjects.Image; vx: number; vy: number; t: number }[] = [];
  private eventsBound = false;

  constructor() {
    super('world');
  }

  preload() {
    const base = import.meta.env.BASE_URL;
    for (const k of SPRITES) this.load.image(k, `${base}assets/${k}.webp`);
    this.load.image('grass', `${base}assets/grass.webp`);
  }

  create() {
    createProceduralTextures(this);
    for (const key of ['belt', 'belt2', 'belt3']) {
      for (const suffix of ['_s', '_c']) {
        this.anims.create({
          key: key + suffix,
          frames: this.anims.generateFrameNumbers(key + suffix, { start: 0, end: BELT_FRAMES - 1 }),
          frameRate: 1, // driven manually by speed
          repeat: -1,
        });
      }
    }
    this.buildWorld();
    this.setupInput();
    this.setupFx();
    if (!this.eventsBound) {
      ctl.on((e) => this.onEvent(e));
      this.eventsBound = true;
    }
    this.syncAll();
    const s = ctl.game.map.start;
    this.cameras.main.centerOn((s.x + 0.5) * TILE, (s.y + 0.5) * TILE).setZoom(0.85);
  }

  /** Rebuild everything after loading a different game. */
  resetWorld() {
    this.scene.restart();
  }

  // ---------------------------------------------------------------- world

  private buildWorld() {
    const g = ctl.game;
    const W = g.w * TILE;
    const H = g.h * TILE;
    this.cameras.main.setBounds(-TILE * 4, -TILE * 4, W + TILE * 8, H + TILE * 8);
    this.cameras.main.setBackgroundColor('#1d3a22');

    // Ground: tiled painted grass + large soft colour variation patches.
    this.add.tileSprite(W / 2, H / 2, W, H, 'grass').setTileScale(0.5).setDepth(-100);
    const tint = this.add.layer().setDepth(-99);
    for (let i = 0; i < 90; i++) {
      const x = ((i * 7919) % 997) / 997 * W;
      const y = ((i * 104729) % 991) / 991 * H;
      const p = this.add.image(x, y, 'patch').setScale(2.5 + (i % 5)).setAlpha(0.12);
      p.setTint(i % 3 === 0 ? 0x2a4a10 : i % 3 === 1 ? 0xd8e070 : 0x557a20);
      p.setBlendMode(i % 3 === 1 ? Phaser.BlendModes.SCREEN : Phaser.BlendModes.MULTIPLY);
      tint.add(p);
    }

    this.terrainLayer = this.add.layer();
    const flowerSprite = FLOWER_IDS.map((f) => FLOWERS[f].sprite);
    for (let y = 0; y < g.h; y++) {
      for (let x = 0; x < g.w; x++) {
        const i = g.idx(x, y);
        const t = g.map.terrain[i];
        const v = g.map.variant[i]!;
        const px = x * TILE + TILE / 2;
        const py = y * TILE + TILE / 2;
        if (t === Terrain.Water) {
          this.add.image(px, py, 'water').setDepth(-98);
          if (v % 23 === 0) this.add.image(px, py, 'd_lily').setScale(0.22).setDepth(-97).setAngle(v % 360);
          continue;
        }
        const f = g.map.flower[i]!;
        if (t === Terrain.Tree) {
          const linden = f >= 0 && FLOWER_IDS[f] === 'linden';
          const key = linden ? 'd_linden' : v % 3 === 0 ? 'd_pine' : v % 5 === 0 ? 'd_bush' : 'd_oak';
          const s = (key === 'd_bush' ? 0.32 : 0.48) + (v % 7) * 0.025;
          const img = this.add.image(px + (v % 9) - 4, py + 10, key).setOrigin(0.5, 0.85).setScale(s).setDepth(py + 10);
          this.addDeco(i, img);
          this.tweens.add({ targets: img, angle: { from: -1.2, to: 1.2 }, duration: 2400 + (v % 900), yoyo: true, repeat: -1, ease: 'Sine.easeInOut', delay: v % 1500 });
          continue;
        }
        if (t === Terrain.Rock) {
          const img = this.add.image(px, py + 6, v % 2 ? 'd_rock' : 'd_stump').setOrigin(0.5, 0.75).setScale(0.36).setDepth(py);
          this.addDeco(i, img);
          continue;
        }
        if (f >= 0) {
          // Flower field: 1-3 small clumps per tile with jitter, mixed with grass tufts. Avoids a wallpaper grid.
          const key = flowerSprite[f]!;
          const n = 1 + (v % 3 === 0 ? 1 : 0) + (v % 7 === 0 ? 1 : 0);
          for (let k = 0; k < n; k++) {
            const h1 = (v * (k + 3) * 2654435761) >>> 0;
            const ox = ((h1 % 1000) / 1000 - 0.5) * TILE * 0.8;
            const oy = (((h1 >>> 10) % 1000) / 1000 - 0.5) * TILE * 0.8;
            const sc = 0.13 + ((h1 >>> 20) % 100) / 100 * 0.08;
            const img = this.add.image(px + ox, py + oy + 8, key).setOrigin(0.5, 0.85).setScale(sc).setDepth(py + oy - 24);
            if (h1 & 1) img.setFlipX(true);
            this.addDeco(i, img);
            if (k === 0) this.tweens.add({ targets: img, angle: { from: -3, to: 3 }, duration: 1800 + (v % 700), yoyo: true, repeat: -1, ease: 'Sine.easeInOut', delay: v % 1200 });
          }
        } else if (v % 41 === 0) {
          this.add.image(px, py, v % 2 ? 'f_poppy' : 'f_daisy').setScale(0.14).setAlpha(0.9).setDepth(py - 30);
        }
      }
    }

    // Player (beekeeper) for life and scale; walks with WASD.
    const s = g.map.start;
    this.player = this.add.container((s.x - 2) * TILE, (s.y + 2) * TILE).setDepth(0);
    this.player.add(this.add.image(0, 18, 'shadow').setScale(0.45));
    this.playerImg = this.add.image(0, 0, 'p_down').setScale(0.24).setOrigin(0.5, 0.85);
    this.player.add(this.playerImg);

    // Ghost preview for placement.
    this.ghostRange = this.add.graphics().setDepth(1e6 - 2);
    this.ghost = this.add.container(0, 0).setDepth(1e6).setVisible(false);
    this.ghostImg = this.add.image(0, 0, 'b_hive');
    this.ghostArrow = this.add.image(0, 0, 'arrow').setScale(1.1);
    this.ghostText = this.add.text(0, 0, '', {
      fontFamily: 'Nunito, system-ui, sans-serif', fontSize: '15px', fontStyle: '800', color: '#fff4d1', stroke: '#2a1c10', strokeThickness: 5,
    }).setOrigin(0.5, 1);
    this.ghost.add([this.ghostImg, this.ghostArrow, this.ghostText]);
    this.selectGfx = this.add.graphics().setDepth(1e6 - 1);

    // Day/night overlay above the world, below UI (UI is DOM).
    this.night = this.add.rectangle(0, 0, 10, 10, 0x0a1640, 0).setOrigin(0).setScrollFactor(0).setDepth(2e6);
    this.night.setBlendMode(Phaser.BlendModes.MULTIPLY);
    this.glowLayer = this.add.layer().setDepth(2e6 + 1);
  }

  private setupFx() {
    this.sparks = this.add.particles(0, 0, 'spark', {
      speed: { min: 40, max: 160 }, lifespan: 700, scale: { start: 1.1, end: 0 }, alpha: { start: 1, end: 0 },
      gravityY: 160, emitting: false, blendMode: 'ADD',
    }).setDepth(1e6 + 5);
    this.dust = this.add.particles(0, 0, 'smoke', {
      speed: { min: 20, max: 70 }, lifespan: 600, scale: { start: 0.5, end: 1.4 }, alpha: { start: 0.55, end: 0 },
      tint: 0xc8b08a, emitting: false,
    }).setDepth(1e6 + 4);
    // Ambient drifting pollen motes across the meadow.
    this.pollen = this.add.particles(0, 0, 'spark', {
      x: { min: 0, max: ctl.game.w * TILE }, y: { min: 0, max: ctl.game.h * TILE },
      lifespan: 6000, speedX: { min: 6, max: 18 }, speedY: { min: -6, max: 6 },
      scale: { start: 0.35, end: 0.15 }, alpha: { start: 0, end: 0.7, ease: 'Sine.easeInOut' }, frequency: 40, tint: 0xfff2a0, blendMode: 'ADD',
    }).setDepth(9e5);
    this.fireflies = this.add.particles(0, 0, 'spark', {
      x: { min: 0, max: ctl.game.w * TILE }, y: { min: 0, max: ctl.game.h * TILE },
      lifespan: 4000, speed: { min: 4, max: 14 }, scale: { start: 0.6, end: 0.2 },
      alpha: { values: [0, 1, 0.2, 1, 0] }, frequency: 25, tint: 0xd4ff70, blendMode: 'ADD',
    }).setDepth(2e6 + 2);
    this.fireflies.stop();
    // Butterflies
    for (let i = 0; i < 14; i++) {
      const g = ctl.game;
      const img = this.add.image(Math.random() * g.w * TILE, Math.random() * g.h * TILE, 'spark').setScale(1.1)
        .setTint([0xffffff, 0xffd84a, 0xff9ad6, 0x9ad8ff][i % 4]!).setDepth(9e5 + 1);
      this.butterflies.push({ img, vx: 0, vy: 0, t: Math.random() * 10 });
    }
  }

  // ---------------------------------------------------------------- input

  private setupInput() {
    const kb = this.input.keyboard!;
    this.keys = kb.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,SHIFT') as Record<string, Phaser.Input.Keyboard.Key>;
    this.input.mouse?.disableContextMenu();

    this.input.on('wheel', (p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
      const cam = this.cameras.main;
      const before = cam.getWorldPoint(p.x, p.y);
      const z = Phaser.Math.Clamp(cam.zoom * (dy > 0 ? 0.88 : 1.14), 0.3, 2.2);
      cam.setZoom(z);
      const after = cam.getWorldPoint(p.x, p.y);
      cam.scrollX += before.x - after.x;
      cam.scrollY += before.y - after.y;
    });

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (!ctl.started) return;
      const t = this.tileAt(p);
      if (p.middleButtonDown() || (p.leftButtonDown() && this.keys.SHIFT!.isDown && !ctl.tool)) {
        this.panning = { x: p.x, y: p.y, sx: this.cameras.main.scrollX, sy: this.cameras.main.scrollY };
        return;
      }
      if (p.rightButtonDown()) {
        if (ctl.tool) { ctl.setTool(null); return; }
        this.dragging = true;
        this.removeAt(t.x, t.y);
        return;
      }
      if (!p.leftButtonDown()) return;
      if (ctl.tool) {
        this.dragging = true;
        this.dragStart = t;
        this.lastDragTile = null;
        this.placeAt(t.x, t.y, true);
        return;
      }
      const b = ctl.game.at(t.x, t.y);
      if (b) { audio.click(); ctl.select(b.id); return; }
      const ter = ctl.game.inBounds(t.x, t.y) ? ctl.game.map.terrain[ctl.game.idx(t.x, t.y)] : -1;
      if (ter === Terrain.Tree || ter === Terrain.Rock) {
        const r = ctl.game.clear(t.x, t.y);
        if (r.ok) this.clearDeco(t.x, t.y);
        else this.fail(FAIL_TEXT[r.reason]);
        return;
      }
      ctl.select(null);
      // Drag empty ground pans the map (natural on laptops).
      this.panning = { x: p.x, y: p.y, sx: this.cameras.main.scrollX, sy: this.cameras.main.scrollY };
    });

    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (this.panning) {
        const z = this.cameras.main.zoom;
        this.cameras.main.scrollX = this.panning.sx - (p.x - this.panning.x) / z;
        this.cameras.main.scrollY = this.panning.sy - (p.y - this.panning.y) / z;
        return;
      }
      const t = this.tileAt(p);
      ctl.hover = t;
      if (!this.dragging) return;
      if (p.rightButtonDown()) { this.removeAt(t.x, t.y); return; }
      if (ctl.tool && BELT_TYPES.has(ctl.tool)) this.dragBelt(t);
      else if (ctl.tool && BUILDINGS[ctl.tool].size === 1) this.placeAt(t.x, t.y, false);
    });

    this.input.on('pointerup', () => {
      this.dragging = false;
      this.dragStart = null;
      this.lastDragTile = null;
      this.panning = null;
    });
    this.input.on('gameout', () => { ctl.hover = null; });
  }

  private tileAt(p: Phaser.Input.Pointer) {
    const w = this.cameras.main.getWorldPoint(p.x, p.y);
    const s = ctl.tool ? BUILDINGS[ctl.tool].size : 1;
    const off = (s - 1) / 2;
    return { x: Math.floor(w.x / TILE - off), y: Math.floor(w.y / TILE - off) };
  }

  /** Belt drag: auto-orient each new tile along the drag, and turn the previous tile towards it. */
  private dragBelt(t: { x: number; y: number }) {
    const last = this.lastDragTile ?? this.dragStart;
    if (!last || (last.x === t.x && last.y === t.y)) return;
    // Walk one tile at a time (Manhattan) so fast mouse moves leave no gaps.
    let cx = last.x;
    let cy = last.y;
    while (cx !== t.x || cy !== t.y) {
      const dx = Math.sign(t.x - cx);
      const dy = dx !== 0 ? 0 : Math.sign(t.y - cy);
      const dir = (dx === 1 ? 0 : dx === -1 ? 2 : dy === 1 ? 1 : 3) as Dir;
      const prev = ctl.game.at(cx, cy);
      if (prev && BELT_TYPES.has(prev.type) && prev.dir !== dir) {
        ctl.game.rotate(cx, cy, dir);
        this.refreshBelts();
      }
      cx += dx;
      cy += dy;
      ctl.dir = dir;
      this.placeAt(cx, cy, false);
    }
    this.lastDragTile = { x: cx, y: cy };
  }

  private placeAt(x: number, y: number, loud: boolean) {
    const tool = ctl.tool;
    if (!tool) return;
    const g = ctl.game;
    const existing = g.at(x, y);
    if (existing && BELT_TYPES.has(existing.type) && BELT_TYPES.has(tool)) {
      if (existing.type === tool) {
        if (existing.dir !== ctl.dir) { g.rotate(x, y, ctl.dir); this.refreshBelts(); }
        return;
      }
      // upgrade belt in place
      g.remove(x, y);
    }
    const r = g.place(tool, x, y, ctl.dir, tool === 'hive' ? ctl.hiveSpecies ?? undefined : undefined);
    if (r.ok) {
      if (BELT_TYPES.has(tool)) audio.belt();
      else audio.place();
      this.syncAll();
    } else if (loud) {
      this.fail(FAIL_TEXT[r.reason]);
    }
  }

  private removeAt(x: number, y: number) {
    const b = ctl.game.at(x, y);
    if (!b) return;
    if (ctl.selected === b.id) ctl.select(null);
    ctl.game.remove(x, y);
    audio.remove();
    this.syncAll();
  }

  private fail(text: string) {
    audio.error();
    ctl.toast(text, 'error');
  }

  private clearDeco(x: number, y: number) {
    const i = ctl.game.idx(x, y);
    for (const img of this.decoByIdx.get(i) ?? []) {
      this.tweens.killTweensOf(img);
      this.tweens.add({ targets: img, scale: 0, alpha: 0, angle: 30, duration: 300, onComplete: () => img.destroy() });
    }
    this.decoByIdx.delete(i);
    this.dust.explode(14, x * TILE + TILE / 2, y * TILE + TILE / 2);
    audio.remove();
  }

  // ---------------------------------------------------------------- building views

  private center(b: Building) {
    const s = BUILDINGS[b.type].size;
    return { x: (b.x + s / 2) * TILE, y: (b.y + s / 2) * TILE };
  }

  private beltKey(b: Building, curve: boolean) {
    return `${b.type}${curve ? '_c' : '_s'}`;
  }

  private beltAngle(b: Building, curve: boolean) {
    if (!curve) return ANGLE[b.dir]!;
    // Curve texture: enters from west edge, exits north edge (arc around top-right corner)... we rotate/flip to fit.
    return 0;
  }

  private applyBeltLook(v: View) {
    const b = v.b;
    const curve = ctl.game.isCurve(b.id);
    const spr = v.body as Phaser.GameObjects.Sprite;
    spr.setTexture(this.beltKey(b, curve), this.beltFrame);
    spr.setFlip(false, false);
    if (!curve) {
      spr.setAngle(ANGLE[b.dir]!);
    } else {
      // Base curve art: arc centred on the bottom-right corner => connects left edge and top edge.
      // Item enters from the side and leaves through b.dir. Side +1 = fed from the right of travel.
      const side = ctl.game.curveSide(b);
      // For dir east (exit right edge): fed from south (right of travel) => connects bottom & right => arc around top-left... compute:
      // Base connects W and N. Rotation by k*90 connects (W,N)->(N,E)->(E,S)->(S,W).
      const exit = b.dir;
      const entryEdge = side === 1 ? (exit + 1) % 4 : (exit + 3) % 4; // edge item comes in from
      const edges = new Set([exit, entryEdge]);
      // edge ids: 0=E,1=S,2=W,3=N
      const pairs: [number, number, number][] = [[2, 3, 0], [3, 0, 90], [0, 1, 180], [1, 2, 270]];
      for (const [a, c, ang] of pairs) if (edges.has(a) && edges.has(c)) spr.setAngle(ang);
      // Direction of travel along the arc is handled by animation direction.
      const ccw = (exit + 1) % 4 === entryEdge; // travel turns left
      v.root.setData('reverse', ccw);
    }
    v.curve = curve;
    v.dir = b.dir;
  }

  private createView(b: Building): View {
    const def = BUILDINGS[b.type];
    const c = this.center(b);
    const root = this.add.container(c.x, c.y);
    let body: View['body'];
    const v: View = { b, root, body: null!, items: [], bees: [], curve: false, dir: b.dir };
    if (BELT_TYPES.has(b.type)) {
      body = this.add.sprite(0, 0, `${b.type}_s`, 0);
      root.add(body);
      root.setDepth(-50);
      v.body = body;
      this.applyBeltLook(v);
    } else if (b.type === 'splitter') {
      body = this.add.image(0, 0, 'splitter').setAngle(ANGLE[b.dir]!);
      root.add(body);
      root.setDepth(-49);
      v.body = body;
    } else {
      const s = def.size;
      const shadow = this.add.image(4, s * TILE * 0.36, 'shadow').setScale(s * 0.85, s * 0.9);
      body = this.add.image(0, s * TILE * 0.42, def.sprite).setOrigin(0.5, 1);
      const tex = this.textures.get(def.sprite).getSourceImage() as HTMLImageElement;
      const scale = (s * TILE * 1.12) / Math.max(tex.width, tex.height * 0.9);
      body.setScale(scale);
      root.add([shadow, body]);
      root.setDepth(c.y + s * TILE * 0.4);
      v.body = body;
      // Output direction marker (small) for machines & hives.
      if (def.behaviour === 'hive' || def.behaviour === 'machine' || def.behaviour === 'store') {
        // none: outputs go to any belt leading away. Keep visuals clean.
      }
      if (def.behaviour === 'machine' || def.behaviour === 'lab' || def.behaviour === 'breeder') {
        v.workTween = this.tweens.add({ targets: body, scaleY: scale * 1.03, scaleX: scale * 0.985, duration: 260, yoyo: true, repeat: -1, ease: 'Sine.easeInOut', paused: true });
      }
      if (b.type === 'brewery' || b.type === 'chandlery' || b.type === 'extractor') {
        v.smoke = this.add.particles(c.x + (b.type === 'brewery' ? 14 : 0), c.y - s * TILE * 0.55, 'smoke', {
          speedY: { min: -40, max: -20 }, speedX: { min: -6, max: 10 }, lifespan: 1800, scale: { start: 0.35, end: 1.2 },
          alpha: { start: 0.35, end: 0 }, frequency: 260, tint: b.type === 'extractor' ? 0xffe6a0 : 0xffffff,
        }).setDepth(root.depth + 1);
        v.smoke.stop();
      }
      if (b.type === 'monument') {
        v.glow = this.add.image(c.x, c.y, 'glow').setScale(2.2).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.6);
        this.glowLayer.add(v.glow);
        this.tweens.add({ targets: v.glow, alpha: { from: 0.4, to: 0.8 }, duration: 1600, yoyo: true, repeat: -1 });
      } else if (def.behaviour !== 'store') {
        v.glow = this.add.image(c.x, c.y - 10, 'glow').setScale(s * 0.55).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0);
        this.glowLayer.add(v.glow);
      }
      if (b.type === 'hive') {
        for (let i = 0; i < 5; i++) {
          const img = this.add.image(c.x, c.y, 'bee').setScale(0.07).setDepth(1e6 - 10);
          v.bees.push({ img, state: 'home', tx: c.x, ty: c.y, wait: i * 0.6, speed: 70 + Math.random() * 40 });
        }
      }
      // Pop-in
      root.setScale(0.3);
      this.tweens.add({ targets: root, scale: 1, duration: 380, ease: 'Back.easeOut' });
      this.dust.explode(16, c.x, c.y + s * TILE * 0.3);
    }
    return v;
  }

  private destroyView(v: View) {
    for (const bee of v.bees) bee.img.destroy();
    v.glow?.destroy();
    v.smoke?.destroy();
    v.bubble?.destroy();
    v.workTween?.remove();
    for (const it of v.items) it.destroy();
    const c = v.root;
    this.dust.explode(12, c.x, c.y);
    this.tweens.add({ targets: c, scale: 0, alpha: 0, duration: 200, ease: 'Back.easeIn', onComplete: () => c.destroy() });
  }

  private refreshBelts() {
    for (const v of this.views.values()) if (BELT_TYPES.has(v.b.type)) this.applyBeltLook(v);
  }

  /** Make views match the sim (by id). */
  syncAll() {
    const seen = new Set<number>();
    for (const b of ctl.game.state.buildings) {
      seen.add(b.id);
      let v = this.views.get(b.id);
      if (!v || v.b !== b) {
        if (v) this.destroyView(v);
        v = this.createView(b);
        this.views.set(b.id, v);
      }
    }
    for (const [id, v] of this.views) {
      if (!seen.has(id)) {
        this.destroyView(v);
        this.views.delete(id);
      }
    }
    this.refreshBelts();
    for (const v of this.views.values()) if (v.b.type === 'splitter') v.body.setAngle(ANGLE[v.b.dir]!);
    // Flowers under buildings are trampled (hidden); they come back when the building is removed.
    const g = ctl.game;
    for (const [i, imgs] of this.decoByIdx) {
      const covered = !!g.at(i % g.w, Math.floor(i / g.w));
      for (const img of imgs) img.setVisible(!covered);
    }
  }

  // ---------------------------------------------------------------- events

  private onEvent(e: GameEvent | { t: string }) {
    const ev = e as GameEvent;
    switch (ev.t) {
      case 'sold': {
        const x = ev.x * TILE;
        const y = ev.y * TILE;
        this.floatText(x, y - 40, `+${Math.round(ev.coins)}`, '#ffd84a', ITEMS[ev.item].icon);
        if (Math.random() < 0.5) audio.coin();
        break;
      }
      case 'produced': {
        const v = this.views.get(ev.id);
        if (!v || v.b.type === 'hive') break;
        const c = this.center(v.b);
        this.sparks.setParticleTint(0xffc23d);
        this.sparks.explode(4, c.x, c.y - 30);
        break;
      }
      case 'mutation':
      case 'queen': {
        const x = ev.x * TILE;
        const y = ev.y * TILE;
        this.sparks.setParticleTint(SPECIES[ev.species].color);
        this.sparks.explode(ev.t === 'mutation' ? 60 : 16, x, y - 30);
        this.floatText(x, y - 70, ev.t === 'mutation' ? `✦ ${SPECIES[ev.species].name}!` : `+ матка: ${SPECIES[ev.species].name}`, ev.t === 'mutation' ? '#ffe36a' : '#fff4d1', 'i_bee');
        if (ev.t === 'mutation') { audio.mutation(); this.cameras.main.shake(250, 0.004); }
        break;
      }
      case 'tech': audio.tech(); break;
      case 'quest': audio.quest(); break;
      case 'won': audio.win(); this.cameras.main.flash(800, 255, 220, 120); break;
      case 'built':
      case 'removed': this.syncAll(); break;
    }
  }

  private floatText(x: number, y: number, text: string, color: string, icon?: string) {
    const c = this.add.container(x, y).setDepth(1e6 + 10);
    const t = this.add.text(icon ? 12 : 0, 0, text, {
      fontFamily: 'Nunito, system-ui, sans-serif', fontSize: '22px', fontStyle: '900', color, stroke: '#2a1c10', strokeThickness: 6,
    }).setOrigin(0.5);
    c.add(t);
    if (icon) c.add(this.add.image(-t.width / 2 - 4, 0, icon).setScale(0.22));
    this.tweens.add({ targets: c, y: y - 50, alpha: { from: 1, to: 0 }, duration: 1300, ease: 'Cubic.easeOut', onComplete: () => c.destroy() });
  }

  // ---------------------------------------------------------------- frame

  update(_t: number, deltaMs: number) {
    const dt = Math.min(deltaMs, 250);
    const g = ctl.game;
    if (ctl.started && !ctl.paused) {
      this.acc += dt * ctl.speed;
      let steps = 0;
      while (this.acc >= 100 && steps < 40) {
        g.step();
        this.acc -= 100;
        steps++;
      }
      for (const e of g.drainEvents()) ctl.emit(e);
    }
    this.moveCamera(dt / 1000);
    this.animateBelts(dt);
    this.updateViews(dt / 1000);
    this.updateGhost();
    this.updateSelection();
    this.updateDayNight();
    this.updateButterflies(dt / 1000);
  }

  private moveCamera(dt: number) {
    const k = this.keys;
    const cam = this.cameras.main;
    const dx = Number(k.D!.isDown || k.RIGHT!.isDown) - Number(k.A!.isDown || k.LEFT!.isDown);
    const dy = Number(k.S!.isDown || k.DOWN!.isDown) - Number(k.W!.isDown || k.UP!.isDown);
    const sp = 520 * dt;
    if (dx || dy) {
      const n = Math.hypot(dx, dy);
      this.player.x = Phaser.Math.Clamp(this.player.x + (dx / n) * sp, 0, ctl.game.w * TILE);
      this.player.y = Phaser.Math.Clamp(this.player.y + (dy / n) * sp, 0, ctl.game.h * TILE);
      this.playerImg.setTexture(dy < 0 && !dx ? 'p_down' : dx < 0 ? 'p_left' : dx > 0 ? 'p_right' : 'p_down');
      this.playerImg.y = Math.sin(this.time.now / 70) * 2;
      cam.scrollX += (dx / n) * sp;
      cam.scrollY += (dy / n) * sp;
    }
    this.player.setDepth(this.player.y + 20);
  }

  private animateBelts(dtMs: number) {
    // Frame advance matching item speed: 16 frames = 16px slat period; belt moves speed tiles/s * 64px.
    this.beltFrame = (this.beltFrame + (dtMs / 1000) * 1.6 * TILE / 16 * BELT_FRAMES / BELT_FRAMES * (ctl.paused || !ctl.started ? 0 : ctl.speed)) % BELT_FRAMES;
    const f = Math.floor(this.beltFrame);
    for (const v of this.views.values()) {
      if (!BELT_TYPES.has(v.b.type)) continue;
      const mult = BUILDINGS[v.b.type].speed! / 1.6;
      const ff = Math.floor((this.beltFrame * mult) % BELT_FRAMES);
      const frame = v.curve && v.root.getData('reverse') ? (BELT_FRAMES - 1 - ff) : ff;
      (v.body as Phaser.GameObjects.Sprite).setFrame(v.curve ? frame : f === f ? ff : 0);
    }
  }

  private itemPos(b: Building, pos: number, curve: boolean) {
    const c = this.center(b);
    if (!curve) {
      const t = pos - 0.5;
      return { x: c.x + DX[b.dir] * t * TILE, y: c.y + DY[b.dir] * t * TILE };
    }
    const side = ctl.game.curveSide(b);
    const exitDir = b.dir;
    const entryEdge = side === 1 ? (exitDir + 1) % 4 : (exitDir + 3) % 4;
    // entry point at the middle of the entry edge, exit at middle of exit edge, quarter arc around their shared corner
    const ex = c.x + DX[entryEdge]! * TILE / 2;
    const ey = c.y + DY[entryEdge]! * TILE / 2;
    const ox = c.x + DX[exitDir] * TILE / 2;
    const oy = c.y + DY[exitDir] * TILE / 2;
    const cx = c.x + (DX[entryEdge]! + DX[exitDir]) * TILE / 2;
    const cy = c.y + (DY[entryEdge]! + DY[exitDir]) * TILE / 2;
    const a0 = Math.atan2(ey - cy, ex - cx);
    let a1 = Math.atan2(oy - cy, ox - cx);
    if (a1 - a0 > Math.PI) a1 -= Math.PI * 2;
    if (a0 - a1 > Math.PI) a1 += Math.PI * 2;
    const a = a0 + (a1 - a0) * pos;
    return { x: cx + Math.cos(a) * TILE / 2, y: cy + Math.sin(a) * TILE / 2 };
  }

  private updateViews(dt: number) {
    const g = ctl.game;
    const cam = this.cameras.main;
    const view = cam.worldView;
    let hivesOnScreen = 0;
    const light = g.light();
    for (const v of this.views.values()) {
      const b = v.b;
      const onScreen = view.contains(v.root.x, v.root.y) || Phaser.Geom.Rectangle.Overlaps(view, new Phaser.Geom.Rectangle(v.root.x - 96, v.root.y - 96, 192, 192));
      if (BELT_TYPES.has(b.type)) {
        // Items
        while (v.items.length < b.items.length) v.items.push(this.add.image(0, 0, 'i_comb').setScale(0.24).setDepth(-40));
        for (let i = 0; i < v.items.length; i++) {
          const img = v.items[i]!;
          const it = b.items[i];
          if (!it || !onScreen) { img.setVisible(false); continue; }
          const p = this.itemPos(b, it.pos, v.curve);
          img.setVisible(true).setTexture(ITEMS[it.item].icon).setPosition(p.x, p.y - 4);
        }
        continue;
      }
      const def = BUILDINGS[b.type];
      if (v.workTween) {
        if (b.working && v.workTween.isPaused()) v.workTween.resume();
        else if (!b.working && !v.workTween.isPaused()) v.workTween.pause();
      }
      if (v.smoke) {
        if (b.working && !v.smoke.emitting) v.smoke.start();
        else if (!b.working && v.smoke.emitting) v.smoke.stop();
      }
      if (v.glow && b.type !== 'monument') v.glow.setAlpha((1 - light) * (b.working ? 0.75 : 0.35));
      // Problem bubble: hive without flowers, machine without input belt, etc.
      const problem = this.problemOf(b);
      if (problem && !v.bubble) {
        const c = this.center(b);
        const bub = this.add.container(c.x + def.size * 18, c.y - def.size * TILE * 0.75).setDepth(1e6 - 5);
        bub.add(this.add.image(0, 0, 'bubble').setScale(0.75));
        bub.add(this.add.text(0, -2, '!', { fontFamily: 'Nunito, system-ui', fontSize: '26px', fontStyle: '900', color: '#ff6a4a' }).setOrigin(0.5));
        this.tweens.add({ targets: bub, y: bub.y - 6, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
        v.bubble = bub;
      } else if (!problem && v.bubble) {
        v.bubble.destroy();
        v.bubble = undefined;
      }
      if (b.type === 'hive') {
        if (onScreen) hivesOnScreen++;
        this.updateBees(v, dt, light, onScreen);
      }
    }
    audio.setScene(hivesOnScreen, light);
  }

  problemOf(b: Building): string | null {
    const g = ctl.game;
    const def = BUILDINGS[b.type];
    if (def.behaviour === 'hive') {
      if (g.hiveRateOf(b.id) <= 0.001) return 'Нет цветов рядом';
      if ((b.out.comb ?? 0) >= HIVE.buffer) return 'Соты некуда девать: проведи конвейер';
    }
    if (def.behaviour === 'machine') {
      const r = def.recipe!;
      const full = Object.keys(r.outputs).every((k) => (b.out[k as ItemId] ?? 0) >= 12);
      if (full) return 'Выход забит';
    }
    if (def.behaviour === 'lab' && !g.state.research) return 'Не выбрано исследование (T)';
    return null;
  }

  private updateBees(v: View, dt: number, light: number, onScreen: number | boolean) {
    const g = ctl.game;
    const c = this.center(v.b);
    const active = g.hiveRateOf(v.b.id) > 0 && light > 0.15;
    const sp = SPECIES[v.b.species ?? 'forest'];
    for (const bee of v.bees) {
      bee.img.setVisible(!!onScreen && bee.state !== 'home');
      bee.img.setTint(sp.tier >= 3 ? sp.color : 0xffffff);
      if (bee.state === 'home') {
        bee.wait -= dt;
        if (bee.wait > 0 || !active) continue;
        const target = this.pickFlower(v.b);
        if (!target) { bee.wait = 2; continue; }
        bee.tx = target.x;
        bee.ty = target.y;
        bee.state = 'out';
        bee.img.setPosition(c.x, c.y - 20);
        continue;
      }
      const tx = bee.state === 'out' ? bee.tx : c.x;
      const ty = bee.state === 'out' ? bee.ty : c.y - 20;
      const dx = tx - bee.img.x;
      const dy = ty - bee.img.y;
      const d = Math.hypot(dx, dy);
      const step = bee.speed * dt * (ctl.paused ? 0 : Math.min(ctl.speed, 3));
      if (d < 6) {
        if (bee.state === 'out') {
          bee.wait -= dt;
          bee.img.x += Math.sin(this.time.now / 60 + bee.speed) * 0.6;
          if (bee.wait < -1.2) { bee.state = 'in'; bee.wait = 0; }
        } else {
          bee.state = 'home';
          bee.wait = 0.4 + Math.random() * 1.5;
        }
        continue;
      }
      const wob = Math.sin(this.time.now / 90 + bee.speed) * 0.9;
      bee.img.x += (dx / d) * step + (-dy / d) * wob;
      bee.img.y += (dy / d) * step + (dx / d) * wob;
      bee.img.setFlipX(dx < 0);
      bee.img.setRotation(Math.sin(this.time.now / 50 + bee.speed) * 0.15);
    }
  }

  private flowerCache = new Map<number, { x: number; y: number }[]>();
  private pickFlower(b: Building) {
    let list = this.flowerCache.get(b.id);
    if (!list) {
      list = [];
      const g = ctl.game;
      const r = HIVE.radius;
      for (let ty = b.y - r; ty <= b.y + r + 1; ty++) for (let tx = b.x - r; tx <= b.x + r + 1; tx++) {
        if (!g.inBounds(tx, ty)) continue;
        if (Math.hypot(tx - (b.x + 0.5), ty - (b.y + 0.5)) > r + 0.5) continue;
        if (g.map.flower[g.idx(tx, ty)]! >= 0 && !g.at(tx, ty)) list.push({ x: tx * TILE + TILE / 2, y: ty * TILE + 20 });
      }
      this.flowerCache.set(b.id, list);
      this.time.delayedCall(5000, () => this.flowerCache.delete(b.id));
    }
    return list.length ? list[Math.floor(Math.random() * list.length)] : null;
  }

  private updateGhost() {
    const tool = ctl.tool;
    const h = ctl.hover;
    this.ghostRange.clear();
    if (!tool || !h || !ctl.started) { this.ghost.setVisible(false); return; }
    const def = BUILDINGS[tool];
    const s = def.size;
    const g = ctl.game;
    const cx = (h.x + s / 2) * TILE;
    const cy = (h.y + s / 2) * TILE;
    let ok = g.isUnlocked(tool) && g.state.money >= def.cost;
    for (let y = h.y; y < h.y + s; y++) for (let x = h.x; x < h.x + s; x++) {
      if (!g.inBounds(x, y) || g.map.terrain[g.idx(x, y)] !== Terrain.Grass) ok = false;
      const o = g.at(x, y);
      if (o && !(BELT_TYPES.has(o.type) && BELT_TYPES.has(tool))) ok = false;
    }
    this.ghost.setVisible(true).setPosition(cx, cy);
    const key = BELT_TYPES.has(tool) ? `${tool}_s` : def.sprite;
    this.ghostImg.setTexture(key, BELT_TYPES.has(tool) ? 0 : undefined);
    if (BELT_TYPES.has(tool) || tool === 'splitter') {
      this.ghostImg.setOrigin(0.5).setPosition(0, 0).setScale(1).setAngle(ANGLE[ctl.dir]!);
    } else {
      const tex = this.textures.get(def.sprite).getSourceImage() as HTMLImageElement;
      this.ghostImg.setOrigin(0.5, 1).setPosition(0, s * TILE * 0.42).setAngle(0)
        .setScale((s * TILE * 1.12) / Math.max(tex.width, tex.height * 0.9));
    }
    this.ghostImg.setAlpha(0.72).setTint(ok ? 0xffffff : 0xff6060);
    const showArrow = BELT_TYPES.has(tool) || tool === 'splitter';
    this.ghostArrow.setVisible(showArrow).setAngle(ANGLE[ctl.dir]!).setPosition(DX[ctl.dir] * 10, DY[ctl.dir] * 10);
    // footprint
    this.ghostRange.lineStyle(3, ok ? 0xffd84a : 0xff5040, 0.9);
    this.ghostRange.strokeRoundedRect(h.x * TILE + 2, h.y * TILE + 2, s * TILE - 4, s * TILE - 4, 8);
    if (tool === 'hive') {
      this.ghostRange.fillStyle(0xffd84a, 0.08).fillCircle(cx, cy, (HIVE.radius + 0.5) * TILE);
      this.ghostRange.lineStyle(2, 0xffd84a, 0.5).strokeCircle(cx, cy, (HIVE.radius + 0.5) * TILE);
      const sp = ctl.hiveSpecies && (g.state.queens[ctl.hiveSpecies] ?? 0) > 0 ? ctl.hiveSpecies : g.bestQueen();
      const rate = sp ? g.estimateHive(h.x, h.y, sp) : 0;
      this.ghostText.setText(sp ? `${(rate * 60).toFixed(1)} сот/мин · ${SPECIES[sp].name}` : 'Нет маток').setPosition(0, -s * TILE * 0.7);
      this.ghostText.setColor(rate > 0.15 ? '#c8ff8a' : rate > 0.05 ? '#ffe36a' : '#ff8a6a');
    } else {
      this.ghostText.setText(g.state.money < def.cost ? `Нужно ${def.cost} 🪙` : '').setPosition(0, -s * TILE * 0.7);
      this.ghostText.setColor('#ff8a6a');
    }
  }

  private updateSelection() {
    this.selectGfx.clear();
    const id = ctl.selected;
    if (!id) return;
    const b = ctl.game.get(id);
    if (!b) return;
    const s = BUILDINGS[b.type].size;
    const pulse = 0.6 + Math.sin(this.time.now / 200) * 0.3;
    this.selectGfx.lineStyle(3, 0xffe36a, pulse).strokeRoundedRect(b.x * TILE, b.y * TILE, s * TILE, s * TILE, 10);
    if (b.type === 'hive') {
      const c = this.center(b);
      this.selectGfx.lineStyle(2, 0xffd84a, 0.4).strokeCircle(c.x, c.y, (HIVE.radius + 0.5) * TILE);
    }
  }

  private updateDayNight() {
    const cam = this.cameras.main;
    const light = ctl.game.light();
    this.night.setSize(cam.width, cam.height);
    // Warm dusk tint, deep blue night.
    const dark = 1 - light;
    const col = Phaser.Display.Color.Interpolate.ColorWithColor(
      Phaser.Display.Color.ValueToColor(0xffe0b0), Phaser.Display.Color.ValueToColor(0x3048a0), 100, Math.round(dark * 100),
    );
    this.night.setFillStyle(Phaser.Display.Color.GetColor(col.r, col.g, col.b), light > 0.98 ? 0 : Math.min(0.75, 0.15 + dark * 0.6));
    if (dark > 0.6 && !this.fireflies.emitting) this.fireflies.start();
    if (dark < 0.5 && this.fireflies.emitting) this.fireflies.stop();
    this.pollen.setFrequency(light > 0.4 ? 40 : 400);
  }

  private updateButterflies(dt: number) {
    for (const b of this.butterflies) {
      b.t += dt;
      b.vx += (Math.sin(b.t * 1.3 + b.img.y) * 30 - b.vx) * dt;
      b.vy += (Math.cos(b.t * 0.9 + b.img.x) * 30 - b.vy) * dt;
      b.img.x += b.vx * dt;
      b.img.y += b.vy * dt + Math.sin(b.t * 12) * 0.4;
      b.img.setScale(0.8 + Math.abs(Math.sin(b.t * 14)) * 0.6, 1);
      b.img.setAlpha(ctl.game.light() * 0.9);
    }
  }

  focusOn(x: number, y: number) {
    this.cameras.main.pan(x * TILE, y * TILE, 500, 'Sine.easeInOut');
  }

  zoom(f: number) {
    const cam = this.cameras.main;
    cam.setZoom(Phaser.Math.Clamp(cam.zoom * f, 0.3, 2.2));
  }
}
