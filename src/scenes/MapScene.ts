import Phaser from 'phaser';
import { COLORS, ROW_COLORS, SCENE } from '../config.ts';
import { WORLDS, LEVELS_PER_WORLD, RUSH_UNLOCK_LEVEL } from '../game/Levels.ts';
import type { WorldInfo } from '../game/Levels.ts';
import { progress } from '../game/Progress.ts';
import { sounds } from '../audio/SoundManager.ts';
import { crazyGames } from '../sdk/CrazyGamesSDK.ts';
import { button, drawLock, onViewportResize, starString, text, viewport } from '../ui/ui.ts';
import type { Viewport } from '../ui/ui.ts';

interface MapData {
  unlockedWorld?: number;
}

export class MapScene extends Phaser.Scene {
  private vp!: Viewport;
  private picker: Phaser.GameObjects.Container | null = null;
  private leaving = false;
  private unlockedWorld = 0;

  constructor() {
    super({ key: SCENE.MAP });
  }

  init(data: MapData = {}) {
    this.unlockedWorld = data.unlockedWorld ?? 0;
    this.picker = null;
    this.leaving = false;
  }

  create() {
    crazyGames.gameplayStop();
    this.vp = viewport(this);
    const { vp } = this;
    const u = vp.u;
    const L = vp.landscape;

    const bg = this.add.graphics();
    bg.fillGradientStyle(COLORS.bgDeep, COLORS.bgDeep, COLORS.bgPanel, COLORS.bgPanel, 1);
    bg.fillRect(0, 0, vp.W, vp.H);

    // Header
    const cx = vp.x(L ? 500 : 230);
    text(this, cx, vp.y(L ? 48 : 40), 'ONE SHIFT', (L ? 40 : 34) * u, COLORS.accent, true);
    this.drawLogoTiles(cx, vp.y(L ? 84 : 72));
    text(this, vp.x(L ? 90 : 52), vp.y(L ? 48 : 40), `★ ${progress.totalStars()}`, (L ? 22 : 18) * u, COLORS.warning, true);
    const sound = button(this, vp.x(L ? 920 : 410), vp.y(L ? 48 : 40), (L ? 110 : 76) * u, (L ? 40 : 34) * u,
      sounds.isMuted() ? 'Sound off' : 'Sound', () => {
        const muted = sounds.toggleMute();
        sound.label.setText(muted ? 'Sound off' : 'Sound');
      }, { fontPx: (L ? 15 : 12) * u, silent: true });

    // Continue
    const next = progress.maxLevel();
    const cont = () => this.play(next);
    button(this, cx, vp.y(L ? 140 : 126), (L ? 340 : 300) * u, (L ? 58 : 56) * u, `Continue · Level ${next}`, cont, { primary: true, fontPx: (L ? 22 : 20) * u });
    this.input.keyboard?.on('keydown', (e: KeyboardEvent) => {
      sounds.resume();
      if (!this.picker && (e.code === 'Enter' || e.code === 'Space')) cont();
    });
    this.input.on('pointerdown', () => sounds.resume());

    // World cards + Shift Rush
    const items = WORLDS.length + 1;
    for (let k = 0; k < items; k++) {
      let x: number;
      let y: number;
      let w: number;
      let h: number;
      if (L) {
        const col = k % 2;
        const row = Math.floor(k / 2);
        w = 410 * u; h = 82 * u;
        x = vp.x(col === 0 ? 285 : 715);
        y = vp.y(222 + row * 96);
      } else {
        w = 400 * u; h = 62 * u;
        x = cx;
        y = vp.y(196 + k * 70);
      }
      if (k < WORLDS.length) this.worldCard(WORLDS[k], x, y, w, h);
      else this.rushCard(x, y, w, h);
    }

    onViewportResize(this, () => this.scene.restart({}));
    this.cameras.main.fadeIn(160, 10, 15, 46);

    if (this.unlockedWorld) {
      const w = WORLDS.find(x => x.id === this.unlockedWorld);
      if (w) this.time.delayedCall(350, () => {
        sounds.playVictory();
        this.toast(`World ${w.id} unlocked: ${w.name}!`);
      });
    }
  }

  private drawLogoTiles(cx: number, y: number) {
    const u = this.vp.u;
    const s = 9 * u;
    for (let i = 0; i < 4; i++) {
      const r = this.add.rectangle(cx + (i - 1.5) * (s + 4 * u), y, s, s, ROW_COLORS[i]).setRounded(2 * u);
      this.tweens.add({ targets: r, y: y - 4 * u, duration: 600, yoyo: true, repeat: -1, delay: i * 120, ease: 'Sine.InOut' });
    }
  }

