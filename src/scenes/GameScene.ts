import Phaser from 'phaser';
import {
  COLORS, ROW_COLORS, PATTERN_COLORS, SCENE, SHIFT_ANIM_MS, hex,
  RUSH_START_MS, RUSH_BONUS_MS, RUSH_PERFECT_BONUS_MS, RUSH_MAX_MS,
} from '../config.ts';
import type { MoveRecord, Puzzle, ShiftDirection } from '../types.ts';
import { reverseMove } from '../types.ts';
import {
  applyMove, canMove, correctCount, isCorrectAt, isLocked, isSolved, keysOf,
  lineIndices, linesFor, oneWayDir,
} from '../game/Board.ts';
import { solve } from '../game/Solver.ts';
import { buildLevel, buildRush, worldOf } from '../game/Levels.ts';
import { progress } from '../game/Progress.ts';
import { sounds, triggerHaptic } from '../audio/SoundManager.ts';
import { crazyGames } from '../sdk/CrazyGamesSDK.ts';
import { button, drawLock, onViewportResize, starString, text, viewport } from '../ui/ui.ts';
import type { Button, Viewport } from '../ui/ui.ts';

type Mode = 'level' | 'rush';
type Phase = 'play' | 'won' | 'failed' | 'rushover' | 'transition' | 'intro';

interface TileView {
  id: number;
  c: Phaser.GameObjects.Container;
  bg: Phaser.GameObjects.Rectangle;
  tw: Phaser.Tweens.Tween | null;
  correct: boolean;
}

interface ArrowView {
  move: MoveRecord;
  c: Phaser.GameObjects.Container;
}

interface RushState {
  score: number;
  index: number;
  timeLeft: number;
  seed: number;
}

interface Snapshot {
  puzzle: Puzzle;
  board: number[];
  history: MoveRecord[];
  moves: number;
  bonus: number;
  usedBonus: boolean;
  phase: Phase;
  stars: number;
  paused: boolean;
  rush?: RushState;
}

export interface GameData {
  mode?: Mode;
  level?: number;
  restore?: Snapshot;
}

interface DragState {
  id: number;
  x0: number;
  y0: number;
  t0: number;
  row: number;
  col: number;
  axis: 'x' | 'y' | null;
  fired: number;      // net shifts made by this drag (signed)
  blocked: boolean;
}

export class GameScene extends Phaser.Scene {
  private mode: Mode = 'level';
  private level = 1;
  private puzzle!: Puzzle;
  private board: number[] = [];
  private history: MoveRecord[] = [];
  private moves = 0;
  private bonus = 0;
  private usedBonus = false;
  private phase: Phase = 'play';
  private stars = 0;
  private paused = false;
  private rush: RushState | null = null;
  private restoring = false;
  private leaving = false;

  // Layout
  private vp!: Viewport;
  private ts = 0;          // tile size (px)
  private gap = 0;
  private step = 0;
  private bx0 = 0;         // board top-left
  private by0 = 0;
  private span = 0;
  private arrowSize = 0;
  private arrowOff = 0;

  // Views
  private tiles: TileView[] = [];
  private arrows: ArrowView[] = [];
  private boardObjs: Phaser.GameObjects.GameObject[] = [];
  private hintObjs: Phaser.GameObjects.GameObject[] = [];
  private hintTweens: Phaser.Tweens.Tween[] = [];
  private panel: Phaser.GameObjects.Container | null = null;
  private panelPrimary: (() => void) | null = null;
  private toastObj: Phaser.GameObjects.Container | null = null;
  private selection!: Phaser.GameObjects.Graphics;
  private keyboardUsed = false;
  private selRow = 0;
  private selCol = 0;

  // HUD
  private movesText!: Phaser.GameObjects.Text;
  private starsText!: Phaser.GameObjects.Text;
  private subText!: Phaser.GameObjects.Text;
  private barFill!: Phaser.GameObjects.Rectangle;
  private barW = 0;
  private barFrac = { v: 0 };
  private infoText: Phaser.GameObjects.Text | null = null;
  private undoBtn!: Button;

  private drag: DragState | null = null;

  constructor() {
    super({ key: SCENE.GAME });
  }

  // ─── Lifecycle ──────────────────────────────────────────────────────────────
  init(data: GameData = {}) {
    this.mode = data.mode ?? 'level';
    this.level = Math.max(1, data.level ?? progress.maxLevel());
    this.tiles = [];
    this.arrows = [];
    this.boardObjs = [];
    this.hintObjs = [];
    this.hintTweens = [];
    this.panel = null;
    this.panelPrimary = null;
    this.toastObj = null;
    this.infoText = null;
    this.drag = null;
    this.leaving = false;
    this.keyboardUsed = false;

    const r = data.restore;
    this.restoring = !!r;
    if (r) {
      this.puzzle = r.puzzle;
      this.board = r.board.slice();
      this.history = r.history.slice();
      this.moves = r.moves;
      this.bonus = r.bonus;
      this.usedBonus = r.usedBonus;
      this.phase = r.phase;
      this.stars = r.stars;
      this.paused = r.paused;
      this.rush = r.rush ? { ...r.rush } : null;
    } else {
      this.rush = this.mode === 'rush'
        ? { score: 0, index: 0, timeLeft: RUSH_START_MS, seed: Math.floor(Math.random() * 1e6) }
        : null;
      this.puzzle = this.rush ? buildRush(0, this.rush.seed) : buildLevel(this.level);
      this.resetPuzzleState();
      this.phase = 'play';
      this.stars = 0;
      this.paused = false;
    }
  }

  private resetPuzzleState() {
    this.board = this.puzzle.start.slice();
    this.history = [];
    this.moves = 0;
    this.bonus = 0;
    this.usedBonus = false;
  }

  create() {
    this.vp = viewport(this);
    this.drawBackground();
    this.buildBoardView(false);
    this.createHud();
    this.createButtons();
    this.selection = this.add.graphics().setDepth(6);
    this.setupInput();
    this.setupKeyboard();
    this.setupVisibility();
    this.refreshStates(false, []);
    this.updateHud();

    onViewportResize(this, () => this.scene.restart({ mode: this.mode, level: this.level, restore: this.snapshot() }));

    if (!this.restoring) this.cameras.main.fadeIn(160, 10, 15, 46);

    // Re-open whatever overlay was showing before a resize
    if (this.phase === 'won') this.showWinPanel(false);
    else if (this.phase === 'failed') this.showFailPanel();
    else if (this.phase === 'rushover') this.showRushOverPanel(false);
    else if (this.paused) this.showPausePanel();
    else this.startPlay();
  }

  private startPlay() {
    if (this.mode === 'level') {
      const world = worldOf(this.level);
      if (world.intro && !progress.seenIntro(world.id)) {
        this.showIntroPanel();
        return;
      }
    }
    this.phase = 'play';
    crazyGames.gameplayStart();
    this.showLevelTip();
  }

  update(_time: number, delta: number) {
    if (this.mode !== 'rush' || !this.rush || this.phase !== 'play' || this.paused) return;
    this.rush.timeLeft -= Math.min(delta, 100);
    if (this.rush.timeLeft <= 0) {
      this.rush.timeLeft = 0;
      this.updateRushTimer();
      this.onRushOver();
      return;
    }
    this.updateRushTimer();
  }

  private snapshot(): Snapshot {
    if (this.phase === 'transition' && this.rush) {
      this.advanceRushPuzzle();
      this.phase = 'play';
    }
    return {
      puzzle: this.puzzle,
      board: this.board,
      history: this.history,
      moves: this.moves,
      bonus: this.bonus,
      usedBonus: this.usedBonus,
      phase: this.phase === 'intro' ? 'play' : this.phase,
      stars: this.stars,
      paused: this.paused,
      rush: this.rush ?? undefined,
    };
  }

