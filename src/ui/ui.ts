import Phaser from 'phaser';
import { COLORS, FONT, hex } from '../config.ts';
import { sounds } from '../audio/SoundManager.ts';

// ─── Responsive viewport ──────────────────────────────────────────────────────
// Layouts are authored in "virtual units" for a portrait (460×780) or a
// landscape (1000×620) design, then scaled uniformly to the real canvas.
export interface Viewport {
  W: number;
  H: number;
  landscape: boolean;
  u: number;                 // canvas px per virtual unit
  VW: number;
  VH: number;
  x: (v: number) => number;  // virtual → canvas
  y: (v: number) => number;
}

export function viewport(scene: Phaser.Scene): Viewport {
  const W = scene.scale.width;
  const H = scene.scale.height;
  const landscape = W / H >= 1.15;
  const VW = landscape ? 1000 : 460;
  const VH = landscape ? 620 : 780;
  const u = Math.min(W / VW, H / VH);
  const ox = (W - VW * u) / 2;
  const oy = (H - VH * u) / 2;
  return { W, H, landscape, u, VW, VH, x: v => ox + v * u, y: v => oy + v * u };
}

/** Darkens a 0xRRGGBB colour by factor k (0–1). */
export function darken(c: number, k = 0.65): number {
  const r = Math.round(((c >> 16) & 255) * k);
  const g = Math.round(((c >> 8) & 255) * k);
  const b = Math.round((c & 255) * k);
  return (r << 16) | (g << 8) | b;
}

// ─── Themed background ────────────────────────────────────────────────────────
export function drawBackground(scene: Phaser.Scene, vp: Viewport) {
  const { W, H, u } = vp;
  const g = scene.add.graphics().setDepth(-10);
  g.fillStyle(COLORS.bgDeep, 1);
  g.fillRect(0, 0, W, H);
  // Soft raised floor and a lighter haze behind the play area
  g.fillStyle(COLORS.bgPanel, 1);
  g.fillEllipse(W / 2, H * 1.02, Math.max(W * 1.5, 900 * u), H * 0.62);
  g.fillStyle(0x2c1c62, 1);
  g.fillEllipse(W / 2, H * 0.45, Math.max(W, H) * 0.9, Math.max(W, H) * 0.9);
  // Scattered sparkles (fixed pattern so it never flickers between scenes)
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 26; i++) {
    const x = rnd() * W;
    const y = rnd() * H;
    const r = (1 + rnd() * 2.2) * u;
    g.fillStyle(COLORS.white, 0.12 + rnd() * 0.25);
    g.fillCircle(x, y, r);
  }
}

// ─── Text ─────────────────────────────────────────────────────────────────────
export function text(
  scene: Phaser.Scene,
  x: number,
  y: number,
  str: string,
  sizePx: number,
  color: number | string = COLORS.text,
  bold = false,
): Phaser.GameObjects.Text {
  // Never smaller than 11 CSS px on screen (CrazyGames checks legibility at DPR 1)
  const cssToCanvas = scene.scale.width / Math.max(1, scene.scale.displaySize.width || scene.scale.width);
  const minPx = 11 * cssToCanvas;
  return scene.add.text(x, y, str, {
    fontFamily: FONT,
    fontSize: `${Math.round(Math.max(minPx, sizePx))}px`,
    fontStyle: bold ? 'bold' : 'normal',
    color: typeof color === 'number' ? hex(color) : color,
    align: 'center',
  }).setOrigin(0.5);
}

// ─── Chunky 3D buttons ────────────────────────────────────────────────────────
export interface Button extends Phaser.GameObjects.Container {
  bg: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
}

export interface ButtonOpts {
  primary?: boolean;
  gold?: boolean;
  fontPx?: number;
  color?: number;
  textColor?: number;
  silent?: boolean;
}

