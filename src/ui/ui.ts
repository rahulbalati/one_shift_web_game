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

// ─── Buttons ──────────────────────────────────────────────────────────────────
export interface Button extends Phaser.GameObjects.Container {
  bg: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
}

export interface ButtonOpts {
  primary?: boolean;
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
  const fill = opts.color ?? (opts.primary ? COLORS.accent : COLORS.arrowBg);
  const txtColor = opts.textColor ?? (opts.primary ? COLORS.bgDeep : COLORS.text);
  const bg = scene.add.rectangle(0, 0, w, h, fill).setRounded(Math.min(h / 2, 14 * (h / 46)));
  if (!opts.primary) bg.setStrokeStyle(Math.max(1, h * 0.03), COLORS.arrowStroke);
  const t = text(scene, 0, 0, label, opts.fontPx ?? h * 0.36, txtColor, true);
  const c = scene.add.container(x, y, [bg, t]) as Button;
  c.bg = bg;
  c.label = t;
  c.setSize(w, h);
  c.setInteractive({ useHandCursor: true });

  let down = false;
  c.on('pointerover', () => scene.tweens.add({ targets: c, scale: 1.04, duration: 90 }));
  c.on('pointerout', () => {
    down = false;
    scene.tweens.add({ targets: c, scale: 1, duration: 90 });
  });
  c.on('pointerdown', () => {
    down = true;
    scene.tweens.add({ targets: c, scale: 0.94, duration: 60 });
  });
  c.on('pointerup', () => {
    scene.tweens.add({ targets: c, scale: 1, duration: 90 });
    if (!down) return;
    down = false;
    sounds.resume();
    if (!opts.silent) sounds.playClick();
    onClick();
  });
  return c;
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