  private worldStats(w: WorldInfo) {
    const max = progress.maxLevel();
    const unlocked = max >= w.first;
    const last = w.last ?? Math.max(w.first + LEVELS_PER_WORLD - 1, max - 1);
    const all = progress.allStars();
    let cleared = 0;
    let stars = 0;
    for (let l = w.first; l <= last; l++) {
      if (all[l]) { cleared++; stars += all[l]; }
    }
    const total = last - w.first + 1;
    return { unlocked, cleared, stars, total, complete: w.last !== null && cleared >= total };
  }

  private card(x: number, y: number, w: number, h: number, accent: number, enabled: boolean, onTap: () => void) {
    const u = this.vp.u;
    const bg = this.add.rectangle(0, 0, w, h, enabled ? COLORS.bgCard : COLORS.panelBg).setRounded(14 * u)
      .setStrokeStyle(1.5 * u, enabled ? accent : COLORS.panelBorder, enabled ? 0.8 : 1);
    const c = this.add.container(x, y, [bg]);
    c.setSize(w, h).setInteractive({ useHandCursor: true });
    let down = false;
    c.on('pointerdown', () => { down = true; this.tweens.add({ targets: c, scale: 0.97, duration: 60 }); });
    c.on('pointerout', () => { down = false; this.tweens.add({ targets: c, scale: 1, duration: 80 }); });
    c.on('pointerup', () => {
      this.tweens.add({ targets: c, scale: 1, duration: 80 });
      if (!down || this.picker) return;
      down = false;
      sounds.playClick();
      onTap();
    });
    return c;
  }

  private worldCard(wd: WorldInfo, x: number, y: number, w: number, h: number) {
    const u = this.vp.u;
    const L = this.vp.landscape;
    const st = this.worldStats(wd);
    const accent = st.complete ? COLORS.accent : COLORS.arrowStroke;
    const c = this.card(x, y, w, h, accent, st.unlocked, () => {
      if (!st.unlocked) { this.toast(`Finish World ${wd.id - 1} to unlock`); return; }
      if (wd.last === null) this.play(Math.max(progress.maxLevel(), wd.first));
      else this.openPicker(wd);
    });

    const bx = -w / 2 + h / 2 + 4 * u;
    const badge = this.add.circle(bx, 0, h * 0.32, st.complete ? COLORS.accent : st.unlocked ? COLORS.arrowBg : COLORS.slot);
    c.add(badge);
    if (!st.unlocked) {
      const g = this.add.graphics();
      drawLock(g, bx, 0, h * 0.36, COLORS.lock);
      c.add(g);
    } else {
      c.add(text(this, bx, 0, st.complete ? '✓' : String(wd.id), h * 0.3, st.complete ? COLORS.bgDeep : COLORS.text, true));
    }

    const tx = bx + h * 0.5;
    c.add(text(this, tx, -h * 0.17, wd.name, (L ? 20 : 17) * u, st.unlocked ? COLORS.text : COLORS.textMuted, true).setOrigin(0, 0.5));
    const sub = st.unlocked
      ? (wd.last === null ? `${wd.tagline} · endless` : `${wd.tagline} · ${st.cleared}/${st.total}`)
      : wd.tagline;
    c.add(text(this, tx, h * 0.2, sub, (L ? 14 : 12) * u, COLORS.textMuted).setOrigin(0, 0.5));

    if (st.unlocked) {
      const right = wd.last === null ? `★ ${st.stars}` : `★ ${st.stars}/${st.total * 3}`;
      c.add(text(this, w / 2 - 16 * u, 0, right, (L ? 17 : 15) * u, COLORS.warning, true).setOrigin(1, 0.5));
    }

    if (this.unlockedWorld === wd.id) {
      this.tweens.add({ targets: c, scale: 1.04, duration: 420, yoyo: true, repeat: 3, delay: 300, ease: 'Sine.InOut' });
    }
  }