  // ─── Layout & board view ────────────────────────────────────────────────────
  private drawBackground() {
    const { W, H } = this.vp;
    const bg = this.add.graphics();
    bg.fillGradientStyle(COLORS.bgDeep, COLORS.bgDeep, COLORS.bgPanel, COLORS.bgPanel, 1);
    bg.fillRect(0, 0, W, H);
  }

  private computeBoardGeometry() {
    const { vp } = this;
    const n = this.puzzle.size;
    const spanV = vp.landscape ? 400 : 300;
    const cxV = vp.landscape ? 500 : 230;
    const cyV = vp.landscape ? 320 : 405;
    this.span = spanV * vp.u;
    this.gap = Math.round(this.span * 0.028);
    this.ts = (this.span - this.gap * (n - 1)) / n;
    this.step = this.ts + this.gap;
    this.bx0 = vp.x(cxV) - this.span / 2;
    this.by0 = vp.y(cyV) - this.span / 2;
    this.arrowSize = (vp.landscape ? 36 : 32) * vp.u;
    this.arrowOff = this.arrowSize / 2 + 12 * vp.u;
  }

  private posXY(pos: number): { x: number; y: number } {
    const n = this.puzzle.size;
    return {
      x: this.bx0 + (pos % n) * this.step + this.ts / 2,
      y: this.by0 + Math.floor(pos / n) * this.step + this.ts / 2,
    };
  }

  private lineCenter(type: 'row' | 'col', index: number): number {
    return (type === 'row' ? this.by0 : this.bx0) + index * this.step + this.ts / 2;
  }

  private buildBoardView(popIn: boolean) {
    for (const o of this.boardObjs) o.destroy();
    for (const t of this.tiles) { t.tw?.stop(); t.c.destroy(); }
    for (const a of this.arrows) a.c.destroy();
    this.boardObjs = [];
    this.tiles = [];
    this.arrows = [];
    this.clearHint();

    this.computeBoardGeometry();
    this.drawBoardCard();
    this.createTiles(popIn);
    this.createArrowsAndRules();
    this.drawTargetPreview();
  }

  private drawBoardCard() {
    const pad = 10 * this.vp.u;
    const g = this.add.graphics().setDepth(0);
    g.fillStyle(COLORS.bgCard, 1);
    g.fillRoundedRect(this.bx0 - pad, this.by0 - pad, this.span + pad * 2, this.span + pad * 2, 16 * this.vp.u);
    g.lineStyle(1.5 * this.vp.u, COLORS.panelBorder, 1);
    g.strokeRoundedRect(this.bx0 - pad, this.by0 - pad, this.span + pad * 2, this.span + pad * 2, 16 * this.vp.u);

    // Empty slots
    g.fillStyle(COLORS.slot, 1);
    for (let i = 0; i < this.puzzle.size ** 2; i++) {
      const p = this.posXY(i);
      g.fillRoundedRect(p.x - this.ts / 2, p.y - this.ts / 2, this.ts, this.ts, this.ts * 0.16);
    }

    // Rule lanes (tinted bands that show between tiles and at the board edges)
    const rules = this.puzzle.rules;
    const lane = (type: 'row' | 'col', i: number, color: number, alpha: number) => {
      const c = this.lineCenter(type, i);
      const thick = this.ts + this.gap * 1.2;
      g.fillStyle(color, alpha);
      if (type === 'row') g.fillRoundedRect(this.bx0 - pad * 0.7, c - thick / 2, this.span + pad * 1.4, thick, 10 * this.vp.u);
      else g.fillRoundedRect(c - thick / 2, this.by0 - pad * 0.7, thick, this.span + pad * 1.4, 10 * this.vp.u);
    };
    rules.lockedRows.forEach(i => lane('row', i, COLORS.lock, 0.28));
    rules.lockedCols.forEach(i => lane('col', i, COLORS.lock, 0.28));
    Object.keys(rules.oneWayRows).forEach(i => lane('row', +i, COLORS.conveyor, 0.3));
    Object.keys(rules.oneWayCols).forEach(i => lane('col', +i, COLORS.conveyor, 0.3));
    rules.links.forEach(l => { lane(l.type, l.a, COLORS.link, 0.3); lane(l.type, l.b, COLORS.link, 0.3); });
    this.boardObjs.push(g);
  }

  private tileColor(id: number): number {
    const p = this.puzzle;
    if (p.kind === 'pattern') return PATTERN_COLORS[p.keys[id]] ?? PATTERN_COLORS[0];
    return ROW_COLORS[Math.floor(p.target.indexOf(p.keys[id]) / p.size)] ?? ROW_COLORS[0];
  }

  private createTiles(popIn: boolean) {
    const p = this.puzzle;
    const n = p.size * p.size;
    this.tiles = new Array(n);
    for (let pos = 0; pos < n; pos++) {
      const id = this.board[pos];
      const { x, y } = this.posXY(pos);
      const bg = this.add.rectangle(0, 0, this.ts, this.ts, this.tileColor(id)).setRounded(this.ts * 0.16);
      const parts: Phaser.GameObjects.GameObject[] = [bg];
      if (p.kind === 'numbers') {
        parts.push(text(this, 0, 0, String(p.keys[id] + 1), this.ts * 0.42, COLORS.bgDeep, true));
      }
      const c = this.add.container(x, y, parts).setDepth(2);
      if (popIn) {
        c.setScale(0.6).setAlpha(0);
        this.tweens.add({ targets: c, scale: 1, alpha: 1, duration: 200, delay: pos * 12, ease: 'Back.Out' });
      }
      this.tiles[id] = { id, c, bg, tw: null, correct: false };
    }
  }

  private createArrowsAndRules() {
    const { rules, size } = this.puzzle;
    const u = this.vp.u;
    const g = this.add.graphics().setDepth(1);
    this.boardObjs.push(g);

    for (const type of ['row', 'col'] as const) {
      for (let i = 0; i < size; i++) {
        const c = this.lineCenter(type, i);
        const ends = type === 'row'
          ? [{ x: this.bx0 - this.arrowOff, y: c, dir: 'left' as const }, { x: this.bx0 + this.span + this.arrowOff, y: c, dir: 'right' as const }]
          : [{ x: c, y: this.by0 - this.arrowOff, dir: 'up' as const }, { x: c, y: this.by0 + this.span + this.arrowOff, dir: 'down' as const }];

        if (isLocked(rules, type, i)) {
          for (const e of ends) drawLock(g, e.x, e.y, this.arrowSize * 0.7, COLORS.lock);
          continue;
        }
        const ow = oneWayDir(rules, type, i);
        const linked = rules.links.some(l => l.type === type && (l.a === i || l.b === i));
        for (const e of ends) {
          if (ow && ow !== e.dir) {
            // Flow marker on the far end of a conveyor
            this.drawTriangle(g, e.x, e.y, this.arrowSize * 0.3, ow as ShiftDirection, COLORS.conveyor, 0.45);
            continue;
          }
          const tint = ow ? COLORS.conveyor : linked ? COLORS.link : COLORS.accent;
          this.makeArrow({ type, index: i, direction: e.dir }, e.x, e.y, tint);
        }
      }
    }

    // Link connectors drawn just outside the arrows
    for (const l of rules.links) {
      const a = this.lineCenter(l.type, l.a);
      const b = this.lineCenter(l.type, l.b);
      const off = this.arrowOff + this.arrowSize / 2 + 9 * u;
      g.lineStyle(3 * u, COLORS.link, 0.9);
      if (l.type === 'row') {
        const x = this.bx0 - off;
        g.lineBetween(x, a, x, b);
        g.fillStyle(COLORS.link, 1).fillCircle(x, a, 4 * u).fillCircle(x, b, 4 * u);
      } else {
        const y = this.by0 - off;
        g.lineBetween(a, y, b, y);
        g.fillStyle(COLORS.link, 1).fillCircle(a, y, 4 * u).fillCircle(b, y, 4 * u);
      }
    }
  }