export function button(
  scene: Phaser.Scene,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  onClick: () => void,
  opts: ButtonOpts = {},
): Button {
  const fill = opts.color ?? (opts.primary ? COLORS.accent : opts.gold ? COLORS.warning : COLORS.arrowBg);
  const shadow = opts.primary ? COLORS.accentShadow : opts.gold ? COLORS.warningShadow : COLORS.arrowStroke;
  const txtColor = opts.textColor ?? (opts.primary ? COLORS.onAccent : opts.gold ? COLORS.onWarning : COLORS.text);
  const depth = Math.max(2, h * 0.09);
  const r = Math.min(h / 2, h * 0.3);
  const base = scene.add.rectangle(0, depth / 2, w, h, opts.color ? darken(fill) : shadow).setRounded(r);
  const bg = scene.add.rectangle(0, -depth / 2, w, h - depth, fill).setRounded(r);
  const t = text(scene, 0, -depth / 2, label, opts.fontPx ?? h * 0.36, txtColor, true);
  const c = scene.add.container(x, y, [base, bg, t]) as Button;
  c.bg = bg;
  c.label = t;
  c.setSize(w, h);
  c.setInteractive({ useHandCursor: true });
  // Pressing sinks the face onto its shadow
  let down = false;
  const sink = (on: boolean) => { bg.y = -depth / 2 + (on ? depth * 0.6 : 0); t.y = bg.y; };
  c.on('pointerover', () => scene.tweens.add({ targets: c, scale: 1.04, duration: 90 }));
  c.on('pointerout', () => { down = false; sink(false); scene.tweens.add({ targets: c, scale: 1, duration: 90 }); });
  c.on('pointerdown', () => { down = true; sink(true); });
  c.on('pointerup', () => {
    sink(false);
    if (!down) return;
    down = false;
    sounds.resume();
    if (!opts.silent) sounds.playClick();
    onClick();
  });
  return c;
}

// ─── Vector icons ─────────────────────────────────────────────────────────────
export type IconName =
  | 'map' | 'pause' | 'play' | 'undo' | 'retry' | 'bulb' | 'music' | 'sound'
  | 'help' | 'skip' | 'link' | 'gear' | 'chevron-left' | 'chevron-right' | 'chevron-up' | 'chevron-down';

function arrowHead(g: Phaser.GameObjects.Graphics, x: number, y: number, dx: number, dy: number, size: number) {
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const px = -uy;
  const py = ux;
  g.fillTriangle(
    x + ux * size, y + uy * size,
    x - ux * size * 0.4 + px * size * 0.75, y - uy * size * 0.4 + py * size * 0.75,
    x - ux * size * 0.4 - px * size * 0.75, y - uy * size * 0.4 - py * size * 0.75,
  );
}

function arcArrow(g: Phaser.GameObjects.Graphics, cx: number, cy: number, r: number, a0: number, a1: number,
  anticlockwise: boolean, lw: number, color: number) {
  g.lineStyle(lw, color, 1);
  g.beginPath();
  g.arc(cx, cy, r, a0, a1, anticlockwise);
  g.strokePath();
  const ex = cx + Math.cos(a1) * r;
  const ey = cy + Math.sin(a1) * r;
  const tx = anticlockwise ? Math.sin(a1) : -Math.sin(a1);
  const ty = anticlockwise ? -Math.cos(a1) : Math.cos(a1);
  g.fillStyle(color, 1);
  arrowHead(g, ex, ey, tx, ty, lw * 1.6);
}

