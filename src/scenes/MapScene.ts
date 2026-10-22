import Phaser from 'phaser';
import { BG_RGB, COLORS, ROW_COLORS, SCENE } from '../config.ts';
import { WORLDS, LEVELS_PER_WORLD, RUSH_UNLOCK_LEVEL, worldOf } from '../game/Levels.ts';
import type { WorldInfo } from '../game/Levels.ts';
import { progress } from '../game/Progress.ts';
import { sounds } from '../audio/SoundManager.ts';
import { platform } from '../platform/index.ts';
import { button, chip, drawBackground, drawLock, iconButton, onViewportResize, panelBox, starString, text, viewport } from '../ui/ui.ts';
import type { Viewport } from '../ui/ui.ts';

interface MapData {
  unlockedWorld?: number;
  world?: number;
}

// Node layout along the winding path, bottom (first level) to top (last level).
// Offsets are in virtual units across the path; steps are along it.
// Neighbouring nodes always differ by >= 60 across, so star labels never collide.
const WIND = [0, -120, -30, 90, 150, 40, -80, -140, -40, 80];

export class MapScene extends Phaser.Scene {
  private vp!: Viewport;
  private overlay: Phaser.GameObjects.Container | null = null;
  private leaving = false;
  private unlockedWorld = 0;
  private worldIdx = 0;
  private worldObjs: Phaser.GameObjects.GameObject[] = [];

  constructor() {
    super({ key: SCENE.MAP });
  }

  init(data: MapData = {}) {
    this.unlockedWorld = data.unlockedWorld ?? 0;
    this.overlay = null;
    this.leaving = false;
    this.worldObjs = [];
    const max = progress.maxLevel();
    const shown = data.world ?? (this.unlockedWorld || worldOf(max).id);
    this.worldIdx = Math.max(0, Math.min(WORLDS.length - 1, shown - 1));
  }

  create() {
    platform.gameplayStop();
    platform.setLevelContext(null);
    this.vp = viewport(this);
    drawBackground(this, this.vp);
    const { vp } = this;
    const u = vp.u;
    const L = vp.landscape;

    // Header: stars, title, settings
    const starsX = vp.x(L ? 96 : 66);
    chip(this, starsX, vp.y(L ? 46 : 40), (L ? 130 : 104) * u, (L ? 44 : 40) * u);
    text(this, starsX, vp.y(L ? 44 : 38), `★ ${progress.totalStars()}`, (L ? 20 : 17) * u, COLORS.warning, true);
    const cx = vp.x(L ? 500 : 230);
    text(this, cx, vp.y(L ? 42 : 36), 'ONE SHIFT', (L ? 38 : 30) * u, COLORS.accent, true);
    this.logoDots(cx, vp.y(L ? 76 : 64));
    iconButton(this, vp.x(L ? 944 : 418), vp.y(L ? 46 : 40), (L ? 56 : 48) * u, 'gear', () => this.openSettings());

    this.drawWorld();

    // Continue
    const next = progress.maxLevel();
    const cont = () => this.play(next);
    button(this, vp.x(L ? 250 : 230), vp.y(L ? 360 : 668), (L ? 330 : 300) * u, (L ? 60 : 54) * u,
      `Continue · Level ${next}`, cont, { primary: true, fontPx: (L ? 22 : 20) * u });

    this.rushCard(vp.x(L ? 250 : 230), vp.y(L ? 470 : 736), (L ? 330 : 380) * u, (L ? 76 : 54) * u);

    this.input.keyboard?.on('keydown', (e: KeyboardEvent) => {
      sounds.resume();
      if (this.overlay) return;
      if (e.code === 'Enter' || e.code === 'Space') cont();
      if (e.code === 'ArrowLeft') this.switchWorld(-1);
      if (e.code === 'ArrowRight') this.switchWorld(1);
    });
    this.input.on('pointerdown', () => sounds.resume());

    onViewportResize(this, () => this.scene.restart({ world: this.worldIdx + 1 }));
    this.cameras.main.fadeIn(160, ...BG_RGB);

    if (this.unlockedWorld) {
      const w = WORLDS.find(x => x.id === this.unlockedWorld);
      if (w) this.time.delayedCall(350, () => {
        sounds.playVictory();
        this.toast(`World ${w.id} unlocked: ${w.name}!`);
      });
    }
  }