  private drawTriangle(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number, dir: ShiftDirection, color: number, alpha: number) {
    const pts: Record<ShiftDirection, number[]> = {
      left: [x - r, y, x + r * 0.7, y - r, x + r * 0.7, y + r],
      right: [x + r, y, x - r * 0.7, y - r, x - r * 0.7, y + r],
      up: [x, y - r, x - r, y + r * 0.7, x + r, y + r * 0.7],
      down: [x, y + r, x - r, y - r * 0.7, x + r, y - r * 0.7],
    };
    const p = pts[dir];
    g.fillStyle(color, alpha);
    g.fillTriangle(p[0], p[1], p[2], p[3], p[4], p[5]);
  }

  private makeArrow(move: MoveRecord, x: number, y: number, tint: number) {
    const s = this.arrowSize;
    const bg = this.add.rectangle(0, 0, s, s, COLORS.arrowBg).setRounded(s * 0.28)
      .setStrokeStyle(1.5 * this.vp.u, tint, 0.55);
    const g = this.add.graphics();
    this.drawTriangle(g, 0, 0, s * 0.22, move.direction, tint, 1);
    const c = this.add.container(x, y, [bg, g]).setDepth(3);
    // Generous touch target: as wide as the line, never overlapping the neighbour's
    const across = Math.min(Math.max(s, 44 * this.vp.u), this.step * 0.98);
    if (move.type === 'row') c.setSize(s * 1.3, across);
    else c.setSize(across, s * 1.3);
    c.setInteractive({ useHandCursor: true });
    c.on('pointerover', () => bg.setFillStyle(COLORS.arrowHover));
    c.on('pointerout', () => bg.setFillStyle(COLORS.arrowBg));
    c.on('pointerdown', () => {
      sounds.resume();
      this.tweens.add({ targets: c, scale: 0.86, duration: 50, yoyo: true });
      this.tryMove(move);
    });
    this.arrows.push({ move, c });
  }

  private drawTargetPreview() {
    if (this.puzzle.kind !== 'pattern') return;
    const { vp } = this;
    const n = this.puzzle.size;
    const cell = (vp.landscape ? 18 : 11) * vp.u;
    const g2 = 2 * vp.u;
    const total = n * cell + (n - 1) * g2;
    const cx = vp.landscape ? vp.x(160) : vp.x(262);
    const cy = vp.landscape ? vp.y(440) : vp.y(182);
    const g = this.add.graphics().setDepth(1);
    for (let i = 0; i < n * n; i++) {
      g.fillStyle(PATTERN_COLORS[this.puzzle.target[i]], 1);
      g.fillRoundedRect(cx - total / 2 + (i % n) * (cell + g2), cy - total / 2 + Math.floor(i / n) * (cell + g2), cell, cell, cell * 0.2);
    }
    const label = vp.landscape
      ? text(this, cx, cy - total / 2 - 18 * vp.u, `Target: ${this.puzzle.patternName ?? ''}`, 14 * vp.u, COLORS.textMuted, true)
      : text(this, cx - total / 2 - 12 * vp.u, cy, 'Target', 13 * vp.u, COLORS.textMuted, true).setOrigin(1, 0.5);
    this.boardObjs.push(g, label);
  }

  // ─── HUD ────────────────────────────────────────────────────────────────────
  private createHud() {
    const { vp } = this;
    const u = vp.u;
    const L = vp.landscape;
    const world = worldOf(this.level);
    const title = this.mode === 'rush' ? 'Shift Rush' : `Level ${this.level}`;
    const sub = this.mode === 'rush' ? `Best: ${progress.rushBest()} boards` : `World ${world.id} · ${world.name}`;

    text(this, vp.x(L ? 160 : 230), vp.y(L ? 150 : 32), title, (L ? 30 : 22) * u, COLORS.text, true);
    text(this, vp.x(L ? 160 : 230), vp.y(L ? 184 : 56), sub, (L ? 14 : 12) * u, COLORS.textMuted);

    this.movesText = text(this, vp.x(L ? 160 : 120), vp.y(L ? 250 : 90), '', (L ? 20 : 17) * u, COLORS.text, true);
    this.starsText = text(this, vp.x(L ? 160 : 340), vp.y(L ? 288 : 90), '', (L ? 26 : 22) * u, COLORS.warning, true);
    this.subText = text(this, vp.x(L ? 160 : 340), vp.y(L ? 318 : 112), '', (L ? 13 : 11) * u, COLORS.textMuted);

    // Progress bar (tiles placed) / timer bar in Rush
    this.barW = (L ? 170 : 300) * u;
    const bx = vp.x(L ? 155 : 230);
    const by = vp.y(L ? 354 : 136);
    this.add.rectangle(bx, by, this.barW, 8 * u, COLORS.slot).setRounded(4 * u);
    this.barFill = this.add.rectangle(bx - this.barW / 2, by, this.barW, 8 * u,
      this.mode === 'rush' ? COLORS.warning : COLORS.accent).setOrigin(0, 0.5).setRounded(4 * u);
    this.barFrac = { v: 0 };
    this.drawBar();

    // Rule legend
    const legend = this.ruleLegend();
    legend.forEach((line, k) => {
      const y = L ? vp.y(520 + k * 26) : vp.y(626 + k * 22);
      const x = vp.x(L ? 160 : 230);
      const t = text(this, x + 8 * u, y, line.label, (L ? 13 : 12) * u, COLORS.textMuted);
      this.add.rectangle(x - t.width / 2 - 6 * u, y, 10 * u, 10 * u, line.color).setRounded(3 * u);
    });

    // Top bar: map + sound
    button(this, vp.x(L ? 70 : 46), vp.y(L ? 44 : 32), (L ? 96 : 72) * u, (L ? 40 : 34) * u, 'Map', () => this.goMap(), { fontPx: (L ? 16 : 14) * u });
    const sound = button(this, vp.x(L ? 935 : 418), vp.y(L ? 44 : 32), (L ? 96 : 64) * u, (L ? 40 : 34) * u,
      sounds.isMuted() ? 'Sound off' : 'Sound', () => {
        const muted = sounds.toggleMute();
        sound.label.setText(muted ? 'Sound off' : 'Sound');
      }, { fontPx: (L ? 14 : 11) * u, silent: true });
  }

  private ruleLegend(): { label: string; color: number }[] {
    const r = this.puzzle.rules;
    const out: { label: string; color: number }[] = [];
    if (r.lockedRows.length || r.lockedCols.length) out.push({ label: "Locked lines can't slide", color: COLORS.lock });
    if (Object.keys(r.oneWayRows).length || Object.keys(r.oneWayCols).length) out.push({ label: 'Gold lines slide one way only', color: COLORS.conveyor });
    if (r.links.length) out.push({ label: 'Pink lines move together', color: COLORS.link });
    return out;
  }