/** Draws an icon centred on (0,0) fitting a box of size s. */
export function drawIcon(g: Phaser.GameObjects.Graphics, name: IconName, s: number, color: number) {
  const lw = Math.max(2, s * 0.11);
  g.fillStyle(color, 1);
  g.lineStyle(lw, color, 1);
  switch (name) {
    case 'pause':
      g.fillRoundedRect(-s * 0.28, -s * 0.3, s * 0.2, s * 0.6, s * 0.05);
      g.fillRoundedRect(s * 0.08, -s * 0.3, s * 0.2, s * 0.6, s * 0.05);
      break;
    case 'play':
      g.fillTriangle(-s * 0.2, -s * 0.32, -s * 0.2, s * 0.32, s * 0.32, 0);
      break;
    case 'undo':
      arcArrow(g, s * 0.04, s * 0.08, s * 0.26, 0.35, -Math.PI + 0.25, true, lw, color);
      break;
    case 'retry':
      arcArrow(g, 0, 0, s * 0.27, -Math.PI / 2 + 0.5, -Math.PI / 2 + Math.PI * 2 - 0.2, false, lw, color);
      break;
    case 'bulb':
      g.fillCircle(0, -s * 0.08, s * 0.25);
      g.fillRoundedRect(-s * 0.12, s * 0.12, s * 0.24, s * 0.12, s * 0.03);
      g.fillRoundedRect(-s * 0.09, s * 0.27, s * 0.18, s * 0.07, s * 0.03);
      break;
    case 'map': {
      const P = [[-0.34, -0.24], [-0.11, -0.32], [0.11, -0.24], [0.34, -0.32], [0.34, 0.24], [0.11, 0.32], [-0.11, 0.24], [-0.34, 0.32]];
      g.beginPath();
      g.moveTo(P[0][0] * s, P[0][1] * s);
      for (let i = 1; i < P.length; i++) g.lineTo(P[i][0] * s, P[i][1] * s);
      g.closePath();
      g.strokePath();
      g.lineBetween(-s * 0.11, -s * 0.32, -s * 0.11, s * 0.24);
      g.lineBetween(s * 0.11, -s * 0.24, s * 0.11, s * 0.32);
      break;
    }
    case 'music':
      g.fillEllipse(-s * 0.12, s * 0.2, s * 0.24, s * 0.18);
      g.fillRect(-s * 0.02, -s * 0.3, lw, s * 0.5);
      g.lineBetween(-s * 0.02 + lw / 2, -s * 0.3, s * 0.24, -s * 0.16);
      g.lineBetween(s * 0.24, -s * 0.16, s * 0.24, -s * 0.02);
      break;
    case 'sound':
      g.fillPoints([
        new Phaser.Math.Vector2(-s * 0.34, -s * 0.11), new Phaser.Math.Vector2(-s * 0.16, -s * 0.11),
        new Phaser.Math.Vector2(s * 0.04, -s * 0.3), new Phaser.Math.Vector2(s * 0.04, s * 0.3),
        new Phaser.Math.Vector2(-s * 0.16, s * 0.11), new Phaser.Math.Vector2(-s * 0.34, s * 0.11),
      ], true);
      g.beginPath();
      g.arc(s * 0.06, 0, s * 0.17, -0.8, 0.8, false);
      g.strokePath();
      g.beginPath();
      g.arc(s * 0.06, 0, s * 0.3, -0.8, 0.8, false);
      g.strokePath();
      break;
    case 'help':
      g.beginPath();
      g.arc(0, -s * 0.1, s * 0.17, Math.PI, Math.PI * 0.35, false);
      g.strokePath();
      g.lineBetween(s * 0.07, s * 0.05, 0, s * 0.12);
      g.fillCircle(0, s * 0.3, lw * 0.7);
      break;
    case 'skip':
      g.fillTriangle(-s * 0.32, -s * 0.26, -s * 0.32, s * 0.26, 0, 0);
      g.fillTriangle(0, -s * 0.26, 0, s * 0.26, s * 0.32, 0);
      break;
    case 'gear': {
      g.lineStyle(s * 0.13, color, 1);
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        g.lineBetween(Math.cos(a) * s * 0.2, Math.sin(a) * s * 0.2, Math.cos(a) * s * 0.36, Math.sin(a) * s * 0.36);
      }
      g.lineStyle(lw, color, 1);
      g.strokeCircle(0, 0, s * 0.2);
      break;
    }
    case 'link':
      g.strokeCircle(-s * 0.12, 0, s * 0.18);
      g.strokeCircle(s * 0.12, 0, s * 0.18);
      break;
    case 'chevron-left':
    case 'chevron-right':
    case 'chevron-up':
    case 'chevron-down': {
      const d = name.slice(8);
      const rot = d === 'right' ? 0 : d === 'down' ? Math.PI / 2 : d === 'left' ? Math.PI : -Math.PI / 2;
      const pt = (x: number, y: number) => ({ x: (x * Math.cos(rot) - y * Math.sin(rot)) * s, y: (x * Math.sin(rot) + y * Math.cos(rot)) * s });
      for (const off of [-0.14, 0.14]) {
        const a = pt(off - 0.1, -0.22);
        const b = pt(off + 0.1, 0);
        const c = pt(off - 0.1, 0.22);
        g.lineBetween(a.x, a.y, b.x, b.y);
        g.lineBetween(b.x, b.y, c.x, c.y);
      }
      break;
    }
  }
}