  private logoDots(cx: number, y: number) {
    const u = this.vp.u;
    const s = 9 * u;
    for (let i = 0; i < 4; i++) {
      const r = this.add.rectangle(cx + (i - 1.5) * (s + 5 * u), y, s, s, ROW_COLORS[i]).setRounded(2.5 * u);
      this.tweens.add({ targets: r, y: y - 4 * u, duration: 600, yoyo: true, repeat: -1, delay: i * 120, ease: 'Sine.InOut' });
    }
  }

  // ─── World banner + level path ──────────────────────────────────────────────
  private switchWorld(d: number) {
    const n = this.worldIdx + d;
    if (n < 0 || n >= WORLDS.length) return;
    this.worldIdx = n;
    sounds.playClick();
    this.drawWorld();
  }

  private worldLevels(w: WorldInfo): number[] {
    if (w.last !== null) return Array.from({ length: w.last - w.first + 1 }, (_, i) => w.first + i);
    // Endless world: show the window of 10 that contains the player's current level
    const max = progress.maxLevel();
    const start = max >= w.first ? w.first + Math.floor((max - w.first) / LEVELS_PER_WORLD) * LEVELS_PER_WORLD : w.first;
    return Array.from({ length: LEVELS_PER_WORLD }, (_, i) => start + i);
  }

