import Phaser from 'phaser';
import {
  BASE_WIDTH, BASE_HEIGHT,
  GRID_SIZE, TILE_SIZE, TILE_GAP, GRID_TOTAL, GRID_Y,
  ARROW_SIZE, ARROW_MARGIN,
  COLORS, SCENE,
  SHIFT_ANIM_DURATION,
} from '../config.ts';
import { cloneBoard, applyMove, isSolved } from '../game/Board.ts';
import { scramble } from '../game/Scrambler.ts';
import type { Board, MoveRecord, ShiftDirection, VictoryData } from '../types.ts';
import { reverseMove } from '../types.ts';

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
  private undoBtn!: Phaser.GameObjects.Container;
  private restartBtn!: Phaser.GameObjects.Container;
  private newGameBtn!: Phaser.GameObjects.Container;
  private pauseBtn!: Phaser.GameObjects.Container;
  private howToBtn!: Phaser.GameObjects.Container;
  private pauseOverlay!: Phaser.GameObjects.Container;
  private howToOverlay!: Phaser.GameObjects.Container;
  private timerEvent!: Phaser.Time.TimerEvent;

  // Keyboard
  private selectedRow = 0;
  private selectedCol = 0;
  private keyboardMode = false;
  private selectionIndicator!: Phaser.GameObjects.Graphics;

  // Scale tracking
  private scaleFactor = 1;

  constructor() {
    super({ key: SCENE.GAME });
  }

  // ─── Lifecycle ──────────────────────────────────────────────────────────────
  init(data: { level?: number } = {}) {
    this.level = data.level ?? 1;
    this.moveCount = 0;
    this.moveHistory = [];
    this.paused = false;
    this.totalPauseMs = 0;
    this.animating = false;
    this.keyboardMode = false;
    this.selectedRow = 0;
    this.selectedCol = 0;
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
    this.createSelectionIndicator();
    this.setupKeyboard();
    this.setupVisibilityHandling();
    this.startTimer();

    // Handle resize
    this.scale.on('resize', this.onResize, this);
  }

  private computeScale() {
    const { width, height } = this.scale;
    // Fit into available space maintaining aspect ratio
    const sx = width / BASE_WIDTH;
    const sy = height / BASE_HEIGHT;
    this.scaleFactor = Math.min(sx, sy, 1.4); // allow slight upscale on desktop
  }

  private generatePuzzle() {
    const result = scramble(this.level);
    this.board = cloneBoard(result.board);
    this.scrambledBoard = cloneBoard(result.board);
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
    container.setSize(size, size);
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
    this.createText(cx, 18 * sf, 'ONE SHIFT', {
      fontSize: `${Math.round(28 * sf)}px`,
      fontStyle: 'bold',
      color: '#' + COLORS.accent.toString(16).padStart(6, '0'),
    }).setOrigin(0.5, 0);

    // Level display (not stored; pure display)
    this.createText(cx, 54 * sf, `Level ${this.level}`, {
      fontSize: `${Math.round(14 * sf)}px`,
      color: '#' + COLORS.textMuted.toString(16).padStart(6, '0'),
    }).setOrigin(0.5, 0);

    // Stats row
    const statY = 76 * sf;
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

    // Best
    this.createText(cx + statSpan, statY, 'BEST', {
      fontSize: `${Math.round(10 * sf)}px`,
      color: '#' + COLORS.textMuted.toString(16).padStart(6, '0'),
    }).setOrigin(0.5, 0);
    this.createText(cx + statSpan, statY + 14 * sf, bestMoves[this.level] != null ? String(bestMoves[this.level]) : '—', {
      fontSize: `${Math.round(22 * sf)}px`,
      fontStyle: 'bold',
      color: '#' + COLORS.textAccent.toString(16).padStart(6, '0'),
    }).setOrigin(0.5, 0);
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
    c.on('pointerdown', () => this.tweens.add({ targets: c, scaleX: 0.94, scaleY: 0.94, duration: 60 }));
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

  // ─── Timer ──────────────────────────────────────────────────────────────────
  private startTimer() {
    this.startTime = Date.now();
    this.timerEvent = this.time.addEvent({
      delay: 500,
      callback: this.updateTimer,
      callbackScope: this,
      loop: true,
    });
  }

  private updateTimer() {
    if (this.paused) return;
    const elapsed = Math.floor((Date.now() - this.startTime - this.totalPauseMs) / 1000);
    const m = Math.floor(elapsed / 60);
    const s = elapsed % 60;
    this.timerText.setText(`${m}:${String(s).padStart(2, '0')}`);
  }

  private getElapsedSeconds(): number {
    return Math.floor((Date.now() - this.startTime - this.totalPauseMs) / 1000);
  }

  // ─── Shift logic ────────────────────────────────────────────────────────────
  doShift(type: 'row' | 'col', index: number, direction: ShiftDirection) {
    if (this.animating || this.paused) return;
    if (this.pauseOverlay.visible || this.howToOverlay.visible) return;

    const move: MoveRecord = { type, index, direction };
    const newBoard = applyMove(this.board, move);

    this.animating = true;
    this.animateShift(type, index, direction, newBoard, () => {
      this.board = newBoard;
      this.moveHistory.push(move);
      this.moveCount++;
      this.movesText.setText(String(this.moveCount));
      this.snapTilesToBoard();
      this.refreshTileColors();
      this.animating = false;

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
        sprite.bg.setFillStyle(inPlace ? COLORS.tileSolved : COLORS.tile);
        sprite.label.setStyle({
          color: inPlace
            ? '#' + COLORS.tileSolvedTxt.toString(16).padStart(6, '0')
            : '#' + COLORS.tileText.toString(16).padStart(6, '0'),
          resolution: dpr,
        });
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
      this.snapTilesToBoard();
      this.refreshTileColors();
      this.animating = false;
    });
  }

  private doRestart() {
    if (this.animating) return;
    this.board = cloneBoard(this.scrambledBoard);
    this.moveCount = 0;
    this.moveHistory = [];
    this.startTime = Date.now();
    this.totalPauseMs = 0;
    this.movesText.setText('0');
    this.timerText.setText('0:00');
    this.snapTilesToBoard();
    this.refreshTileColors();
  }

  private doNewGame() {
    if (this.animating) return;
    this.scene.restart({ level: this.level });
  }

  private onVictory() {
    this.timerEvent.remove();
    const elapsed = this.getElapsedSeconds();

    // Update best moves
    if (bestMoves[this.level] == null || this.moveCount < bestMoves[this.level]) {
      bestMoves[this.level] = this.moveCount;
    }

    // Flash all tiles
    for (const sprite of this.tileSprites) {
      this.tweens.add({
        targets: sprite.container,
        scaleX: 1.15, scaleY: 1.15,
        duration: 200,
        yoyo: true,
        ease: 'Sine.InOut',
      });
    }

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

  private togglePause() {
    this.paused = !this.paused;
    this.pauseOverlay.setVisible(this.paused);
    if (this.paused) {
      this.pausedAt = Date.now();
      (this.pauseBtn.list[1] as Phaser.GameObjects.Text).setText('▶ Resume');
    } else {
      this.totalPauseMs += Date.now() - this.pausedAt;
      (this.pauseBtn.list[1] as Phaser.GameObjects.Text).setText('⏸ Pause');
    }
  }

  private showHowTo() {
    this.howToOverlay.setVisible(true);
    if (!this.paused) {
      this.paused = true;
      this.pausedAt = Date.now();
    }
  }

  private hideHowTo() {
    this.howToOverlay.setVisible(false);
    if (this.paused) {
      this.totalPauseMs += Date.now() - this.pausedAt;
      this.paused = false;
    }
  }

  private setupVisibilityHandling() {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && !this.paused) {
        this.togglePause();
      }
    });
  }

  private onResize() {
    this.scene.restart({ level: this.level });
  }

  update() {
    if (this.keyboardMode && !this.paused) {
      this.drawSelectionIndicator();
    }
  }
}