// ─── Icon buttons ─────────────────────────────────────────────────────────────
export interface IconButton extends Phaser.GameObjects.Container {
  setIcon(name: IconName, off?: boolean): void;
  setBadge(value: string | null, color?: number): void;
  badge: Phaser.GameObjects.Container | null;
}

export interface IconButtonOpts {
  gold?: boolean;
  primary?: boolean;
  iconColor?: number;
  silent?: boolean;
}

export function iconButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  size: number,
  icon: IconName,
  onClick: () => void,
  opts: IconButtonOpts = {},
): IconButton {
  const fill = opts.gold ? COLORS.warning : opts.primary ? COLORS.accent : COLORS.arrowBg;
  const shadow = opts.gold ? COLORS.warningShadow : opts.primary ? COLORS.accentShadow : COLORS.arrowStroke;
  const iconColor = opts.iconColor ?? (opts.gold ? COLORS.onWarning : opts.primary ? COLORS.onAccent : COLORS.text);
  const depth = Math.max(2, size * 0.08);
  const r = size * 0.3;
  const base = scene.add.rectangle(0, depth / 2, size, size, shadow).setRounded(r);
  const face = scene.add.rectangle(0, 0, size, size - depth, fill).setRounded(r);
  const g = scene.add.graphics();
  const c = scene.add.container(x, y, [base, face, g]) as IconButton;
  c.badge = null;
  const offset = -depth / 2;
  face.y = offset;
  g.y = offset;
  c.setIcon = (name: IconName, off = false) => {
    g.clear();
    drawIcon(g, name, size * 0.62, iconColor);
    if (off) {
      g.lineStyle(Math.max(2, size * 0.07), COLORS.danger, 1);
      g.lineBetween(-size * 0.28, -size * 0.28, size * 0.28, size * 0.28);
    }
  };
  c.setIcon(icon);
  c.setBadge = (value: string | null, color: number = COLORS.danger) => {
    c.badge?.destroy();
    c.badge = null;
    if (value === null) return;
    const br = size * 0.2;
    const bc = scene.add.circle(0, 0, br, color).setStrokeStyle(Math.max(1.5, size * 0.04), COLORS.bgDeep);
    const bt = text(scene, 0, 0, value, br * 1.15, COLORS.white, true);
    c.badge = scene.add.container(size / 2 - br * 0.5, -size / 2 + br * 0.4, [bc, bt]);
    c.add(c.badge);
  };
  c.setSize(size, size);
  c.setInteractive({ useHandCursor: true });
  let down = false;
  const sink = (on: boolean) => { face.y = offset + (on ? depth * 0.6 : 0); g.y = face.y; };
  c.on('pointerover', () => scene.tweens.add({ targets: c, scale: 1.05, duration: 90 }));
  c.on('pointerout', () => { down = false; sink(false); scene.tweens.add({ targets: c, scale: 1, duration: 90 }); });
  c.on('pointerdown', () => { down = true; sink(true); });
  c.on('pointerup', () => {
    sink(false);
    if (!down) return;
    down = false;
    sounds.resume();
    if (!opts.silent) sounds.playClick();
    onClick();
  });
  return c;
}