  private drawWorld() {
    for (const o of this.worldObjs) o.destroy();
    this.worldObjs = [];
    const keep = (...o: Phaser.GameObjects.GameObject[]) => { this.worldObjs.push(...o); };
    const { vp } = this;
    const u = vp.u;
    const L = vp.landscape;
    const w = WORLDS[this.worldIdx];
    const max = progress.maxLevel();
    const unlocked = max >= w.first;
    const levels = this.worldLevels(w);
    const all = progress.allStars();
    const cleared = levels.filter(l => all[l]).length;
    const stars = levels.reduce((a, l) => a + (all[l] ?? 0), 0);

    // Banner with world arrows
    const bx = vp.x(L ? 250 : 230);
    const by = vp.y(L ? 160 : 112);
    const bw = (L ? 290 : 280) * u;
    const ch = chip(this, bx, by, bw, (L ? 70 : 62) * u, COLORS.panelBg);
    keep(ch.base, ch.face);
    keep(text(this, bx, by - 13 * u, `World ${w.id} · ${w.name}`, (L ? 19 : 17) * u, unlocked ? COLORS.text : COLORS.textMuted, true));
    const sub = !unlocked ? `Finish World ${w.id - 1} to unlock`
      : w.last === null ? `${w.tagline} · endless · ★ ${stars}`
      : `${cleared}/${levels.length} cleared · ★ ${stars}/${levels.length * 3}`;
    keep(text(this, bx, by + 13 * u, sub, (L ? 13 : 12) * u, COLORS.textMuted));
    const arrowSize = (L ? 48 : 44) * u;
    if (this.worldIdx > 0) keep(iconButton(this, bx - bw / 2 - arrowSize * 0.8, by, arrowSize, 'chevron-left', () => this.switchWorld(-1)));
    if (this.worldIdx < WORLDS.length - 1) keep(iconButton(this, bx + bw / 2 + arrowSize * 0.8, by, arrowSize, 'chevron-right', () => this.switchWorld(1)));

    // Path geometry
    const pts = levels.map((_, i) => L
      ? { x: vp.x(730 + WIND[i] * 1.15), y: vp.y(566 - i * 50) }
      : { x: vp.x(230 + WIND[i]), y: vp.y(588 - i * 46) });
    const g = this.add.graphics();
    keep(g);
    g.lineStyle(14 * u, COLORS.arrowStroke, 1);
    g.strokePoints(pts.map(p => new Phaser.Math.Vector2(p.x, p.y + 3 * u)), false);
    g.lineStyle(12 * u, COLORS.arrowBg, 1);
    g.strokePoints(pts.map(p => new Phaser.Math.Vector2(p.x, p.y)), false);

    const r = (L ? 23 : 20) * u;
    levels.forEach((lvl, i) => {
      const { x, y } = pts[i];
      const done = (all[lvl] ?? 0) > 0;
      const current = lvl === max;
      const open = lvl <= max;
      const face = done ? COLORS.accent : current ? COLORS.warning : COLORS.arrowBg;
      const shadow = done ? COLORS.accentShadow : current ? COLORS.warningShadow : COLORS.arrowStroke;
      const base = this.add.circle(x, y + 3 * u, r, shadow);
      const top = this.add.circle(x, y, r, face);
      keep(base, top);
      if (current) {
        const ring = this.add.circle(x, y, r + 5 * u).setStrokeStyle(3 * u, COLORS.white, 0.9);
        keep(ring);
        this.tweens.add({ targets: ring, scale: 1.2, alpha: 0, duration: 900, repeat: -1 });
      }
      if (open) {
        keep(text(this, x, y - 1 * u, String(lvl), (L ? 16 : 15) * u, done ? COLORS.onAccent : current ? COLORS.onWarning : COLORS.text, true));
      } else {
        const lg = this.add.graphics();
        drawLock(lg, x, y, r * 0.9, COLORS.textMuted);
        keep(lg);
      }
      if (done) keep(text(this, x, y + r + 9 * u, starString(all[lvl]), 11 * u, COLORS.warning, true));
      if (open) {
        top.setInteractive({ useHandCursor: true });
        top.on('pointerup', () => { if (!this.overlay) { sounds.playClick(); this.play(lvl); } });
      }
    });

    if (this.unlockedWorld === w.id) {
      this.tweens.add({ targets: [ch.face, ch.base], scaleX: 1.05, scaleY: 1.05, duration: 420, yoyo: true, repeat: 3, delay: 300 });
    }
  }

  // ─── Shift Rush card ────────────────────────────────────────────────────────
  private rushCard(x: number, y: number, w: number, h: number) {
    const u = this.vp.u;
    const unlocked = progress.maxLevel() > RUSH_UNLOCK_LEVEL;
    const back = chip(this, x, y, w, h, unlocked ? COLORS.panelBg : COLORS.bgCard);
    back.face.setStrokeStyle(2 * u, unlocked ? COLORS.warning : COLORS.arrowBg, unlocked ? 0.9 : 1);
    const ix = x - w / 2 + h * 0.55;
    this.add.circle(ix, y - 1 * u, h * 0.32, unlocked ? COLORS.warning : COLORS.arrowBg);
    if (unlocked) {
      text(this, ix, y - 2 * u, '»', h * 0.42, COLORS.onWarning, true);
    } else {
      const lg = this.add.graphics();
      drawLock(lg, ix, y, h * 0.36, COLORS.textMuted);
    }
    const tx = ix + h * 0.5;
    text(this, tx, y - h * 0.18, 'Shift Rush', 17 * u, unlocked ? COLORS.warning : COLORS.textMuted, true).setOrigin(0, 0.5);
    text(this, tx, y + h * 0.2, unlocked ? 'Solve fast, beat the clock' : `Unlocks after level ${RUSH_UNLOCK_LEVEL}`, 12 * u, COLORS.textMuted).setOrigin(0, 0.5);
    if (unlocked) text(this, x + w / 2 - 16 * u, y - 1 * u, `Best ${progress.rushBest()}`, 15 * u, COLORS.warning, true).setOrigin(1, 0.5);
    back.face.setInteractive({ useHandCursor: true });
    back.face.on('pointerup', () => {
      if (this.overlay) return;
      sounds.playClick();
      if (!unlocked) { this.toast(`Clear level ${RUSH_UNLOCK_LEVEL} to unlock`); return; }
      this.go(() => this.scene.start(SCENE.GAME, { mode: 'rush' }));
    });
  }

