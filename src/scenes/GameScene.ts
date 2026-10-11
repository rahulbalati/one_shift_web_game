import Phaser from 'phaser';
import {
  GRID_SIZE, TILE_SIZE, TILE_GAP, GRID_TOTAL, GRID_Y,
  ARROW_SIZE, ARROW_MARGIN,
  COLORS, SCENE,
  SHIFT_ANIM_DURATION,
} from '../config.ts';
import { cloneBoard, applyMove, isSolved, solvedBoard } from '../game/Board.ts';
import { scramble, getLevelTimeLimit, getParMoves } from '../game/Scrambler.ts';
import type { Board, MoveRecord, ShiftDirection, VictoryData } from '../types.ts';
import { reverseMove } from '../types.ts';
import { sounds, triggerHaptic } from '../audio/SoundManager.ts';
import { crazyGames } from '../sdk/CrazyGamesSDK.ts';

// ─── Types ────────────────────────────────────────────────────────────────────
interface TileSprite {
  container: Phaser.GameObjects.Container;
  bg: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
  value: number;
}

interface ArrowBtn {
  container: Phaser.GameObjects.Container;
  bg: Phaser.GameObjects.Rectangle;
  icon: Phaser.GameObjects.Text;
  type: 'row' | 'col';
  index: number;
  direction: ShiftDirection;
}

// ─── Session best scores (in-memory) ─────────────────────────────────────────
const bestMoves: Record<number, number> = {};

// ─── GameScene ────────────────────────────────────────────────────────────────
export class GameScene extends Phaser.Scene {
  // State
  private board!: Board;
  private scrambledBoard!: Board;
  private moveHistory: MoveRecord[] = [];
  private moveCount = 0;
  private level = 1;
  private startTime = 0;
  private paused = false;
  private pausedAt = 0;
  private totalPauseMs = 0;
  private animating = false;

  // Graphics objects
  private tileSprites: TileSprite[] = [];
  private arrowBtns: ArrowBtn[] = [];
  private timerText!: Phaser.GameObjects.Text;
  private movesText!: Phaser.GameObjects.Text;
  private bestText!: Phaser.GameObjects.Text;
  private parStarsText!: Phaser.GameObjects.Text;
  private undoBtn!: Phaser.GameObjects.Container;
  private restartBtn!: Phaser.GameObjects.Container;
  private newGameBtn!: Phaser.GameObjects.Container;
  private pauseBtn!: Phaser.GameObjects.Container;
  private howToBtn!: Phaser.GameObjects.Container;
  private pauseOverlay!: Phaser.GameObjects.Container;
  private howToOverlay!: Phaser.GameObjects.Container;
  private timeUpOverlay!: Phaser.GameObjects.Container;
  private timerEvent!: Phaser.Time.TimerEvent;
  private timeLimit = 45;
  private lastTickSecond = -1;

  // Keyboard
  private selectedRow = 0;
  private selectedCol = 0;
  private keyboardMode = false;
  private selectionIndicator!: Phaser.GameObjects.Graphics;

  // Scale tracking
  private scaleFactor = 1;

  // Tutorial
  private tutorialContainer: Phaser.GameObjects.Container | null = null;

  // Swipe / Drag controls
  private swipeStartX = 0;
  private swipeStartY = 0;
  private swipeRow = -1;
  private swipeCol = -1;
  private isSwiping = false;
  private activePointerId: number | null = null;

  constructor() {
    super({ key: SCENE.GAME });
  }

  // ─── Lifecycle ──────────────────────────────────────────────────────────────
  init(data: {
    level?: number;
    board?: Board;
    scrambledBoard?: Board;
    moveHistory?: MoveRecord[];
    moveCount?: number;
    startTime?: number;
    totalPauseMs?: number;
    timeLimit?: number;
  } = {}) {
    this.level = data.level ?? 1;
    this.moveCount = data.moveCount ?? 0;
    this.moveHistory = data.moveHistory ? [...data.moveHistory] : [];
    this.startTime = data.startTime ?? 0;
    this.totalPauseMs = data.totalPauseMs ?? 0;
    this.timeLimit = data.timeLimit ?? getLevelTimeLimit(this.level);
    this.lastTickSecond = -1;
    this.paused = false;
    this.animating = false;
    this.keyboardMode = false;
    this.selectedRow = 0;
    this.selectedCol = 0;
    this.board = data.board ? cloneBoard(data.board) : (undefined as unknown as Board);
    this.scrambledBoard = data.scrambledBoard ? cloneBoard(data.scrambledBoard) : (undefined as unknown as Board);
  }

  create() {
    this.computeScale();
    this.drawBackground();
    this.generatePuzzle();
    this.createGrid();
    this.createArrows();
    this.createHUD();
    this.createControlButtons();
    this.createPauseOverlay();
    this.createHowToOverlay();
    this.createTimeUpOverlay();
    this.createSelectionIndicator();
    this.setupKeyboard();
    this.setupSwipeControls();
    this.setupVisibilityHandling();
    this.createTutorialHint();
    this.startTimer();
    crazyGames.gameplayStart();

    // Handle responsive resize without losing board state
    this.scale.on('resize', this.onResize, this);
    this.events.once('shutdown', () => {
      this.scale.off('resize', this.onResize, this);
      this.timerEvent?.remove();
    });
  }

  private computeScale() {
    this.scaleFactor = 1;
  }

  private generatePuzzle() {
    if (this.board && this.scrambledBoard) {
      return; // Board preserved across resize / orientation change
    }
    if (this.level === 1) {
      // Pure 1-shift onboarding: Top row (Row 0) shifted RIGHT by 1
      // Solved by swiping Top row (Row 0) LEFT by 1!
      const solved = solvedBoard();
      const m1 = applyMove(solved, { type: 'row', index: 0, direction: 'right' });
      this.board = cloneBoard(m1);
      this.scrambledBoard = cloneBoard(m1);
    } else if (this.level === 2) {
      // 2-shift level: Row 0 shifted right, Col 0 shifted down
      const solved = solvedBoard();
      const m1 = applyMove(solved, { type: 'row', index: 0, direction: 'right' });
      const m2 = applyMove(m1, { type: 'col', index: 0, direction: 'down' });
      this.board = cloneBoard(m2);
      this.scrambledBoard = cloneBoard(m2);
    } else {
      const result = scramble(this.level);
      this.board = cloneBoard(result.board);
      this.scrambledBoard = cloneBoard(result.board);
    }
  }