  private rushCard(x: number, y: number, w: number, h: number) {
    const u = this.vp.u;
    const L = this.vp.landscape;
    const unlocked = progress.maxLevel() > RUSH_UNLOCK_LEVEL;
    const c = this.card(x, y, w, h, COLORS.warning, unlocked, () => {
      if (!unlocked) { this.toast(`Clear level ${RUSH_UNLOCK_LEVEL} to unlock`); return; }
      this.go(() => this.scene.start(SCENE.GAME, { mode: 'rush' }));
    });
    const bx = -w / 2 + h / 2 + 4 * u;
    c.add(this.add.circle(bx, 0, h * 0.32, unlocked ? COLORS.warning : COLORS.slot));
    if (unlocked) c.add(text(this, bx, 0, '»', h * 0.42, COLORS.bgDeep, true));
    else {
      const g = this.add.graphics();
      drawLock(g, bx, 0, h * 0.36, COLORS.lock);
      c.add(g);
    }
    const tx = bx + h * 0.5;
    c.add(text(this, tx, -h * 0.17, 'Shift Rush', (L ? 20 : 17) * u, unlocked ? COLORS.warning : COLORS.textMuted, true).setOrigin(0, 0.5));
    c.add(text(this, tx, h * 0.2, unlocked ? 'Solve fast, beat the clock' : `Unlocks after level ${RUSH_UNLOCK_LEVEL}`, (L ? 14 : 12) * u, COLORS.textMuted).setOrigin(0, 0.5));
    if (unlocked) c.add(text(this, w / 2 - 16 * u, 0, `Best ${progress.rushBest()}`, (L ? 17 : 15) * u, COLORS.warning, true).setOrigin(1, 0.5));
  }

  // ─── Level picker ───────────────────────────────────────────────────────────
  private openPicker(wd: WorldInfo) {
    const { vp } = this;
    const u = vp.u;
    const max = progress.maxLevel();
    const shade = this.add.rectangle(0, 0, vp.W, vp.H, COLORS.black, 0.6).setOrigin(0).setInteractive();
    const pw = Math.min(400 * u, vp.W * 0.94);
    const ph = 330 * u;
    const cx = vp.W / 2;
    const cy = vp.H / 2;
    const box = this.add.rectangle(cx, cy, pw, ph, COLORS.panelBg).setRounded(20 * u).setStrokeStyle(2 * u, COLORS.accent).setInteractive();
    const c = this.add.container(0, 0, [shade, box]).setDepth(50);
    this.picker = c;
    shade.on('pointerup', () => this.closePicker());

    c.add(text(this, cx, cy - ph / 2 + 34 * u, `World ${wd.id} · ${wd.name}`, 21 * u, COLORS.accent, true));
    const cell = 64 * u;
    const gapX = (pw - 5 * cell) / 6;
    for (let i = 0; i < LEVELS_PER_WORLD; i++) {
      const lvl = wd.first + i;
      const open = lvl <= max;
      const stars = progress.stars(lvl);
      const x = cx - pw / 2 + gapX + cell / 2 + (i % 5) * (cell + gapX);
      const y = cy - 50 * u + Math.floor(i / 5) * (cell + 30 * u);
      const b = button(this, x, y, cell, cell, open ? String(lvl) : '', () => this.play(lvl), {
        fontPx: 20 * u, primary: open && lvl === max,
      });
      if (!open) {
        b.disableInteractive();
        b.setAlpha(0.45);
        const g = this.add.graphics();
        drawLock(g, 0, 0, cell * 0.36, COLORS.lock);
        b.add(g);
      }
      c.add(b);
      if (stars) c.add(text(this, x, y + cell / 2 + 11 * u, starString(stars), 13 * u, COLORS.warning, true));
    }
    c.add(button(this, cx, cy + ph / 2 - 34 * u, 150 * u, 44 * u, 'Close', () => this.closePicker(), { fontPx: 16 * u }));
    c.setAlpha(0);
    this.tweens.add({ targets: c, alpha: 1, duration: 140 });
  }

  private closePicker() {
    this.picker?.destroy();
    this.picker = null;
  }

  private play(level: number) {
    this.go(() => this.scene.start(SCENE.GAME, { mode: 'level', level }));
  }

  private go(fn: () => void) {
    if (this.leaving) return;
    this.leaving = true;
    sounds.resume();
    this.cameras.main.fadeOut(120, 10, 15, 46);
    this.cameras.main.once('camerafadeoutcomplete', fn);
  }

  private toast(msg: string) {
    const u = this.vp.u;
    const t = text(this, 0, 0, msg, 15 * u, COLORS.text, true);
    const bg = this.add.rectangle(0, 0, t.width + 32 * u, 38 * u, COLORS.panelBg, 0.96).setRounded(19 * u)
      .setStrokeStyle(1.5 * u, COLORS.accent);
    const c = this.add.container(this.vp.W / 2, this.vp.y(this.vp.VH - 22), [bg, t]).setDepth(60).setAlpha(0);
    this.tweens.add({ targets: c, alpha: 1, duration: 140 });
    this.tweens.add({ targets: c, alpha: 0, duration: 250, delay: 1900, onComplete: () => c.destroy() });
  }
}