  // ─── Settings ───────────────────────────────────────────────────────────────
  private openSettings() {
    if (this.overlay) return;
    const { vp } = this;
    const u = vp.u;
    const cx = vp.W / 2;
    const cy = vp.H / 2;
    const w = Math.min(360 * u, vp.W * 0.92);
    const h = 300 * u;
    const shade = this.add.rectangle(0, 0, vp.W, vp.H, 0x0b0620, 0.62).setOrigin(0).setInteractive();
    const { base, face, shine } = panelBox(this, cx, cy, w, h, u);
    face.setInteractive();
    const c = this.add.container(0, 0, [shade, base, face, shine]).setDepth(50);
    this.overlay = c;
    c.add(text(this, cx, cy - 112 * u, 'Settings', 26 * u, COLORS.text, true));
    const ts = 56 * u;
    const row = cy - 30 * u;
    const music = iconButton(this, cx - 60 * u, row, ts, 'music', () => {
      music.setIcon('music', sounds.toggleMusic());
      ml.setText(sounds.musicOn() ? 'Music on' : 'Music off');
    }, { silent: true });
    music.setIcon('music', !sounds.musicOn());
    const ml = text(this, cx - 60 * u, row + 44 * u, sounds.musicOn() ? 'Music on' : 'Music off', 12 * u, COLORS.textMuted, true);
    const sfx = iconButton(this, cx + 60 * u, row, ts, 'sound', () => {
      const off = sounds.toggleMute();
      sfx.setIcon('sound', off);
      sl.setText(off ? 'Sound off' : 'Sound on');
    }, { silent: true });
    sfx.setIcon('sound', sounds.isMuted());
    const sl = text(this, cx + 60 * u, row + 44 * u, sounds.isMuted() ? 'Sound off' : 'Sound on', 12 * u, COLORS.textMuted, true);
    c.add([music, ml, sfx, sl]);
    c.add(text(this, cx, cy + 50 * u, 'Slide rows and columns to put every\ntile in its place. Fewer moves = more stars.', 13 * u, COLORS.textMuted).setLineSpacing(3 * u));
    c.add(button(this, cx, cy + 108 * u, 180 * u, 50 * u, 'Close', () => this.closeOverlay(), { primary: true, fontPx: 17 * u }));
  }

  private closeOverlay() {
    this.overlay?.destroy();
    this.overlay = null;
  }

  private play(level: number) {
    this.go(() => this.scene.start(SCENE.GAME, { mode: 'level', level }));
  }

  private go(fn: () => void) {
    if (this.leaving) return;
    this.leaving = true;
    sounds.resume();
    this.cameras.main.fadeOut(120, ...BG_RGB);
    this.cameras.main.once('camerafadeoutcomplete', fn);
  }

  private toast(msg: string) {
    const u = this.vp.u;
    const t = text(this, 0, -1.5 * u, msg, 15 * u, COLORS.text, true);
    const back = chip(this, 0, 0, t.width + 34 * u, 40 * u, COLORS.panelBg);
    back.face.setStrokeStyle(2 * u, COLORS.accent);
    const c = this.add.container(this.vp.W / 2, this.vp.y(this.vp.landscape ? 600 : 762), [back.base, back.face, t]).setDepth(60).setAlpha(0);
    this.tweens.add({ targets: c, alpha: 1, duration: 140 });
    this.tweens.add({ targets: c, alpha: 0, duration: 250, delay: 1900, onComplete: () => c.destroy() });
  }
}