  // ─── Background ─────────────────────────────────────────────────────────────
  private drawBackground() {
    const { width, height } = this.scale;
    const bg = this.add.graphics();
    bg.fillGradientStyle(COLORS.bgDeep, COLORS.bgDeep, COLORS.bgPanel, COLORS.bgPanel, 1);
    bg.fillRect(0, 0, width, height);

    // Subtle grid-pattern dots
    const dots = this.add.graphics();
    dots.fillStyle(0x1a2550, 0.4);
    for (let x = 20; x < width; x += 40) {
      for (let y = 20; y < height; y += 40) {
        dots.fillCircle(x, y, 1);
      }
    }
  }

  // ─── High-DPI Text Helper ──────────────────────────────────────────────────
  private createText(
    x: number,
    y: number,
    text: string | string[],
    style: Phaser.Types.GameObjects.Text.TextStyle = {},
  ): Phaser.GameObjects.Text {
    const dpr = Math.max(window.devicePixelRatio || 1, 2);
    return this.add.text(x, y, text, {
      fontFamily: "'Outfit', 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif",
      resolution: dpr,
      ...style,
    });
  }

  // ─── Grid rendering ─────────────────────────────────────────────────────────
  private createGrid() {
    const sf = this.scaleFactor;
    const tileSize = TILE_SIZE * sf;
    const tileGap  = TILE_GAP  * sf;
    const gridX    = (this.scale.width  - (GRID_TOTAL * sf)) / 2;
    const gridY    = GRID_Y * sf;

    // Grid background card
    const pad = 12 * sf;
    const card = this.add.graphics();
    card.fillStyle(COLORS.bgCard, 1);
    card.fillRoundedRect(gridX - pad, gridY - pad,
      GRID_TOTAL * sf + pad * 2, GRID_TOTAL * sf + pad * 2, 14 * sf);
    card.lineStyle(1.5, COLORS.panelBorder, 0.8);
    card.strokeRoundedRect(gridX - pad, gridY - pad,
      GRID_TOTAL * sf + pad * 2, GRID_TOTAL * sf + pad * 2, 14 * sf);

    // Interactive hand cursor zone across the board
    this.add.zone(
      gridX + (GRID_TOTAL * sf) / 2,
      gridY + (GRID_TOTAL * sf) / 2,
      GRID_TOTAL * sf,
      GRID_TOTAL * sf,
    ).setInteractive({ useHandCursor: true });

    this.tileSprites = [];
    for (let i = 0; i < GRID_SIZE * GRID_SIZE; i++) {
      const row = Math.floor(i / GRID_SIZE);
      const col = i % GRID_SIZE;
      const x = gridX + col * (tileSize + tileGap) + tileSize / 2;
      const y = gridY + row * (tileSize + tileGap) + tileSize / 2;
      const value = this.board[i];

      const bg = this.add.rectangle(0, 0, tileSize - 2, tileSize - 2, COLORS.tile)
        .setStrokeStyle(1.5, COLORS.panelBorder);
      (bg as Phaser.GameObjects.Rectangle).setOrigin(0.5);

      const label = this.createText(0, 0, String(value), {
        fontSize: `${Math.round(28 * sf)}px`,
        fontStyle: 'bold',
        color: '#' + COLORS.tileText.toString(16).padStart(6, '0'),
      }).setOrigin(0.5);

      const container = this.add.container(x, y, [bg, label]);

      this.tileSprites.push({ container, bg, label, value });
    }

    this.refreshTileColors();
  }

  // ─── Arrow buttons ──────────────────────────────────────────────────────────
  private createArrows() {
    const sf = this.scaleFactor;
    const tileSize  = TILE_SIZE * sf;
    const tileGap   = TILE_GAP  * sf;
    const gridX     = (this.scale.width - GRID_TOTAL * sf) / 2;
    const gridY     = GRID_Y * sf;
    const arrowSize = ARROW_SIZE * sf;
    const arrowMrg  = ARROW_MARGIN * sf;

    this.arrowBtns = [];

    for (let i = 0; i < GRID_SIZE; i++) {
      const cellMid = i * (tileSize + tileGap) + tileSize / 2;

      // Row: left arrow
      this.makeArrow(
        gridX - arrowMrg - arrowSize / 2,
        gridY + cellMid,
        '←', 'row', i, 'left', arrowSize);

      // Row: right arrow
      this.makeArrow(
        gridX + GRID_TOTAL * sf + arrowMrg + arrowSize / 2,
        gridY + cellMid,
        '→', 'row', i, 'right', arrowSize);

      // Col: up arrow
      this.makeArrow(
        gridX + cellMid,
        gridY - arrowMrg - arrowSize / 2,
        '↑', 'col', i, 'up', arrowSize);

      // Col: down arrow
      this.makeArrow(
        gridX + cellMid,
        gridY + GRID_TOTAL * sf + arrowMrg + arrowSize / 2,
        '↓', 'col', i, 'down', arrowSize);
    }
  }

  private makeArrow(
    x: number, y: number,
    symbol: string,
    type: 'row' | 'col',
    index: number,
    direction: ShiftDirection,
    size: number,
  ): void {
    const bg = this.add.rectangle(0, 0, size, size, COLORS.arrowBg)
      .setStrokeStyle(1.5, COLORS.arrowStroke)
      .setOrigin(0.5) as Phaser.GameObjects.Rectangle;
    (bg as unknown as { setRoundedRectangle: (r: number) => void });

    const icon = this.createText(0, 0, symbol, {
      fontSize: `${Math.round(size * 0.48)}px`,
      color: '#' + COLORS.accent.toString(16).padStart(6, '0'),
    }).setOrigin(0.5);

    const container = this.add.container(x, y, [bg, icon]);
    const touchSize = Math.max(size, 44);
    container.setSize(touchSize, touchSize);
    container.setInteractive({ useHandCursor: true });

    // Hover effects
    container.on('pointerover', () => {
      bg.setFillStyle(COLORS.arrowHover);
      icon.setStyle({ color: '#' + COLORS.accentHover.toString(16).padStart(6, '0') });
      this.tweens.add({ targets: container, scaleX: 1.08, scaleY: 1.08, duration: 80, ease: 'Back.Out' });
    });
    container.on('pointerout', () => {
      bg.setFillStyle(COLORS.arrowBg);
      icon.setStyle({ color: '#' + COLORS.accent.toString(16).padStart(6, '0') });
      this.tweens.add({ targets: container, scaleX: 1, scaleY: 1, duration: 80 });
    });
    container.on('pointerdown', () => {
      sounds.playClick();
      this.tweens.add({ targets: container, scaleX: 0.9, scaleY: 0.9, duration: 60 });
    });
    container.on('pointerup', () => {
      this.tweens.add({ targets: container, scaleX: 1, scaleY: 1, duration: 80 });
      this.doShift(type, index, direction);
    });

    const btn: ArrowBtn = { container, bg, icon, type, index, direction };
    this.arrowBtns.push(btn);
  }