  private createButtons() {
    const { vp } = this;
    const u = vp.u;
    const L = vp.landscape;
    const w = (L ? 150 : 108) * u;
    const h = (L ? 50 : 46) * u;
    const fs = (L ? 18 : 16) * u;
    const pos = (k: number) => L ? { x: vp.x(845), y: vp.y(240 + k * 70) } : { x: vp.x(108 + k * 122), y: vp.y(700) };

    this.undoBtn = button(this, pos(0).x, pos(0).y, w, h, 'Undo', () => this.undoLast(), { fontPx: fs });
    if (this.mode === 'level') {
      button(this, pos(1).x, pos(1).y, w, h, 'Hint', () => this.showHint(true), { fontPx: fs });
    } else {
      button(this, pos(1).x, pos(1).y, w, h, 'Skip −5s', () => this.skipRushBoard(), { fontPx: fs * 0.9 });
    }
    button(this, pos(2).x, pos(2).y, w, h, 'Retry', () => this.retry(), { fontPx: fs });
  }

  private movesLeft(): number {
    return this.puzzle.limit > 0 ? this.puzzle.limit + this.bonus - this.moves : Infinity;
  }

  private currentStars(): number {
    const par = this.puzzle.par;
    if (this.moves <= par) return 3;
    if (this.moves <= par + 2) return 2;
    return 1;
  }

  private updateHud() {
    const p = this.puzzle;
    if (this.mode === 'rush' && this.rush) {
      this.movesText.setText(`Solved: ${this.rush.score}`);
      this.subText.setText(`Board ${this.rush.index + 1} · ${p.par} move${p.par > 1 ? 's' : ''}`);
      this.updateRushTimer();
    } else {
      if (p.limit > 0) {
        const left = this.movesLeft();
        this.movesText.setText(`Moves left: ${left}`);
        this.movesText.setColor(hex(left <= 2 ? COLORS.danger : COLORS.text));
      } else {
        this.movesText.setText(`Moves: ${this.moves}`);
      }
      const st = this.currentStars();
      this.starsText.setText(starString(st));
      this.subText.setText(`★★★ in ${p.par} move${p.par > 1 ? 's' : ''}`);
    }
    this.undoBtn.setAlpha(this.history.length ? 1 : 0.5);
  }

  private updateRushTimer() {
    if (!this.rush) return;
    const s = Math.ceil(this.rush.timeLeft / 1000);
    this.starsText.setText(`${s}s`);
    this.starsText.setColor(hex(s <= 10 ? COLORS.danger : COLORS.warning));
    this.barFrac.v = Phaser.Math.Clamp(this.rush.timeLeft / RUSH_MAX_MS, 0, 1);
    this.drawBar();
  }

  // Shapes must be resized with setSize (assigning .width does not redraw them)
  private drawBar() {
    const w = Math.max(0.001, this.barW * this.barFrac.v);
    this.barFill.setSize(w, this.barFill.height).setRounded(Math.min(this.barFill.height / 2, w / 2));
    this.barFill.setVisible(this.barFrac.v > 0.005);
  }

  private setProgress(animate: boolean) {
    if (this.mode === 'rush') return;
    const frac = correctCount(this.board, this.puzzle) / this.board.length;
    this.tweens.killTweensOf(this.barFrac);
    if (animate) {
      this.tweens.add({ targets: this.barFrac, v: frac, duration: 220, ease: 'Cubic.Out', onUpdate: () => this.drawBar() });
    } else {
      this.barFrac.v = frac;
      this.drawBar();
    }
  }

  // ─── Info line (tutorial / tips) ────────────────────────────────────────────
  private setInfo(msg: string, color: number = COLORS.text) {
    const { vp } = this;
    if (!this.infoText) {
      this.infoText = text(this, vp.x(vp.landscape ? 160 : 230), vp.y(vp.landscape ? 450 : 184), '', (vp.landscape ? 16 : 15) * vp.u, color, true)
        .setDepth(5).setWordWrapWidth((vp.landscape ? 250 : 400) * vp.u);
    }
    this.infoText.setText(msg).setColor(hex(color)).setAlpha(1);
  }

  private showLevelTip() {
    if (this.mode !== 'level' || this.puzzle.kind === 'pattern') return;
    if (this.level <= 2) {
      this.showHint(false);
      return;
    }
    const tips: Record<number, string> = {
      3: 'Two moves this time. Undo is free.',
      4: 'Moves are limited now. Fewer moves = more stars.',
      11: 'Tile colour shows which row it belongs to.',
    };
    if (tips[this.level]) this.setInfo(tips[this.level], COLORS.textMuted);
  }

  private moveDescription(m: MoveRecord): string {
    const n = this.puzzle.size;
    const names3 = { row: ['top row', 'middle row', 'bottom row'], col: ['left column', 'middle column', 'right column'] };
    const name = n === 3 ? names3[m.type][m.index] : `${m.type === 'row' ? 'row' : 'column'} ${m.index + 1}`;
    return `Swipe the ${name} ${m.direction}`;
  }