// ─── Panels and chips ─────────────────────────────────────────────────────────
/** A raised panel; returns its parts so callers can add content on top. */
export function panelBox(scene: Phaser.Scene, cx: number, cy: number, w: number, h: number, u: number) {
  const depth = 7 * u;
  const base = scene.add.rectangle(cx, cy + depth / 2, w, h, COLORS.panelBorder).setRounded(22 * u);
  const face = scene.add.rectangle(cx, cy - depth / 2, w, h - depth, COLORS.panelBg).setRounded(22 * u);
  const shine = scene.add.rectangle(cx, cy - h / 2 + 8 * u, w - 40 * u, 4 * u, COLORS.white, 0.08).setRounded(2 * u);
  return { base, face, shine };
}

/** A rounded label chip (used for moves, level name). */
export function chip(scene: Phaser.Scene, x: number, y: number, w: number, h: number, color: number = COLORS.arrowBg) {
  const depth = Math.max(2, h * 0.1);
  const base = scene.add.rectangle(x, y + depth / 2, w, h, COLORS.arrowStroke).setRounded(h * 0.32);
  const face = scene.add.rectangle(x, y - depth / 2, w, h - depth, color).setRounded(h * 0.32);
  return { base, face };
}

// ─── Small helpers ────────────────────────────────────────────────────────────
export function starString(n: number, of = 3): string {
  return '★'.repeat(n) + '☆'.repeat(Math.max(0, of - n));
}

/** Draws a small padlock centred on (x, y) into a Graphics object. */
export function drawLock(g: Phaser.GameObjects.Graphics, x: number, y: number, s: number, color: number) {
  g.lineStyle(s * 0.16, color, 1);
  g.beginPath();
  g.arc(x, y - s * 0.12, s * 0.24, Math.PI, 0, false);
  g.strokePath();
  g.fillStyle(color, 1);
  g.fillRoundedRect(x - s * 0.36, y - s * 0.1, s * 0.72, s * 0.56, s * 0.1);
  g.fillStyle(darken(color, 0.55), 1);
  g.fillCircle(x, y + s * 0.15, s * 0.07);
}

/** A short burst of diamond sparkles (lock-in / win feedback). */
export function sparkle(scene: Phaser.Scene, x: number, y: number, u: number, count = 6, colors: number[] = [COLORS.white, COLORS.warning]) {
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + Math.random() * 0.5;
    const d = (18 + Math.random() * 16) * u;
    const sz = (4 + Math.random() * 3) * u;
    const p = scene.add.rectangle(x, y, sz, sz, colors[i % colors.length]).setAngle(45).setDepth(30);
    scene.tweens.add({
      targets: p, x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, alpha: 0, scale: 0.4,
      duration: 380 + Math.random() * 160, ease: 'Cubic.Out', onComplete: () => p.destroy(),
    });
  }
}

/** Watches the canvas size and calls `onChange` (debounced) after a real resize. */
export function onViewportResize(scene: Phaser.Scene, onChange: () => void) {
  let lastW = scene.scale.width;
  let lastH = scene.scale.height;
  let timer: Phaser.Time.TimerEvent | null = null;
  const handler = () => {
    if (scene.scale.width === lastW && scene.scale.height === lastH) return;
    timer?.remove();
    timer = scene.time.delayedCall(60, () => {
      lastW = scene.scale.width;
      lastH = scene.scale.height;
      onChange();
    });
  };
  scene.scale.on('resize', handler);
  scene.events.once('shutdown', () => scene.scale.off('resize', handler));
}