  // ─── HUD ────────────────────────────────────────────────────────────────────
  private createHUD() {
    const sf = this.scaleFactor;
    const cx = this.scale.width / 2;

    // Title
    this.createText(cx, 12 * sf, 'ONE SHIFT', {
      fontSize: `${Math.round(24 * sf)}px`,
      fontStyle: 'bold',
      color: '#' + COLORS.accent.toString(16).padStart(6, '0'),
    }).setOrigin(0.5, 0);

    // Explicit Objective Reminder
    this.createText(cx, 34 * sf, 'Goal: Order tiles 1–16', {
      fontSize: `${Math.round(11 * sf)}px`,
      fontStyle: 'bold',
      color: '#' + COLORS.textMuted.toString(16).padStart(6, '0'),
    }).setOrigin(0.5, 0);

    // Level display with navigation arrows
    const maxUnlocked = parseInt(crazyGames.getItem('oneshift_max_unlocked') || '1', 10);
    const canPrev = this.level > 1;
    const canNext = this.level < maxUnlocked;

    this.createText(cx, 50 * sf, `Level ${this.level}`, {
      fontSize: `${Math.round(15 * sf)}px`,
      fontStyle: 'bold',
      color: '#' + COLORS.text.toString(16).padStart(6, '0'),
    }).setOrigin(0.5, 0);

    // Prev Level Arrow (◀)
    const prevBtn = this.createText(cx - 58 * sf, 48 * sf, '◀', {
      fontSize: `${Math.round(15 * sf)}px`,
      color: canPrev ? '#' + COLORS.accent.toString(16).padStart(6, '0') : '#364066',
    }).setOrigin(0.5, 0);

    if (canPrev) {
      prevBtn.setInteractive({ useHandCursor: true });
      prevBtn.on('pointerdown', () => {
        sounds.playClick();
        this.goToLevel(this.level - 1);
      });
    }

    // Next Level Arrow (▶)
    const nextBtn = this.createText(cx + 58 * sf, 48 * sf, '▶', {
      fontSize: `${Math.round(15 * sf)}px`,
      color: canNext ? '#' + COLORS.accent.toString(16).padStart(6, '0') : '#364066',
    }).setOrigin(0.5, 0);

    if (canNext) {
      nextBtn.setInteractive({ useHandCursor: true });
      nextBtn.on('pointerdown', () => {
        sounds.playClick();
        this.goToLevel(this.level + 1);
      });
    }

    // Par & Dynamic Star Meter
    this.parStarsText = this.createText(cx, 70 * sf, this.getParStarsString(), {
      fontSize: `${Math.round(13 * sf)}px`,
      fontStyle: 'bold',
      color: '#f5a623',
    }).setOrigin(0.5, 0);

    // Stats row
    const statY = 94 * sf;
    const statSpan = 140 * sf;

    // Moves
    this.createText(cx - statSpan, statY, 'MOVES', {
      fontSize: `${Math.round(10 * sf)}px`,
      color: '#' + COLORS.textMuted.toString(16).padStart(6, '0'),
    }).setOrigin(0.5, 0);
    this.movesText = this.createText(cx - statSpan, statY + 14 * sf, '0', {
      fontSize: `${Math.round(22 * sf)}px`,
      fontStyle: 'bold',
      color: '#' + COLORS.text.toString(16).padStart(6, '0'),
    }).setOrigin(0.5, 0);

    // Timer
    this.createText(cx, statY, 'TIME', {
      fontSize: `${Math.round(10 * sf)}px`,
      color: '#' + COLORS.textMuted.toString(16).padStart(6, '0'),
    }).setOrigin(0.5, 0);
    this.timerText = this.createText(cx, statY + 14 * sf, '0:00', {
      fontSize: `${Math.round(22 * sf)}px`,
      fontStyle: 'bold',
      color: '#' + COLORS.text.toString(16).padStart(6, '0'),
    }).setOrigin(0.5, 0);

    // Best (persisted in CrazyGames Data Module / localStorage per level)
    const savedBest = crazyGames.getItem('oneshift_best_lvl_' + this.level);
    const bestVal = savedBest ? parseInt(savedBest, 10) : (bestMoves[this.level] ?? null);

    this.createText(cx + statSpan, statY, 'BEST', {
      fontSize: `${Math.round(10 * sf)}px`,
      color: '#' + COLORS.textMuted.toString(16).padStart(6, '0'),
    }).setOrigin(0.5, 0);
    this.bestText = this.createText(cx + statSpan, statY + 14 * sf, bestVal != null ? String(bestVal) : '—', {
      fontSize: `${Math.round(22 * sf)}px`,
      fontStyle: 'bold',
      color: '#' + COLORS.textAccent.toString(16).padStart(6, '0'),
    }).setOrigin(0.5, 0);

    // Audio Mute / Unmute Button
    const muteIcon = this.createText(this.scale.width - 28 * sf, 26 * sf, sounds.isMuted() ? '🔇' : '🔊', {
      fontSize: `${Math.round(20 * sf)}px`,
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    muteIcon.on('pointerdown', () => {
      const isMuted = sounds.toggleMute();
      muteIcon.setText(isMuted ? '🔇' : '🔊');
    });
  }

  private getParStarsString(): string {
    const par = getParMoves(this.level);
    let stars = '★★★';
    if (this.moveCount > par + 2) {
      stars = '★☆☆';
    } else if (this.moveCount > par) {
      stars = '★★☆';
    }
    return `PAR: ${par}  |  ${stars}`;
  }

  private updateParStars() {
    if (!this.parStarsText) return;
    this.parStarsText.setText(this.getParStarsString());
    const par = getParMoves(this.level);
    if (this.moveCount <= par) {
      this.parStarsText.setStyle({ color: '#f5a623' });
    } else if (this.moveCount <= par + 2) {
      this.parStarsText.setStyle({ color: '#d4af37' });
    } else {
      this.parStarsText.setStyle({ color: '#8899aa' });
    }
  }

  // ─── Control buttons (Undo, Restart, New Game, Pause, How To) ───────────────
  private createControlButtons() {
    const sf = this.scaleFactor;
    const gridBottom = GRID_Y * sf + GRID_TOTAL * sf;
    const btnY = gridBottom + (ARROW_SIZE + ARROW_MARGIN * 2 + 22) * sf;

    const w = this.scale.width;
    const bw = 88 * sf;
    const bh = 36 * sf;
    const gap = 8 * sf;
    const total = bw * 3 + gap * 2;
    const startX = (w - total) / 2;

    this.undoBtn    = this.makeControlBtn(startX + bw * 0 + gap * 0 + bw / 2, btnY, '↩ Undo',    bw, bh);
    this.restartBtn = this.makeControlBtn(startX + bw * 1 + gap * 1 + bw / 2, btnY, '⟳ Restart', bw, bh);
    this.newGameBtn = this.makeControlBtn(startX + bw * 2 + gap * 2 + bw / 2, btnY, '⊕ New',     bw, bh);

    this.undoBtn.on('pointerup',    () => this.doUndo());
    this.restartBtn.on('pointerup', () => this.doRestart());
    this.newGameBtn.on('pointerup', () => this.doNewGame());

    const row2Y = btnY + bh + 10 * sf;
    const pw = 120 * sf;
    this.pauseBtn  = this.makeControlBtn(w / 2 - pw / 2 - 5 * sf, row2Y, '⏸ Pause', pw, bh, true);
    this.howToBtn  = this.makeControlBtn(w / 2 + pw / 2 + 5 * sf, row2Y, '? How To', pw, bh, true);

    this.pauseBtn.on('pointerup', () => this.togglePause());
    this.howToBtn.on('pointerup', () => this.showHowTo());
  }

  private makeControlBtn(
    x: number, y: number, label: string,
    w: number, h: number, accent = false,
  ): Phaser.GameObjects.Container {
    const sf = this.scaleFactor;
    const bgColor = accent ? COLORS.accentDark : COLORS.arrowBg;
    const bgHover = accent ? COLORS.accent     : COLORS.arrowHover;

    const bg = this.add.rectangle(0, 0, w, h, bgColor)
      .setStrokeStyle(1.5, accent ? COLORS.accent : COLORS.arrowStroke)
      .setOrigin(0.5) as Phaser.GameObjects.Rectangle;

    const txt = this.createText(0, 0, label, {
      fontSize: `${Math.round(13 * sf)}px`,
      fontStyle: 'bold',
      color: accent ? '#' + COLORS.bgDeep.toString(16).padStart(6, '0')
                    : '#' + COLORS.text.toString(16).padStart(6, '0'),
    }).setOrigin(0.5);

    const c = this.add.container(x, y, [bg, txt]);
    c.setSize(w, h);
    c.setInteractive({ useHandCursor: true });

    c.on('pointerover', () => {
      bg.setFillStyle(bgHover);
      this.tweens.add({ targets: c, scaleX: 1.04, scaleY: 1.04, duration: 80 });
    });
    c.on('pointerout', () => {
      bg.setFillStyle(bgColor);
      this.tweens.add({ targets: c, scaleX: 1, scaleY: 1, duration: 80 });
    });
    c.on('pointerdown', () => {
      sounds.playClick();
      this.tweens.add({ targets: c, scaleX: 0.94, scaleY: 0.94, duration: 60 });
    });
    c.on('pointerup',   () => this.tweens.add({ targets: c, scaleX: 1,    scaleY: 1,    duration: 80 }));

    return c;
  }

  // ─── Pause overlay ──────────────────────────────────────────────────────────
  private createPauseOverlay() {
    const { width, height } = this.scale;
    const sf = this.scaleFactor;

    const darken = this.add.rectangle(0, 0, width, height, 0x000000, 0.75).setOrigin(0);
    const panel = this.add.rectangle(width / 2, height / 2, 300 * sf, 200 * sf, COLORS.panelBg)
      .setStrokeStyle(2, COLORS.accent);

    const title = this.createText(width / 2, height / 2 - 60 * sf, 'PAUSED', {
      fontSize: `${Math.round(30 * sf)}px`,
      fontStyle: 'bold',
      color: '#' + COLORS.accent.toString(16).padStart(6, '0'),
    }).setOrigin(0.5);

    const sub = this.createText(width / 2, height / 2 - 10 * sf, 'Tap Resume to continue', {
      fontSize: `${Math.round(14 * sf)}px`,
      color: '#' + COLORS.textMuted.toString(16).padStart(6, '0'),
    }).setOrigin(0.5);

    const resumeBtn = this.makeControlBtn(width / 2, height / 2 + 45 * sf, '▶ Resume', 140 * sf, 44 * sf, true);
    resumeBtn.on('pointerup', () => this.togglePause());

    this.pauseOverlay = this.add.container(0, 0, [darken, panel, title, sub, resumeBtn]);
    this.pauseOverlay.setVisible(false);
    this.pauseOverlay.setDepth(10);
  }

  // ─── How To overlay ─────────────────────────────────────────────────────────
  private createHowToOverlay() {
    const { width, height } = this.scale;
    const sf = this.scaleFactor;

    const darken = this.add.rectangle(0, 0, width, height, 0x000000, 0.8).setOrigin(0);
    const panW = Math.min(360 * sf, width - 30 * sf);
    const panH = 420 * sf;
    const panel = this.add.rectangle(width / 2, height / 2, panW, panH, COLORS.panelBg)
      .setStrokeStyle(2, COLORS.accent);

    const items: Phaser.GameObjects.GameObject[] = [darken, panel];

    const addLine = (text: string, dy: number, size = 13, color: number = COLORS.text, style = '') => {
      const hexColor = '#' + color.toString(16).padStart(6, '0');
      items.push(this.createText(width / 2, height / 2 + dy * sf, text, {
        fontSize: `${Math.round(size * sf)}px`,
        fontStyle: style,
        color: hexColor,
        align: 'center',
        wordWrap: { width: panW - 30 * sf },
      }).setOrigin(0.5));
    };

    addLine('HOW TO PLAY', -185, 20, COLORS.accent, 'bold');
    addLine('Goal: arrange tiles 1–16 in order,\nleft→right, top→bottom.', -148, 12);
    addLine('─────────────────────', -115, 10, COLORS.textMuted);
    addLine('Tap the arrows to shift\nan entire row or column.', -95, 12);
    addLine('Tiles wrap around the edge!', -65, 11, COLORS.textMuted);
    addLine('─────────────────────', -42, 10, COLORS.textMuted);
    addLine('⌨️  Keyboard Controls', -22, 13, COLORS.accent, 'bold');
    addLine('Arrow Keys → shift selected row/col', 0, 11);
    addLine('W A S D → select row/column', 20, 11);
    addLine('Tab → switch row ↔ column mode', 40, 11);
    addLine('─────────────────────', 65, 10, COLORS.textMuted);
    addLine('↩  Undo  |  ⟳ Restart  |  ⊕ New Game', 85, 11);

    const closeBtn = this.makeControlBtn(width / 2, height / 2 + 170 * sf, '✓ Got It', 140 * sf, 44 * sf, true);
    closeBtn.on('pointerup', () => this.hideHowTo());
    items.push(closeBtn);

    this.howToOverlay = this.add.container(0, 0, items);
    this.howToOverlay.setVisible(false);
    this.howToOverlay.setDepth(10);
  }

  private createTimeUpOverlay() {
    const { width, height } = this.scale;
    const sf = this.scaleFactor;
    const cx = width / 2;
    const cy = height / 2;

    const darken = this.add.rectangle(0, 0, width, height, 0x000000, 0.85).setOrigin(0);
    const panW = Math.min(320 * sf, width - 40 * sf);
    const panH = 260 * sf;
    const panel = this.add.rectangle(cx, cy, panW, panH, COLORS.panelBg)
      .setStrokeStyle(2.5, 0xff4455);

    const icon = this.createText(cx, cy - 65 * sf, '⏳', {
      fontSize: `${Math.round(42 * sf)}px`,
    }).setOrigin(0.5);

    const title = this.createText(cx, cy - 12 * sf, "TIME'S UP!", {
      fontSize: `${Math.round(24 * sf)}px`,
      fontStyle: 'bold',
      color: '#ff4455',
    }).setOrigin(0.5);

    const sub = this.createText(cx, cy + 24 * sf, 'The clock ran out before solving!', {
      fontSize: `${Math.round(13 * sf)}px`,
      color: '#' + COLORS.textMuted.toString(16).padStart(6, '0'),
    }).setOrigin(0.5);

    const btnW = 160 * sf;
    const btnH = 46 * sf;
    const btnY = cy + 78 * sf;

    const retryBg = this.add.rectangle(0, 0, btnW, btnH, 0xff4455).setOrigin(0.5);
    const retryTxt = this.createText(0, 0, '🔄 Try Again', {
      fontSize: `${Math.round(16 * sf)}px`,
      fontStyle: 'bold',
      color: '#ffffff',
    }).setOrigin(0.5);

    const retryBtn = this.add.container(cx, btnY, [retryBg, retryTxt]);
    retryBtn.setSize(btnW, btnH);
    retryBtn.setInteractive({ useHandCursor: true });

    const handleRetry = () => {
      sounds.playClick();
      this.timeUpOverlay.setVisible(false);
      this.paused = false;
      this.doRestart();
      this.startTimer();
      crazyGames.gameplayStart();
    };

    retryBtn.on('pointerdown', handleRetry);
    retryBtn.on('pointerup', handleRetry);

    this.timeUpOverlay = this.add.container(0, 0, [darken, panel, icon, title, sub, retryBtn]);
    this.timeUpOverlay.setVisible(false);
    this.timeUpOverlay.setDepth(25);
  }

  // ─── Keyboard selection indicator ───────────────────────────────────────────
  private createSelectionIndicator() {
    this.selectionIndicator = this.add.graphics();
    this.selectionIndicator.setVisible(false);
    this.selectionIndicator.setDepth(5);
  }

  private drawSelectionIndicator() {
    const sf = this.scaleFactor;
    const tileSize = TILE_SIZE * sf;
    const tileGap  = TILE_GAP  * sf;
    const gridX    = (this.scale.width - GRID_TOTAL * sf) / 2;
    const gridY    = GRID_Y * sf;

    this.selectionIndicator.clear();
    this.selectionIndicator.lineStyle(2.5, COLORS.accentHover, 0.9);

    if (this.keyboardMode) {
      // Highlight selected row
      const rx = gridX - 3 * sf;
      const ry = gridY + this.selectedRow * (tileSize + tileGap) - 3 * sf;
      const rw = GRID_TOTAL * sf + 6 * sf;
      const rh = tileSize + 6 * sf;
      this.selectionIndicator.strokeRect(rx, ry, rw, rh);

      // Dim label
      this.selectionIndicator.fillStyle(COLORS.accentHover, 0.08);
      this.selectionIndicator.fillRect(rx, ry, rw, rh);
    }
  }

  // ─── Keyboard input ─────────────────────────────────────────────────────────
  private setupKeyboard() {
    if (!this.input.keyboard) return;
    this.input.keyboard.createCursorKeys(); // registers keys even if not stored

    this.input.keyboard.on('keydown', (event: KeyboardEvent) => {
      if (this.paused || this.animating) return;
      if (this.pauseOverlay.visible || this.howToOverlay.visible) return;

      switch (event.code) {
        case 'ArrowLeft':  this.keyboardMode = true; this.drawSelectionIndicator(); this.selectionIndicator.setVisible(true); this.doShift('row', this.selectedRow, 'left'); break;
        case 'ArrowRight': this.keyboardMode = true; this.drawSelectionIndicator(); this.selectionIndicator.setVisible(true); this.doShift('row', this.selectedRow, 'right'); break;
        case 'ArrowUp':    this.keyboardMode = true; this.drawSelectionIndicator(); this.selectionIndicator.setVisible(true); this.doShift('col', this.selectedCol, 'up'); break;
        case 'ArrowDown':  this.keyboardMode = true; this.drawSelectionIndicator(); this.selectionIndicator.setVisible(true); this.doShift('col', this.selectedCol, 'down'); break;
        case 'KeyW': this.selectedRow = Math.max(0, this.selectedRow - 1); this.drawSelectionIndicator(); break;
        case 'KeyS': this.selectedRow = Math.min(GRID_SIZE - 1, this.selectedRow + 1); this.drawSelectionIndicator(); break;
        case 'KeyA': this.selectedCol = Math.max(0, this.selectedCol - 1); break;
        case 'KeyD': this.selectedCol = Math.min(GRID_SIZE - 1, this.selectedCol + 1); break;
        case 'KeyZ': this.doUndo(); break;
        case 'KeyR': this.doRestart(); break;
        case 'KeyP': this.togglePause(); break;
      }
    });
  }

  // ─── Swipe & Drag controls ──────────────────────────────────────────────────
  private setupSwipeControls() {
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (this.animating || this.paused) return;
      if (this.pauseOverlay.visible || this.howToOverlay.visible) return;
      if (this.activePointerId !== null) return; // Ignore multi-touch secondary fingers

      const sf = this.scaleFactor;
      const tileSize = TILE_SIZE * sf;
      const tileGap  = TILE_GAP  * sf;
      const gridX    = (this.scale.width - GRID_TOTAL * sf) / 2;
      const gridY    = GRID_Y * sf;
      const step     = tileSize + tileGap;
      const gridSpan = GRID_TOTAL * sf;

      // Generous edge-to-edge hitbox margin (+14px) so outer thumb swipes never fail
      const hitMargin = 14 * sf;
      const relX = pointer.x - gridX;
      const relY = pointer.y - gridY;

      if (relX >= -hitMargin && relX <= gridSpan + hitMargin &&
          relY >= -hitMargin && relY <= gridSpan + hitMargin) {
        // Clamp row and column so finger hitting outer border is recognized reliably
        const c = Phaser.Math.Clamp(Math.floor(relX / step), 0, GRID_SIZE - 1);
        const r = Phaser.Math.Clamp(Math.floor(relY / step), 0, GRID_SIZE - 1);

        this.activePointerId = pointer.id;
        this.swipeStartX = pointer.x;
        this.swipeStartY = pointer.y;
        this.swipeRow = r;
        this.swipeCol = c;
        this.isSwiping = true;
      }
    });

    const handlePointerEnd = (pointer: Phaser.Input.Pointer) => {
      if (!this.isSwiping || pointer.id !== this.activePointerId) return;
      this.isSwiping = false;
      this.activePointerId = null;

      if (this.animating || this.paused) return;

      const dx = pointer.x - this.swipeStartX;
      const dy = pointer.y - this.swipeStartY;
      const sf = this.scaleFactor;
      const minDistance = 14 * sf; // Highly responsive flick threshold

      if (Math.abs(dx) < minDistance && Math.abs(dy) < minDistance) {
        return; // Small tap, ignore
      }

      if (Math.abs(dx) >= Math.abs(dy)) {
        // Horizontal swipe along this.swipeRow
        const dir: ShiftDirection = dx > 0 ? 'right' : 'left';
        this.doShift('row', this.swipeRow, dir);
      } else {
        // Vertical swipe along this.swipeCol
        const dir: ShiftDirection = dy > 0 ? 'down' : 'up';
        this.doShift('col', this.swipeCol, dir);
      }
    };

    this.input.on('pointerup', handlePointerEnd);
    this.input.on('pointerupoutside', handlePointerEnd);

    // Touch-Cancel & Blur protection (prevents stuck / frozen swipe states)
    this.input.on('pointercancel', () => {
      this.isSwiping = false;
      this.activePointerId = null;
    });

    this.game.events.on('blur', () => {
      this.isSwiping = false;
      this.activePointerId = null;
    });
  }

