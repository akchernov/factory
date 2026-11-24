import Phaser from 'phaser';

export const TILE = 64;
export const BELT_FRAMES = 16;

/** Belt palette per tier: [rail, belt, slat, accent]. */
const BELT_COLORS: Record<string, [string, string, string, string]> = {
  belt: ['#6b4a2b', '#3a3530', '#5a524a', '#e8b23a'],
  belt2: ['#7a2f2a', '#35302d', '#5c4f48', '#ff5d4a'],
  belt3: ['#2c5a7a', '#2f3336', '#4e5860', '#5ad0ff'],
};

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!] as const;
}

function drawStraight(ctx: CanvasRenderingContext2D, ox: number, f: number, col: [string, string, string, string]) {
  const [rail, belt, slat, accent] = col;
  ctx.save();
  ctx.translate(ox, 0);
  ctx.beginPath();
  ctx.rect(0, 0, TILE, TILE);
  ctx.clip();
  // shadow
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(0, 12, TILE, 46);
  // belt
  ctx.fillStyle = belt;
  ctx.fillRect(0, 12, TILE, 40);
  const off = (f / BELT_FRAMES) * 16;
  ctx.fillStyle = slat;
  for (let x = -16; x < TILE + 16; x += 16) ctx.fillRect(x + off, 14, 7, 36);
  // chevrons
  ctx.strokeStyle = accent;
  ctx.globalAlpha = 0.35;
  ctx.lineWidth = 3;
  for (let x = -32; x < TILE + 32; x += 32) {
    ctx.beginPath();
    ctx.moveTo(x + off * 2 + 4, 24);
    ctx.lineTo(x + off * 2 + 12, 32);
    ctx.lineTo(x + off * 2 + 4, 40);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  // rails
  const g = ctx.createLinearGradient(0, 6, 0, 14);
  g.addColorStop(0, '#ffffff55');
  g.addColorStop(1, rail);
  ctx.fillStyle = g;
  ctx.fillRect(0, 6, TILE, 8);
  ctx.fillStyle = rail;
  ctx.fillRect(0, 50, TILE, 8);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(0, 56, TILE, 2);
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  for (let x = 4; x < TILE; x += 20) {
    ctx.fillRect(x, 8, 3, 3);
    ctx.fillRect(x, 52, 3, 3);
  }
  ctx.restore();
}

/**
 * Curve tile: a quarter band that connects the middle of the SOUTH edge with the middle of the EAST edge
 * (pivot = bottom-right corner, centre line radius = TILE/2). Same widths as the straight belt:
 * belt band 12..52 px across the tile, rails 6..14 and 50..58.
 * Animation frames move slats from the south edge towards the east edge.
 */
function drawCurve(ctx: CanvasRenderingContext2D, ox: number, f: number, col: [string, string, string, string]) {
  const [rail, belt, slat, accent] = col;
  ctx.save();
  ctx.translate(ox, 0);
  ctx.beginPath();
  ctx.rect(0, 0, TILE, TILE);
  ctx.clip();
  const cx = TILE;
  const cy = TILE;
  // Quarter from angle PI (pointing west from the pivot = south edge side) to 1.5PI (north = east edge side).
  const A0 = Math.PI;
  const A1 = Math.PI * 1.5;
  const band = (r0: number, r1: number, color: string) => {
    ctx.beginPath();
    ctx.arc(cx, cy, r1, A0, A1);
    ctx.arc(cx, cy, r0, A1, A0, true);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  };
  const toR = (straightY: number) => TILE - straightY; // straight belt y -> radius from the pivot
  band(toR(58), toR(6), 'rgba(0,0,0,0.25)');
  band(toR(52), toR(12), belt);
  // Slats: radial bars evenly spaced along the centre line, shifted by frame.
  const centreLen = (Math.PI / 2) * (TILE / 2);
  const n = Math.round(centreLen / 16);
  const shift = f / BELT_FRAMES;
  ctx.fillStyle = slat;
  for (let i = -1; i <= n; i++) {
    const t0 = (i + shift) / n;
    const t1 = t0 + 7 / 16 / n;
    const a0 = A0 + Math.max(0, Math.min(1, t0)) * (A1 - A0);
    const a1 = A0 + Math.max(0, Math.min(1, t1)) * (A1 - A0);
    if (a1 <= a0) continue;
    ctx.beginPath();
    ctx.arc(cx, cy, toR(14), a0, a1);
    ctx.arc(cx, cy, toR(50), a1, a0, true);
    ctx.closePath();
    ctx.fill();
  }
  // Direction chevron on the centre line.
  ctx.globalAlpha = 0.35;
  ctx.strokeStyle = accent;
  ctx.lineWidth = 3;
  const ca = A0 + ((0.5 + shift) % 1) * (A1 - A0);
  const px = cx + Math.cos(ca) * TILE / 2;
  const py = cy + Math.sin(ca) * TILE / 2;
  const tx = -Math.sin(ca);
  const ty = Math.cos(ca);
  ctx.beginPath();
  ctx.moveTo(px - tx * 4 + ty * 8, py - ty * 4 - tx * 8);
  ctx.lineTo(px + tx * 4, py + ty * 4);
  ctx.lineTo(px - tx * 4 - ty * 8, py - ty * 4 + tx * 8);
  ctx.stroke();
  ctx.globalAlpha = 1;
  // Rails, outer (straight y 6..14) and inner (50..58).
  band(toR(14), toR(6), rail);
  band(toR(58), toR(50), rail);
  ctx.restore();
}

function addSheet(scene: Phaser.Scene, key: string, draw: (ctx: CanvasRenderingContext2D, ox: number, f: number) => void) {
  if (scene.textures.exists(key)) return;
  const [c, ctx] = canvas(TILE * BELT_FRAMES, TILE);
  for (let f = 0; f < BELT_FRAMES; f++) draw(ctx, f * TILE, f);
  const tex = scene.textures.addCanvas(key, c)!;
  for (let f = 0; f < BELT_FRAMES; f++) tex.add(f, 0, f * TILE, 0, TILE, TILE);
}

function addCanvasTexture(scene: Phaser.Scene, key: string, w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  if (scene.textures.exists(key)) return;
  const [c, ctx] = canvas(w, h);
  draw(ctx);
  scene.textures.addCanvas(key, c);
}

export function createProceduralTextures(scene: Phaser.Scene) {
  for (const [key, col] of Object.entries(BELT_COLORS)) {
    addSheet(scene, `${key}_s`, (ctx, ox, f) => drawStraight(ctx, ox, f, col));
    addSheet(scene, `${key}_c`, (ctx, ox, f) => drawCurve(ctx, ox, f, col));
  }
  addCanvasTexture(scene, 'splitter', TILE, TILE, (ctx) => {
    drawStraight(ctx, 0, 0, BELT_COLORS.belt!);
    ctx.fillStyle = '#4a3420';
    ctx.beginPath();
    ctx.roundRect(10, 6, 44, 52, 8);
    ctx.fill();
    ctx.fillStyle = '#e8b23a';
    ctx.beginPath();
    ctx.moveTo(22, 32); ctx.lineTo(44, 18); ctx.lineTo(44, 46); ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#2a1c10';
    ctx.lineWidth = 2;
    ctx.stroke();
  });
  addCanvasTexture(scene, 'glow', 256, 256, (ctx) => {
    const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0, 'rgba(255,214,140,0.9)');
    g.addColorStop(0.35, 'rgba(255,170,70,0.35)');
    g.addColorStop(1, 'rgba(255,140,40,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
  });
  addCanvasTexture(scene, 'soft', 128, 128, (ctx) => {
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
  });
  addCanvasTexture(scene, 'shadow', 128, 48, (ctx) => {
    const g = ctx.createRadialGradient(64, 24, 0, 64, 24, 64);
    g.addColorStop(0, 'rgba(10,20,5,0.45)');
    g.addColorStop(1, 'rgba(10,20,5,0)');
    ctx.fillStyle = g;
    ctx.scale(1, 0.375);
    ctx.fillRect(0, 0, 128, 128);
  });
  addCanvasTexture(scene, 'spark', 16, 16, (ctx) => {
    const g = ctx.createRadialGradient(8, 8, 0, 8, 8, 8);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.4, 'rgba(255,240,180,0.8)');
    g.addColorStop(1, 'rgba(255,200,80,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 16, 16);
  });
  addCanvasTexture(scene, 'smoke', 64, 64, (ctx) => {
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(240,240,240,0.55)');
    g.addColorStop(1, 'rgba(240,240,240,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
  });
  addCanvasTexture(scene, 'water', TILE, TILE, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, TILE, TILE);
    g.addColorStop(0, '#2f7f9e');
    g.addColorStop(1, '#25607e');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, TILE, TILE);
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      const y = 14 + i * 18;
      ctx.moveTo(6 + i * 9, y);
      ctx.quadraticCurveTo(18 + i * 9, y - 5, 30 + i * 9, y);
      ctx.stroke();
    }
  });
  addCanvasTexture(scene, 'bubble', 56, 56, (ctx) => {
    ctx.fillStyle = 'rgba(30,20,12,0.85)';
    ctx.beginPath();
    ctx.arc(28, 26, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ff6a4a';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = 'rgba(30,20,12,0.85)';
    ctx.beginPath();
    ctx.moveTo(20, 44); ctx.lineTo(28, 56); ctx.lineTo(36, 44);
    ctx.fill();
  });
  addCanvasTexture(scene, 'arrow', 32, 32, (ctx) => {
    ctx.fillStyle = 'rgba(255,214,100,0.95)';
    ctx.strokeStyle = 'rgba(40,25,10,0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(4, 10); ctx.lineTo(18, 10); ctx.lineTo(18, 3); ctx.lineTo(30, 16); ctx.lineTo(18, 29); ctx.lineTo(18, 22); ctx.lineTo(4, 22);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  });
  addCanvasTexture(scene, 'patch', 256, 256, (ctx) => {
    const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0, 'rgba(255,255,255,0.5)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
  });
}