  // ─── Input ──────────────────────────────────────────────────────────────────
  private setupInput() {
    this.input.on('pointerdown', (p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      sounds.resume();
      if (this.paused && this.phase === 'play') { this.resumeFromPause(); return; }
      if (over.length || this.phase !== 'play' || this.drag) return;
      const m = this.gap * 1.5;
      const rx = p.x - this.bx0;
      const ry = p.y - this.by0;
      if (rx < -m || ry < -m || rx > this.span + m || ry > this.span + m) return;
      const n = this.puzzle.size;
      this.drag = {
        id: p.id, x0: p.x, y0: p.y, t0: p.downTime,
        row: Phaser.Math.Clamp(Math.floor(ry / this.step), 0, n - 1),
        col: Phaser.Math.Clamp(Math.floor(rx / this.step), 0, n - 1),
        axis: null, fired: 0, blocked: false,
      };
    });

    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      const d = this.drag;
      if (!d || p.id !== d.id || this.phase !== 'play') return;
      const dx = p.x - d.x0;
      const dy = p.y - d.y0;
      const th = Math.max(this.ts * 0.2, 9 * this.vp.u);
      if (!d.axis) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) < th) return;
        d.axis = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y';
      }
      const dist = d.axis === 'x' ? dx : dy;
      const a = Math.abs(dist);
      const n = this.puzzle.size;
      const target = a < th ? 0 : Math.sign(dist) * Math.min(n - 1, 1 + Math.floor((a - th) / (this.step * 0.85)));
      this.syncDrag(d, target);
    });

    const end = (p: Phaser.Input.Pointer) => {
      const d = this.drag;
      if (!d || p.id !== d.id) return;
      this.drag = null;
      if (d.axis || this.phase !== 'play') return;
      // Quick flick that never crossed the drag threshold
      const dx = p.x - d.x0;
      const dy = p.y - d.y0;
      const dt = Math.max(1, p.upTime - d.t0);
      const dist = Math.max(Math.abs(dx), Math.abs(dy));
      if (dist >= this.ts * 0.1 && dt < 220) {
        const horiz = Math.abs(dx) >= Math.abs(dy);
        this.tryMove(horiz
          ? { type: 'row', index: d.row, direction: dx > 0 ? 'right' : 'left' }
          : { type: 'col', index: d.col, direction: dy > 0 ? 'down' : 'up' });
      } else {
        // A tap selects that row and column for keyboard play
        this.selRow = d.row;
        this.selCol = d.col;
        this.drawSelection();
      }
    };
    this.input.on('pointerup', end);
    this.input.on('pointerupoutside', end);
    this.input.on('gameout', () => { this.drag = null; });
    this.game.events.on('blur', this.cancelDrag, this);
    this.events.once('shutdown', () => this.game.events.off('blur', this.cancelDrag, this));
  }

  private cancelDrag() {
    this.drag = null;
  }

  /** Makes the board follow a drag: one shift per tile dragged, dragging back undoes. */
  private syncDrag(d: DragState, target: number) {
    let guard = 0;
    while (d.fired !== target && !d.blocked && guard++ < 8) {
      const forward = d.fired === 0 || (Math.sign(d.fired) === Math.sign(target) && Math.abs(target) > Math.abs(d.fired));
      if (forward) {
        const sgn = Math.sign(target);
        const move: MoveRecord = d.axis === 'x'
          ? { type: 'row', index: d.row, direction: sgn > 0 ? 'right' : 'left' }
          : { type: 'col', index: d.col, direction: sgn > 0 ? 'down' : 'up' };
        if (!this.tryMove(move)) { d.blocked = true; return; }
        d.fired += sgn;
      } else {
        if (!this.undoLast()) return;
        d.fired -= Math.sign(d.fired);
      }
    }
  }

  private setupKeyboard() {
    const kb = this.input.keyboard;
    if (!kb) return;
    kb.addCapture('UP,DOWN,LEFT,RIGHT,SPACE');
    kb.on('keydown', (e: KeyboardEvent) => {
      sounds.resume();
      if (this.panel) {
        if ((e.code === 'Enter' || e.code === 'Space') && this.panelPrimary) this.panelPrimary();
        return;
      }
      if (this.paused) { this.resumeFromPause(); return; }
      if (this.phase !== 'play') return;
      const n = this.puzzle.size;
      const sel = () => { this.keyboardUsed = true; this.drawSelection(); };
      switch (e.code) {
        case 'ArrowLeft': sel(); this.tryMove({ type: 'row', index: this.selRow, direction: 'left' }); break;
        case 'ArrowRight': sel(); this.tryMove({ type: 'row', index: this.selRow, direction: 'right' }); break;
        case 'ArrowUp': sel(); this.tryMove({ type: 'col', index: this.selCol, direction: 'up' }); break;
        case 'ArrowDown': sel(); this.tryMove({ type: 'col', index: this.selCol, direction: 'down' }); break;
        case 'KeyW': this.selRow = (this.selRow + n - 1) % n; sel(); break;
        case 'KeyS': this.selRow = (this.selRow + 1) % n; sel(); break;
        case 'KeyA': this.selCol = (this.selCol + n - 1) % n; sel(); break;
        case 'KeyD': this.selCol = (this.selCol + 1) % n; sel(); break;
        case 'KeyZ': case 'Backspace': this.undoLast(); break;
        case 'KeyR': this.retry(); break;
        case 'KeyH': if (this.mode === 'level') this.showHint(true); break;
      }
    });
  }

  private drawSelection() {
    const g = this.selection;
    g.clear();
    if (!this.keyboardUsed) return;
    const u = this.vp.u;
    const pad = 4 * u;
    const ry = this.lineCenter('row', this.selRow);
    const cx = this.lineCenter('col', this.selCol);
    g.lineStyle(2.5 * u, COLORS.accentHover, 0.9);
    g.strokeRoundedRect(this.bx0 - pad, ry - this.ts / 2 - pad, this.span + pad * 2, this.ts + pad * 2, 10 * u);
    g.lineStyle(2.5 * u, COLORS.warning, 0.8);
    g.strokeRoundedRect(cx - this.ts / 2 - pad, this.by0 - pad, this.ts + pad * 2, this.span + pad * 2, 10 * u);
  }

  // ─── Moves ──────────────────────────────────────────────────────────────────
  private tryMove(move: MoveRecord): boolean {
    if (this.phase !== 'play' || this.paused || this.panel) return false;
    if (!canMove(move, this.puzzle.rules)) {
      this.blockedFeedback(move);
      return false;
    }
    if (this.movesLeft() <= 0) return false;

    const old = this.board;
    this.board = applyMove(old, this.puzzle.size, move, this.puzzle.rules);
    this.history.push(move);
    this.moves++;
    this.animateMove(move, old, this.board);
    sounds.playSlide();
    triggerHaptic(8);
    this.clearHint();
    if (this.infoText && this.level > 2) this.tweens.add({ targets: this.infoText, alpha: 0, duration: 250 });
    this.afterBoardChange(old, false);
    return true;
  }

  private undoLast(): boolean {
    if (this.phase !== 'play' || this.paused || this.panel || !this.history.length) return false;
    const rev = reverseMove(this.history.pop()!);
    const old = this.board;
    this.board = applyMove(old, this.puzzle.size, rev, this.puzzle.rules);
    this.moves = Math.max(0, this.moves - 1);
    this.animateMove(rev, old, this.board);
    sounds.playSlide();
    this.clearHint();
    this.afterBoardChange(old, true);
    return true;
  }

  private afterBoardChange(old: number[], isUndo: boolean) {
    this.updateHud();
    const p = this.puzzle;
    const newly: number[] = [];
    if (!isUndo) {
      for (let i = 0; i < this.board.length; i++) {
        if (isCorrectAt(this.board, p, i) && !isCorrectAt(old, p, i)) newly.push(this.board[i]);
      }
    }
    // Feedback lands as the tiles arrive
    this.time.delayedCall(SHIFT_ANIM_MS * 0.8, () => this.refreshStates(true, newly));

    if (isSolved(this.board, p)) {
      this.phase = this.mode === 'rush' ? 'transition' : 'won';
      this.drag = null;
      this.time.delayedCall(SHIFT_ANIM_MS + 40, () => (this.mode === 'rush' ? this.onRushSolved() : this.onSolved()));
    } else if (this.movesLeft() <= 0) {
      this.phase = 'failed';
      this.drag = null;
      this.time.delayedCall(SHIFT_ANIM_MS + 260, () => this.onFail());
    } else if (this.mode === 'level' && this.level <= 2) {
      this.showHint(false);
    }
  }

  private animateMove(move: MoveRecord, old: number[], next: number[]) {
    const n = this.puzzle.size;
    const where = new Array<number>(next.length);
    for (let i = 0; i < next.length; i++) where[next[i]] = i;

    for (const line of linesFor(move, this.puzzle.rules)) {
      const idx = lineIndices(n, line.type, line.index);
      const forward = line.direction === 'right' || line.direction === 'down';
      const wrapPos = forward ? idx[n - 1] : idx[0];
      const sgn = forward ? 1 : -1;
      const vx = line.type === 'row' ? sgn * this.step : 0;
      const vy = line.type === 'col' ? sgn * this.step : 0;
      for (const pos of idx) {
        const t = this.tiles[old[pos]];
        const to = this.posXY(where[t.id]);
        if (pos === wrapPos) this.tweenWrap(t, to.x, to.y, vx, vy);
        else this.tweenSlide(t, to.x, to.y);
      }
    }
  }

  // Tweens always start from where the tile is right now, so input never waits
  // for a previous animation to finish.
  private tweenSlide(t: TileView, x: number, y: number) {
    t.tw?.stop();
    t.tw = this.tweens.add({
      targets: t.c, x, y, alpha: 1, duration: SHIFT_ANIM_MS, ease: 'Cubic.Out',
      onComplete: () => { t.tw = null; },
    });
  }

  private tweenWrap(t: TileView, x: number, y: number, vx: number, vy: number) {
    t.tw?.stop();
    const sx = t.c.x;
    const sy = t.c.y;
    const sa = t.c.alpha;
    const o = { p: 0 };
    t.tw = this.tweens.add({
      targets: o, p: 1, duration: SHIFT_ANIM_MS, ease: 'Linear',
      onUpdate: () => {
        if (o.p < 0.5) {
          const k = o.p * 2;
          t.c.setPosition(sx + vx * k, sy + vy * k).setAlpha(sa * (1 - k));
        } else {
          const k = Phaser.Math.Easing.Cubic.Out((o.p - 0.5) * 2);
          t.c.setPosition(x - vx * (1 - k), y - vy * (1 - k)).setAlpha(k);
        }
      },
      onComplete: () => { t.c.setPosition(x, y).setAlpha(1); t.tw = null; },
    });
  }

  /** Applies "in place" styling; pulses tiles that just locked in. */
  private refreshStates(animate: boolean, newly: number[]) {
    const p = this.puzzle;
    const u = this.vp.u;
    let fresh = 0;
    for (let pos = 0; pos < this.board.length; pos++) {
      const t = this.tiles[this.board[pos]];
      if (!t) continue;
      const ok = isCorrectAt(this.board, p, pos);
      if (ok !== t.correct || !animate) {
        t.correct = ok;
        if (ok) t.bg.setFillStyle(this.tileColor(t.id), 1).setStrokeStyle(3 * u, COLORS.white, 0.95);
        else t.bg.setFillStyle(this.tileColor(t.id), 0.74).setStrokeStyle();
      }
      if (animate && ok && newly.includes(t.id)) {
        fresh++;
        this.tweens.add({ targets: t.c, scale: 1.1, duration: 90, yoyo: true, ease: 'Sine.Out' });
      }
    }
    this.setProgress(animate);
    if (!animate || fresh === 0 || this.phase !== 'play') return;
    if (fresh >= 2) {
      const words = ['', '', 'Double!', 'Triple!', 'Super!'];
      this.floatText(words[Math.min(fresh, 4)] || 'Amazing!', COLORS.warning);
      sounds.playCombo(fresh);
      triggerHaptic([10, 30, 10]);
    } else {
      sounds.playTileSolved();
    }
  }

  private blockedFeedback(move: MoveRecord) {
    sounds.playBlocked();
    triggerHaptic(20);
    const idx = lineIndices(this.puzzle.size, move.type, move.index);
    const off = 5 * this.vp.u * (move.direction === 'left' || move.direction === 'up' ? -1 : 1);
    for (const pos of idx) {
      const t = this.tiles[this.board[pos]];
      if (t.tw) continue;
      const home = this.posXY(pos);
      this.tweens.add({
        targets: t.c,
        x: move.type === 'row' ? home.x + off : home.x,
        y: move.type === 'col' ? home.y + off : home.y,
        duration: 50, yoyo: true, repeat: 1,
        onComplete: () => t.c.setPosition(home.x, home.y),
      });
    }
    if (isLocked(this.puzzle.rules, move.type, move.index)) this.toast('That line is locked');
    else this.toast('This line only slides one way');
  }

  // ─── Hints ──────────────────────────────────────────────────────────────────
  private clearHint() {
    for (const tw of this.hintTweens) tw.stop();
    for (const o of this.hintObjs) o.destroy();
    this.hintTweens = [];
    this.hintObjs = [];
  }

  private showHint(fromButton: boolean) {
    if (this.phase !== 'play' || this.panel) return;
    this.clearHint();
    const p = this.puzzle;
    const path = solve(keysOf(this.board, p), p.target, p.size, p.rules, p.size === 3 ? 10 : 8);
    if (!path || !path.length) {
      if (fromButton) this.toast('Too tangled for a hint. Try Retry.');
      return;
    }
    const m = path[0];
    const u = this.vp.u;
    const c = this.lineCenter(m.type, m.index);
    const thick = this.ts + 8 * u;

    const lane = this.add.graphics().setDepth(4);
    lane.lineStyle(3 * u, COLORS.accentHover, 1);
    lane.fillStyle(COLORS.accentHover, 0.12);
    if (m.type === 'row') {
      lane.fillRoundedRect(this.bx0 - 6 * u, c - thick / 2, this.span + 12 * u, thick, 12 * u);
      lane.strokeRoundedRect(this.bx0 - 6 * u, c - thick / 2, this.span + 12 * u, thick, 12 * u);
    } else {
      lane.fillRoundedRect(c - thick / 2, this.by0 - 6 * u, thick, this.span + 12 * u, 12 * u);
      lane.strokeRoundedRect(c - thick / 2, this.by0 - 6 * u, thick, this.span + 12 * u, 12 * u);
    }
    this.hintObjs.push(lane);
    this.hintTweens.push(this.tweens.add({ targets: lane, alpha: 0.35, duration: 600, yoyo: true, repeat: -1 }));

    // Finger dot sliding the way to swipe
    const fwd = m.direction === 'right' || m.direction === 'down' ? 1 : -1;
    const along = this.span * 0.32 * fwd;
    const midA = m.type === 'row' ? this.bx0 + this.span / 2 : this.by0 + this.span / 2;
    const dot = this.add.circle(0, 0, 13 * u, COLORS.white, 0.9).setStrokeStyle(4 * u, COLORS.accent).setDepth(7);
    const set = (k: number) => {
      const a = midA - along + along * 2 * k;
      if (m.type === 'row') dot.setPosition(a, c); else dot.setPosition(c, a);
    };
    set(0);
    const o = { k: 0 };
    this.hintObjs.push(dot);
    this.hintTweens.push(this.tweens.add({
      targets: o, k: 1, duration: 900, repeat: -1, repeatDelay: 250, ease: 'Cubic.InOut',
      onUpdate: () => { set(o.k); dot.setAlpha(o.k < 0.85 ? 0.9 : (1 - o.k) * 6); },
      onRepeat: () => dot.setAlpha(0.9),
    }));

    const arrow = this.arrows.find(a => a.move.type === m.type && a.move.index === m.index && a.move.direction === m.direction);
    if (arrow) this.hintTweens.push(this.tweens.add({ targets: arrow.c, scale: 1.18, duration: 380, yoyo: true, repeat: -1 }));

    if (this.mode === 'level' && this.level <= 2) this.setInfo(this.moveDescription(m), COLORS.accentHover);
  }

  // ─── Retry / skip ───────────────────────────────────────────────────────────
  private retry() {
    if (this.paused || this.leaving) return;
    if (this.phase !== 'play' && this.phase !== 'failed') return;
    this.closePanel();
    this.resetPuzzleState();
    this.phase = 'play';
    this.drag = null;
    this.clearHint();
    for (let pos = 0; pos < this.board.length; pos++) {
      const t = this.tiles[this.board[pos]];
      const to = this.posXY(pos);
      t.tw?.stop();
      t.tw = this.tweens.add({ targets: t.c, x: to.x, y: to.y, alpha: 1, scale: 1, duration: 200, ease: 'Cubic.Out', onComplete: () => { t.tw = null; } });
    }
    this.time.delayedCall(150, () => this.refreshStates(false, []));
    this.updateHud();
    crazyGames.gameplayStart();
    if (this.mode === 'level' && this.level <= 2) this.time.delayedCall(220, () => this.showHint(false));
  }

  private skipRushBoard() {
    if (!this.rush || this.phase !== 'play' || this.paused) return;
    this.rush.timeLeft = Math.max(1, this.rush.timeLeft - 5000);
    this.floatText('−5s', COLORS.danger);
    this.phase = 'transition';
    this.time.delayedCall(120, () => this.nextRushBoard());
  }

  // ─── Level results ──────────────────────────────────────────────────────────
  private onSolved() {
    this.stars = this.currentStars();
    progress.recordClear(this.level, this.stars);
    crazyGames.gameplayStop();
    // happytime is for real achievements only (SDK rule: not for level completion)
    const world = worldOf(this.level);
    if (world.last !== null && this.level === world.last) crazyGames.happytime();
    sounds.playVictory();
    triggerHaptic([30, 50, 30]);
    this.celebrateTiles();
    this.time.delayedCall(420, () => this.showWinPanel(true));
  }

  private celebrateTiles() {
    const n = this.puzzle.size;
    for (let pos = 0; pos < this.board.length; pos++) {
      const t = this.tiles[this.board[pos]];
      this.tweens.add({
        targets: t.c, scale: 1.12, duration: 140, yoyo: true, ease: 'Sine.Out',
        delay: ((pos % n) + Math.floor(pos / n)) * 45,
      });
    }
    this.confetti(26);
  }

  private onFail() {
    crazyGames.gameplayStop();
    sounds.playTimeUp();
    triggerHaptic([20, 40, 20]);
    this.showFailPanel();
  }

  private goNextLevel() {
    if (this.leaving) return;
    const world = worldOf(this.level);
    const finishedWorld = world.last !== null && this.level === world.last;
    this.leaving = true;
    crazyGames.maybeMidgameAd(this.level, () => {
      this.cameras.main.fadeOut(140, 10, 15, 46);
      this.cameras.main.once('camerafadeoutcomplete', () => {
        if (finishedWorld) this.scene.start(SCENE.MAP, { unlockedWorld: world.id + 1 });
        else this.scene.restart({ mode: 'level', level: this.level + 1 });
      });
    });
  }

  private goMap() {
    if (this.leaving) return;
    this.leaving = true;
    crazyGames.gameplayStop();
    this.cameras.main.fadeOut(120, 10, 15, 46);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start(SCENE.MAP));
  }

  // ─── Shift Rush ─────────────────────────────────────────────────────────────
  private onRushSolved() {
    const r = this.rush!;
    r.score++;
    const perfect = this.moves <= this.puzzle.par;
    const gain = RUSH_BONUS_MS + (perfect ? RUSH_PERFECT_BONUS_MS : 0);
    r.timeLeft = Math.min(RUSH_MAX_MS, r.timeLeft + gain);
    sounds.playBonus();
    triggerHaptic(20);
    this.floatText(`+${gain / 1000}s${perfect ? '  Perfect!' : ''}`, COLORS.warning);
    for (const t of this.tiles) this.tweens.add({ targets: t.c, scale: 1.08, duration: 110, yoyo: true });
    this.updateHud();
    this.time.delayedCall(340, () => this.nextRushBoard());
  }

  private advanceRushPuzzle() {
    const r = this.rush!;
    r.index++;
    this.puzzle = buildRush(r.index, r.seed);
    this.resetPuzzleState();
  }

  private nextRushBoard() {
    if (!this.rush || this.phase === 'rushover') return;
    this.advanceRushPuzzle();
    this.buildBoardView(true);
    this.drawSelection();
    this.refreshStates(false, []);
    this.updateHud();
    this.phase = 'play';
  }

  private onRushOver() {
    this.phase = 'rushover';
    this.drag = null;
    crazyGames.gameplayStop();
    sounds.playTimeUp();
    this.showRushOverPanel(true);
  }

  // ─── Panels ─────────────────────────────────────────────────────────────────
  private openPanel(h: number, dismissOnBackdrop = false): { c: Phaser.GameObjects.Container; w: number; h: number; cx: number; cy: number } {
    this.closePanel();
    const { vp } = this;
    const u = vp.u;
    const w = Math.min(380 * u, vp.W * 0.92);
    const ph = h * u;
    const cx = vp.W / 2;
    const cy = vp.landscape ? vp.y(320) : vp.y(405);

    const shade = this.add.rectangle(0, 0, vp.W, vp.H, COLORS.black, 0.55).setOrigin(0).setInteractive();
    // Only a fresh tap dismisses: the release of the drag that solved the board must not
    const openedAt = performance.now();
    if (dismissOnBackdrop) {
      shade.on('pointerup', (p: Phaser.Input.Pointer) => { if (p.downTime > openedAt) this.panelPrimary?.(); });
    }
    const box = this.add.rectangle(cx, cy, w, ph, COLORS.panelBg, 0.97).setRounded(20 * u)
      .setStrokeStyle(2 * u, COLORS.accent, 0.9).setInteractive();
    const c = this.add.container(0, 0, [shade, box]).setDepth(50);
    c.setAlpha(0);
    this.tweens.add({ targets: c, alpha: 1, duration: 160 });
    box.setScale(0.9);
    this.tweens.add({ targets: box, scale: 1, duration: 220, ease: 'Back.Out' });
    this.panel = c;
    return { c, w, h: ph, cx, cy };
  }

  private closePanel() {
    this.panel?.destroy();
    this.panel = null;
    this.panelPrimary = null;
  }

  private showWinPanel(fresh: boolean) {
    const u = this.vp.u;
    const world = worldOf(this.level);
    const finishedWorld = world.last !== null && this.level === world.last;
    const { c, cx, cy } = this.openPanel(280, this.stars === 3 && !finishedWorld);
    const titles = ['Solved!', 'Solved!', 'Great!', 'Perfect!'];
    c.add(text(this, cx, cy - 102 * u, finishedWorld ? 'World complete!' : titles[this.stars], 30 * u, COLORS.accent, true));

    for (let i = 0; i < 3; i++) {
      const s = text(this, cx + (i - 1) * 54 * u, cy - 44 * u, i < this.stars ? '★' : '☆', 50 * u, i < this.stars ? COLORS.warning : COLORS.panelBorder, true);
      c.add(s);
      if (fresh) {
        s.setScale(0);
        this.tweens.add({
          targets: s, scale: 1, duration: 260, delay: 120 + i * 140, ease: 'Back.Out',
          onStart: () => { if (i < this.stars) sounds.playStar(i); },
        });
      }
    }
    const par = this.puzzle.par;
    c.add(text(this, cx, cy + 8 * u, `${this.moves} move${this.moves === 1 ? '' : 's'} · best possible ${par}`, 15 * u, COLORS.textMuted));

    const next = () => this.goNextLevel();
    this.panelPrimary = next;
    const nextLabel = finishedWorld ? `On to World ${world.id + 1}` : 'Next level';
    if (this.stars === 3 || finishedWorld) {
      c.add(button(this, cx, cy + 74 * u, 230 * u, 52 * u, nextLabel, next, { primary: true, fontPx: 19 * u }));
      if (!finishedWorld && fresh) {
        const auto = text(this, cx, cy + 116 * u, 'Tap anywhere to continue', 12 * u, COLORS.textMuted);
        c.add(auto);
        this.time.delayedCall(1600, () => { if (this.panel === c) next(); });
      }
    } else {
      c.add(button(this, cx - 92 * u, cy + 74 * u, 168 * u, 52 * u, 'Retry for ★★★', () => this.retryFromWin(), { fontPx: 15 * u }));
      c.add(button(this, cx + 92 * u, cy + 74 * u, 168 * u, 52 * u, nextLabel, next, { primary: true, fontPx: 17 * u }));
    }
  }

  private retryFromWin() {
    this.phase = 'play';
    this.retry();
  }

  private showFailPanel() {
    const u = this.vp.u;
    const { c, cx, cy } = this.openPanel(260);
    const left = this.board.length - correctCount(this.board, this.puzzle);
    c.add(text(this, cx, cy - 88 * u, 'Out of moves', 28 * u, COLORS.warning, true));
    const msg = left <= 3 ? `So close! Only ${left} tile${left === 1 ? '' : 's'} left.` : `${left} tiles still out of place.`;
    c.add(text(this, cx, cy - 40 * u, msg, 17 * u, COLORS.text, true));
    c.add(text(this, cx, cy - 10 * u, `This one can be solved in ${this.puzzle.par}.`, 14 * u, COLORS.textMuted));

    const retry = () => this.retry();
    this.panelPrimary = retry;
    if (!this.usedBonus) {
      c.add(button(this, cx - 92 * u, cy + 58 * u, 168 * u, 52 * u, '+3 moves', () => this.addBonusMoves(), { fontPx: 17 * u }));
      c.add(button(this, cx + 92 * u, cy + 58 * u, 168 * u, 52 * u, 'Retry', retry, { primary: true, fontPx: 18 * u }));
    } else {
      c.add(button(this, cx, cy + 58 * u, 230 * u, 52 * u, 'Retry', retry, { primary: true, fontPx: 18 * u }));
    }
  }

  private addBonusMoves() {
    this.usedBonus = true;
    this.bonus += 3;
    this.closePanel();
    this.phase = 'play';
    this.updateHud();
    crazyGames.gameplayStart();
  }

  private showRushOverPanel(fresh: boolean) {
    const u = this.vp.u;
    const r = this.rush!;
    const best = progress.rushBest();
    const isBest = fresh ? progress.recordRush(r.score) : r.score >= best && r.score > 0;
    if (fresh && isBest) crazyGames.happytime();
    const { c, cx, cy } = this.openPanel(280);
    c.add(text(this, cx, cy - 100 * u, "Time's up!", 30 * u, COLORS.warning, true));
    c.add(text(this, cx, cy - 46 * u, `${r.score}`, 54 * u, COLORS.text, true));
    c.add(text(this, cx, cy - 6 * u, `board${r.score === 1 ? '' : 's'} solved`, 15 * u, COLORS.textMuted));
    c.add(text(this, cx, cy + 22 * u, isBest ? 'New best!' : `Best: ${Math.max(best, r.score)}`, 16 * u, isBest ? COLORS.accent : COLORS.textMuted, true));
    const again = () => {
      if (this.leaving) return;
      this.leaving = true;
      crazyGames.maybeMidgameAd(progress.maxLevel(), () => this.scene.restart({ mode: 'rush' }));
    };
    this.panelPrimary = again;
    c.add(button(this, cx - 92 * u, cy + 80 * u, 168 * u, 52 * u, 'Map', () => this.goMap(), { fontPx: 17 * u }));
    c.add(button(this, cx + 92 * u, cy + 80 * u, 168 * u, 52 * u, 'Play again', again, { primary: true, fontPx: 17 * u }));
  }

  private showIntroPanel() {
    const world = worldOf(this.level);
    if (!world.intro) return;
    this.phase = 'intro';
    const u = this.vp.u;
    const { c, cx, cy } = this.openPanel(250);
    c.add(text(this, cx, cy - 80 * u, `World ${world.id} · ${world.name}`, 14 * u, COLORS.textMuted, true));
    c.add(text(this, cx, cy - 50 * u, world.intro.title, 26 * u, COLORS.accent, true));
    c.add(text(this, cx, cy + 4 * u, world.intro.body, 15 * u, COLORS.text).setLineSpacing(6 * u));
    const go = () => {
      progress.markIntro(world.id);
      this.closePanel();
      this.startPlay();
    };
    this.panelPrimary = go;
    c.add(button(this, cx, cy + 82 * u, 200 * u, 50 * u, 'Got it', go, { primary: true, fontPx: 18 * u }));
  }

  private showPausePanel() {
    const u = this.vp.u;
    const { c, cx, cy } = this.openPanel(170, true);
    c.add(text(this, cx, cy - 34 * u, 'Paused', 28 * u, COLORS.accent, true));
    c.add(text(this, cx, cy + 16 * u, 'Tap anywhere to continue', 15 * u, COLORS.textMuted));
    this.panelPrimary = () => this.resumeFromPause();
  }

  private resumeFromPause() {
    if (!this.paused) return;
    this.paused = false;
    this.closePanel();
  }

  private setupVisibility() {
    const onVis = () => {
      if (document.hidden) {
        sounds.stopBGM();
        this.drag = null;
        // Rush clock pauses, but no gameplayStop: the SDK handles focus changes itself
        if (this.mode === 'rush' && this.phase === 'play' && !this.paused) {
          this.paused = true;
          this.showPausePanel();
        }
      } else if (!sounds.isMuted()) {
        sounds.startBGM();
      }
    };
    document.addEventListener('visibilitychange', onVis);
    this.events.once('shutdown', () => document.removeEventListener('visibilitychange', onVis));
  }

  // ─── Effects ────────────────────────────────────────────────────────────────
  private toast(msg: string) {
    this.toastObj?.destroy();
    const u = this.vp.u;
    const x = this.bx0 + this.span / 2;
    const y = this.by0 - this.arrowOff - this.arrowSize * 0.9;
    const t = text(this, 0, 0, msg, 14 * u, COLORS.text, true);
    const bg = this.add.rectangle(0, 0, t.width + 28 * u, 32 * u, COLORS.panelBg, 0.95).setRounded(16 * u)
      .setStrokeStyle(1.5 * u, COLORS.panelBorder);
    const c = this.add.container(x, y, [bg, t]).setDepth(40).setAlpha(0);
    this.toastObj = c;
    this.tweens.add({ targets: c, alpha: 1, duration: 120 });
    this.tweens.add({ targets: c, alpha: 0, duration: 250, delay: 1500, onComplete: () => c.destroy() });
  }

  private floatText(msg: string, color: number) {
    const u = this.vp.u;
    const t = text(this, this.bx0 + this.span / 2, this.by0 + this.span / 2, msg, 34 * u, color, true)
      .setDepth(45).setStroke(hex(COLORS.bgDeep), 6 * u).setScale(0.5);
    this.tweens.add({ targets: t, scale: 1, duration: 180, ease: 'Back.Out' });
    this.tweens.add({ targets: t, y: t.y - 50 * u, alpha: 0, duration: 450, delay: 380, onComplete: () => t.destroy() });
  }

  private confetti(count: number) {
    const { W, H, u } = this.vp;
    const colors = [...ROW_COLORS, COLORS.white];
    for (let i = 0; i < count; i++) {
      const x = W / 2 + Phaser.Math.Between(-80, 80) * u;
      const y = this.by0 + this.span / 2;
      const piece = this.add.rectangle(x, y, Phaser.Math.Between(6, 11) * u, Phaser.Math.Between(4, 8) * u,
        colors[i % colors.length]).setDepth(48);
      const tx = x + Phaser.Math.Between(-200, 200) * u;
      const ty = y - Phaser.Math.Between(120, 300) * u;
      this.tweens.add({
        targets: piece, x: tx, y: ty, angle: Phaser.Math.Between(-180, 180), duration: Phaser.Math.Between(380, 560), ease: 'Cubic.Out',
        onComplete: () => this.tweens.add({
          targets: piece, y: H + 20 * u, alpha: 0.2, angle: Phaser.Math.Between(-360, 360),
          duration: Phaser.Math.Between(900, 1400), ease: 'Sine.In', onComplete: () => piece.destroy(),
        }),
      });
    }
  }
}