  // ─── Onboarding Tutorial ────────────────────────────────────────────────────
  private createTutorialHint() {
    if (this.level > 2) return;

    const sf = this.scaleFactor;
    const gridX = (this.scale.width - GRID_TOTAL * sf) / 2;
    const gridY = GRID_Y * sf;
    const tileSize = TILE_SIZE * sf;

    const items: Phaser.GameObjects.GameObject[] = [];

    if (this.level === 1) {
      // Placed cleanly at y=176 in the gap between stats (y=155) and up-arrows (y=216)
      const bannerY = 176;
      const bannerBg = this.add.rectangle(this.scale.width / 2, bannerY, 340, 26, COLORS.panelBg, 0.95)
        .setStrokeStyle(1.5, COLORS.accent);
      const bannerTxt = this.createText(this.scale.width / 2, bannerY, '👈 Swipe Top Row LEFT to Solve in 1 Shift!', {
        fontSize: '12px',
        fontStyle: 'bold',
        color: '#' + COLORS.accent.toString(16).padStart(6, '0'),
      }).setOrigin(0.5);

      // Animated hand / chevron moving across row 0
      const rowY = gridY + tileSize / 2;
      const pointer = this.createText(gridX + GRID_TOTAL - 25, rowY, '👈', {
        fontSize: '28px',
      }).setOrigin(0.5);

      this.tweens.add({
        targets: pointer,
        x: gridX + 35,
        duration: 1300,
        repeat: -1,
        ease: 'Cubic.InOut',
      });

      items.push(bannerBg, bannerTxt, pointer);
    } else if (this.level === 2) {
      // Placed cleanly at y=176 in the gap between stats (y=155) and up-arrows (y=216)
      const bannerY = 176;
      const bannerBg = this.add.rectangle(this.scale.width / 2, bannerY, 340, 26, COLORS.panelBg, 0.95)
        .setStrokeStyle(1.5, COLORS.accent);
      const bannerTxt = this.createText(this.scale.width / 2, bannerY, '👆 Shift Col 1 UP, then 👈 Row 1 LEFT!', {
        fontSize: '12px',
        fontStyle: 'bold',
        color: '#' + COLORS.accent.toString(16).padStart(6, '0'),
      }).setOrigin(0.5);
      items.push(bannerBg, bannerTxt);
    }

    // Skip Tutorial button (meets CrazyGames "make onboarding skippable" requirement)
    const skipY = 742;
    const skipBtn = this.createText(this.scale.width / 2, skipY, '⏭ Skip Tutorial', {
      fontSize: '13px',
      fontStyle: 'bold',
      color: '#' + COLORS.textMuted.toString(16).padStart(6, '0'),
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    skipBtn.on('pointerdown', () => {
      sounds.playClick();
      this.scene.restart({ level: 3 });
    });

    items.push(skipBtn);
    this.tutorialContainer = this.add.container(0, 0, items);
  }

  private dismissTutorial() {
    if (this.tutorialContainer) {
      this.tweens.add({
        targets: this.tutorialContainer,
        alpha: 0,
        duration: 250,
        onComplete: () => {
          this.tutorialContainer?.destroy();
          this.tutorialContainer = null;
        },
      });
    }
  }

  // ─── Countdown Timer ────────────────────────────────────────────────────────
  private startTimer() {
    this.timeLimit = getLevelTimeLimit(this.level);
    if (!this.startTime) {
      this.startTime = Date.now();
    }
    this.updateTimer();
    this.timerEvent = this.time.addEvent({
      delay: 250,
      callback: this.updateTimer,
      callbackScope: this,
      loop: true,
    });
  }

  private updateTimer() {
    if (this.paused) return;
    const elapsed = Math.floor((Date.now() - this.startTime - this.totalPauseMs) / 1000);
    const remaining = Math.max(0, this.timeLimit - elapsed);
    const m = Math.floor(remaining / 60);
    const s = remaining % 60;
    this.timerText.setText(`${m}:${String(s).padStart(2, '0')}`);

    if (remaining <= 10 && remaining > 0) {
      this.timerText.setStyle({ color: '#ff4455' });
      if (this.lastTickSecond !== remaining) {
        this.lastTickSecond = remaining;
        sounds.playTimeWarning();
        triggerHaptic(25);
        this.tweens.add({
          targets: this.timerText,
          scaleX: 1.15,
          scaleY: 1.15,
          duration: 90,
          yoyo: true,
          ease: 'Sine.InOut',
        });
      }
    } else if (remaining > 10) {
      this.timerText.setStyle({ color: '#' + COLORS.text.toString(16).padStart(6, '0') });
    }

    if (remaining <= 0) {
      this.timerEvent?.remove();
      this.onTimeUp();
    }
  }

  private onTimeUp() {
    this.paused = true;
    sounds.playTimeUp();
    triggerHaptic(40);
    crazyGames.gameplayStop();
    this.timeUpOverlay.setVisible(true);
  }

  private getElapsedSeconds(): number {
    return Math.floor((Date.now() - this.startTime - this.totalPauseMs) / 1000);
  }

  // ─── Shift logic ────────────────────────────────────────────────────────────
  doShift(type: 'row' | 'col', index: number, direction: ShiftDirection) {
    if (this.animating || this.paused) return;
    if (this.pauseOverlay.visible || this.howToOverlay.visible) return;

    this.dismissTutorial();

    const move: MoveRecord = { type, index, direction };
    const newBoard = applyMove(this.board, move);

    sounds.playSlide();
    this.animating = true;
    this.animateShift(type, index, direction, newBoard, () => {
      this.board = newBoard;
      this.moveHistory.push(move);
      this.moveCount++;
      this.movesText.setText(String(this.moveCount));
      this.updateParStars();
      this.snapTilesToBoard();
      this.refreshTileColors();
      this.animating = false;
      triggerHaptic(15);

      // Game Juice: subtle tactile impact shake
      this.cameras.main.shake(50, 0.002);

      // Pulse and chime for placed solved tiles
      let hasSolved = false;
      for (let i = 0; i < GRID_SIZE * GRID_SIZE; i++) {
        const val = this.board[i];
        if (val === i + 1) {
          const sprite = this.tileSprites.find(s => s.value === val);
          if (sprite) {
            this.tweens.add({
              targets: sprite.container,
              scaleX: 1.05,
              scaleY: 1.05,
              duration: 90,
              yoyo: true,
              ease: 'Sine.InOut',
            });
            hasSolved = true;
          }
        }
      }
      if (hasSolved) {
        sounds.playTileSolved();
      }

      if (isSolved(this.board)) {
        this.onVictory();
      }
    });
  }

  private animateShift(
    type: 'row' | 'col',
    index: number,
    direction: ShiftDirection,
    newBoard: Board,
    onComplete: () => void,
  ) {
    const sf = this.scaleFactor;
    const tileSize = TILE_SIZE * sf;
    const tileGap  = TILE_GAP  * sf;
    const gridX    = (this.scale.width - GRID_TOTAL * sf) / 2;
    const gridY    = GRID_Y * sf;
    const step     = tileSize + tileGap;

    const getPosCoords = (boardIdx: number) => {
      const col = boardIdx % GRID_SIZE;
      const row = Math.floor(boardIdx / GRID_SIZE);
      return {
        x: gridX + col * step + tileSize / 2,
        y: gridY + row * step + tileSize / 2,
      };
    };

    // Collect board indices for this row or column
    const indices: number[] = [];
    for (let i = 0; i < GRID_SIZE; i++) {
      indices.push(type === 'row' ? index * GRID_SIZE + i : i * GRID_SIZE + index);
    }

    // Step offset vector
    let dx = 0;
    let dy = 0;
    if (type === 'row') {
      dx = direction === 'left' ? -step : step;
    } else {
      dy = direction === 'up' ? -step : step;
    }

    // Determine which tile wraps around
    const wrapOldIdx = (direction === 'left' || direction === 'up')
      ? indices[0]
      : indices[GRID_SIZE - 1];

    let completed = 0;
    const total = indices.length;

    const finish = () => {
      completed++;
      if (completed >= total) {
        onComplete();
      }
    };

    for (const oldIdx of indices) {
      const tileValue = this.board[oldIdx];
      const sprite = this.tileSprites.find(s => s.value === tileValue)!;
      const newIdx = newBoard.indexOf(tileValue);
      const startCoord = getPosCoords(oldIdx);
      const targetCoord = getPosCoords(newIdx);

      // Ensure container starts at exact expected coordinates
      sprite.container.setPosition(startCoord.x, startCoord.y);

      if (oldIdx === wrapOldIdx) {
        // Wrapping tile:
        // Slide out in shift direction, jump to outside opposite edge, slide in to target position
        this.tweens.add({
          targets: sprite.container,
          x: startCoord.x + dx * 0.5,
          y: startCoord.y + dy * 0.5,
          duration: SHIFT_ANIM_DURATION * 0.45,
          ease: 'Sine.In',
          onComplete: () => {
            sprite.container.setPosition(
              targetCoord.x - dx * 0.55,
              targetCoord.y - dy * 0.55,
            );
            this.tweens.add({
              targets: sprite.container,
              x: targetCoord.x,
              y: targetCoord.y,
              duration: SHIFT_ANIM_DURATION * 0.55,
              ease: 'Sine.Out',
              onComplete: finish,
            });
          },
        });
      } else {
        // Normal sliding tile
        this.tweens.add({
          targets: sprite.container,
          x: targetCoord.x,
          y: targetCoord.y,
          duration: SHIFT_ANIM_DURATION,
          ease: 'Sine.InOut',
          onComplete: finish,
        });
      }
    }
  }

  private snapTilesToBoard() {
    const sf = this.scaleFactor;
    const tileSize = TILE_SIZE * sf;
    const tileGap  = TILE_GAP  * sf;
    const gridX    = (this.scale.width - GRID_TOTAL * sf) / 2;
    const gridY    = GRID_Y * sf;

    // Reorder tileSprites array to match board
    // Each tileSprite has a value, board has values at positions
    // We need to reassign positions based on new board state
    for (let i = 0; i < GRID_SIZE * GRID_SIZE; i++) {
      const value = this.board[i];
      const sprite = this.tileSprites.find(s => s.value === value);
      if (sprite) {
        const row = Math.floor(i / GRID_SIZE);
        const col = i % GRID_SIZE;
        const x = gridX + col * (tileSize + tileGap) + tileSize / 2;
        const y = gridY + row * (tileSize + tileGap) + tileSize / 2;
        sprite.container.setPosition(x, y);
      }
    }
  }

  private refreshTileColors() {
    const dpr = Math.max(window.devicePixelRatio || 1, 2);
    for (let i = 0; i < GRID_SIZE * GRID_SIZE; i++) {
      const value = this.board[i];
      const sprite = this.tileSprites.find(s => s.value === value);
      if (sprite) {
        const inPlace = value === i + 1;
        if (inPlace) {
          sprite.bg.setFillStyle(0x0e3f44);
          sprite.bg.setStrokeStyle(2, 0x00ffcc);
          sprite.label.setStyle({
            color: '#00ffcc',
            resolution: dpr,
          });
        } else {
          sprite.bg.setFillStyle(COLORS.tile);
          sprite.bg.setStrokeStyle(1.5, COLORS.panelBorder);
          sprite.label.setStyle({
            color: '#' + COLORS.tileText.toString(16).padStart(6, '0'),
            resolution: dpr,
          });
        }
      }
    }
  }

  // ─── Controls ───────────────────────────────────────────────────────────────
  private doUndo() {
    if (this.animating || this.moveHistory.length === 0) return;
    const lastMove = this.moveHistory.pop()!;
    const undoMove = reverseMove(lastMove);
    const newBoard = applyMove(this.board, undoMove);
    this.animating = true;
    this.animateShift(undoMove.type, undoMove.index, undoMove.direction, newBoard, () => {
      this.board = newBoard;
      this.moveCount = Math.max(0, this.moveCount - 1);
      this.movesText.setText(String(this.moveCount));
      this.updateParStars();
      this.snapTilesToBoard();
      this.refreshTileColors();
      this.animating = false;
      triggerHaptic(15);
    });
  }

  private doRestart() {
    if (this.animating) return;
    this.board = cloneBoard(this.scrambledBoard);
    this.moveCount = 0;
    this.moveHistory = [];
    this.startTime = Date.now();
    this.totalPauseMs = 0;
    this.lastTickSecond = -1;
    this.movesText.setText('0');
    this.updateParStars();
    this.timerText.setStyle({ color: '#' + COLORS.text.toString(16).padStart(6, '0') });
    this.snapTilesToBoard();
    this.refreshTileColors();
  }

  private goToLevel(lvl: number) {
    if (this.animating) return;
    try {
      crazyGames.setItem('oneshift_current_level', String(lvl));
    } catch (_) {}
    this.scene.restart({ level: lvl });
  }

  private doNewGame() {
    if (this.animating) return;
    this.scene.restart({ level: this.level });
  }

  private onVictory() {
    sounds.playVictory();
    triggerHaptic([40, 60, 40]);
    crazyGames.happytime();
    crazyGames.gameplayStop();
    this.timerEvent?.remove();
    const elapsed = this.getElapsedSeconds();

    // Persistent best score tracking
    const currentBest = crazyGames.getItem('oneshift_best_lvl_' + this.level);
    const parsedBest = currentBest ? parseInt(currentBest, 10) : null;
    let newBest = parsedBest;
    if (parsedBest === null || this.moveCount < parsedBest) {
      newBest = this.moveCount;
      try {
        crazyGames.setItem('oneshift_best_lvl_' + this.level, String(this.moveCount));
      } catch (_) {}
      if (this.bestText) {
        this.bestText.setText(String(this.moveCount));
        this.bestText.setStyle({ color: '#00ffcc' });
      }
    }
    bestMoves[this.level] = newBest ?? this.moveCount;

    // Flash all tiles with victory pulse
    for (const sprite of this.tileSprites) {
      this.tweens.add({
        targets: sprite.container,
        scaleX: 1.18, scaleY: 1.18,
        duration: 220,
        yoyo: true,
        ease: 'Sine.InOut',
      });
    }

    // Celebratory Confetti Burst (Commercial Game Juice)
    this.spawnConfetti(50);

    // Short delay then show victory scene
    this.time.delayedCall(500, () => {
      const data: VictoryData = {
        level: this.level,
        moves: this.moveCount,
        elapsedSeconds: elapsed,
        bestMoves: bestMoves[this.level] ?? null,
      };
      this.scene.launch(SCENE.VICTORY, data);
      this.scene.pause(SCENE.GAME);
    });
  }

  private spawnConfetti(count = 45) {
    const { width, height } = this.scale;
    const sf = this.scaleFactor;
    const colors = [0x00d4aa, 0x00ffcc, 0xf5a623, 0xff3366, 0x3399ff, 0xffffff];

    for (let i = 0; i < count; i++) {
      const startX = width / 2 + Phaser.Math.Between(-100 * sf, 100 * sf);
      const startY = height / 2 + Phaser.Math.Between(-50 * sf, 50 * sf);
      const color = colors[Phaser.Math.Between(0, colors.length - 1)];
      const w = Phaser.Math.Between(6, 12) * sf;
      const h = Phaser.Math.Between(4, 8) * sf;

      const piece = this.add.rectangle(startX, startY, w, h, color)
        .setAlpha(1)
        .setDepth(30);

      const targetX = startX + Phaser.Math.Between(-180 * sf, 180 * sf);
      const targetY = startY - Phaser.Math.Between(100 * sf, 260 * sf);
      const fallY = height + 30 * sf;

      this.tweens.add({
        targets: piece,
        x: targetX,
        y: targetY,
        angle: Phaser.Math.Between(-180, 180),
        duration: Phaser.Math.Between(400, 600),
        ease: 'Cubic.Out',
        onComplete: () => {
          this.tweens.add({
            targets: piece,
            y: fallY,
            x: targetX + Phaser.Math.Between(-40 * sf, 40 * sf),
            angle: Phaser.Math.Between(-360, 360),
            alpha: { from: 1, to: 0 },
            duration: Phaser.Math.Between(1200, 1800),
            ease: 'Sine.In',
            onComplete: () => piece.destroy(),
          });
        },
      });
    }
  }

  private togglePause() {
    this.paused = !this.paused;
    this.pauseOverlay.setVisible(this.paused);
    if (this.paused) {
      sounds.stopBGM();
      crazyGames.gameplayStop();
      this.pausedAt = Date.now();
      (this.pauseBtn.list[1] as Phaser.GameObjects.Text).setText('▶ Resume');
    } else {
      sounds.startBGM();
      crazyGames.gameplayStart();
      this.totalPauseMs += Date.now() - this.pausedAt;
      (this.pauseBtn.list[1] as Phaser.GameObjects.Text).setText('⏸ Pause');
    }
  }

  private showHowTo() {
    this.howToOverlay.setVisible(true);
    if (!this.paused) {
      this.paused = true;
      sounds.stopBGM();
      this.pausedAt = Date.now();
    }
  }

  private hideHowTo() {
    this.howToOverlay.setVisible(false);
    if (this.paused) {
      this.totalPauseMs += Date.now() - this.pausedAt;
      this.paused = false;
      sounds.startBGM();
    }
  }

  private onVisibilityChange = () => {
    if (document.hidden) {
      sounds.stopBGM();
      if (!this.paused) {
        this.togglePause();
      }
    } else {
      if (!this.paused && !sounds.isMuted()) {
        sounds.startBGM();
      }
    }
  };

  private setupVisibilityHandling() {
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    this.events.once('shutdown', () => {
      document.removeEventListener('visibilitychange', this.onVisibilityChange);
    });
  }

  private onResize() {
    this.scene.restart({
      level: this.level,
      board: this.board,
      scrambledBoard: this.scrambledBoard,
      moveHistory: this.moveHistory,
      moveCount: this.moveCount,
      startTime: this.startTime,
      totalPauseMs: this.totalPauseMs,
      timeLimit: this.timeLimit,
    });
  }

  update() {
    if (this.keyboardMode && !this.paused) {
      this.drawSelectionIndicator();
    }
  }
}
