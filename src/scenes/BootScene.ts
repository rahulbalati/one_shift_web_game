import Phaser from 'phaser';
import { COLORS, SCENE } from '../config.ts';
import { crazyGames } from '../sdk/CrazyGamesSDK.ts';
import { sounds } from '../audio/SoundManager.ts';

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: SCENE.BOOT });
  }

  create() {
    // Notify CrazyGames SDK that initial loading has completed
    crazyGames.loadingStop();

    const { width, height } = this.scale;
    const isLandscape = width > height;
    const sf = Math.min(width / (isLandscape ? 560 : 380), height / 620, 1.8);

    // Deep gradient background
    const bg = this.add.graphics();
    bg.fillGradientStyle(COLORS.bgDeep, COLORS.bgDeep, COLORS.bgPanel, COLORS.bgPanel, 1);
    bg.fillRect(0, 0, width, height);

    const cx = width / 2;
    const cy = height / 2;
    const dpr = Math.max(window.devicePixelRatio || 1, 2);
    const font = "'Outfit', 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif";

    // ─── Ambient Floating Tiles (Commercial Polish) ──────────────────────────
    const floatTileValues = [1, 4, 7, 10, 13, 16, 2, 9];
    for (let i = 0; i < floatTileValues.length; i++) {
      const tx = Phaser.Math.Between(40, width - 40);
      const ty = Phaser.Math.Between(40, height - 40);
      const tSize = Phaser.Math.Between(28, 44) * sf;
      const tVal = floatTileValues[i];

      const tBg = this.add.rectangle(0, 0, tSize, tSize, COLORS.tile, 0.22)
        .setStrokeStyle(1.2, COLORS.panelBorder, 0.35);
      const tTxt = this.add.text(0, 0, String(tVal), {
        fontSize: `${Math.round(tSize * 0.46)}px`,
        fontFamily: font,
        fontStyle: 'bold',
        color: '#88a0d0',
      }).setOrigin(0.5).setAlpha(0.28);

      const floatCont = this.add.container(tx, ty, [tBg, tTxt]);
      floatCont.setAlpha(0.65);

      this.tweens.add({
        targets: floatCont,
        y: ty + Phaser.Math.Between(-25, 25),
        x: tx + Phaser.Math.Between(-15, 15),
        angle: Phaser.Math.Between(-12, 12),
        duration: Phaser.Math.Between(3000, 5000),
        yoyo: true,
        repeat: -1,
        ease: 'Sine.InOut',
      });
    }

    // ─── Decorative 4x4 Mini Grid Preview ─────────────────────────────────────
    const gridSize = 90 * sf;
    const tileSize = 19 * sf;
    const tileGap = 3 * sf;
    const gridYOffset = cy - 110 * sf;

    // Glowing border behind mini-grid
    this.add.rectangle(cx, gridYOffset + gridSize / 2 - tileSize / 2, gridSize + 12 * sf, gridSize + 12 * sf, COLORS.panelBg, 0.85)
      .setStrokeStyle(1.5, COLORS.accent, 0.4);

    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        const x = cx - gridSize / 2 + c * (tileSize + tileGap) + tileSize / 2;
        const y = gridYOffset + r * (tileSize + tileGap);
        const val = r * 4 + c + 1;
        const isCorner = val === 1 || val === 4 || val === 13 || val === 16;
        const tileColor = isCorner ? COLORS.accent : COLORS.tile;

        const miniTile = this.add.rectangle(x, y, tileSize, tileSize, tileColor)
          .setAlpha(0.85);

        // Subtle stagger pulse
        this.tweens.add({
          targets: miniTile,
          scaleX: 1.06,
          scaleY: 1.06,
          duration: 1200,
          delay: (r + c) * 120,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.InOut',
        });
      }
    }

    // ─── Stylized Title Badge ────────────────────────────────────────────────
    const titlePillW = Math.min(320 * sf, width - 40);
    const titleBg = this.add.rectangle(cx, cy - 10 * sf, titlePillW, 56 * sf, COLORS.panelBg, 0.9)
      .setStrokeStyle(2, COLORS.accent, 0.9);

    const titleTxt = this.add.text(cx, cy - 10 * sf, 'ONE SHIFT', {
      fontSize: `${Math.round(36 * sf)}px`,
      fontFamily: font,
      fontStyle: 'bold',
      resolution: dpr,
      color: '#' + COLORS.accent.toString(16).padStart(6, '0'),
    }).setOrigin(0.5);

    // Subtle glow on title text
    this.tweens.add({
      targets: [titleBg, titleTxt],
      scaleX: 1.02,
      scaleY: 1.02,
      duration: 1500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.InOut',
    });

    this.add.text(cx, cy + 32 * sf, '★ A Minimalist Logic Puzzle ★', {
      fontSize: `${Math.round(14 * sf)}px`,
      fontFamily: font,
      fontStyle: 'bold',
      resolution: dpr,
      color: '#f5a623',
    }).setOrigin(0.5);

    // ─── Objective Explanation Card ──────────────────────────────────────────
    const cardW = Math.min(310 * sf, width - 36);
    this.add.rectangle(cx, cy + 74 * sf, cardW, 46 * sf, 0x09102b, 0.8)
      .setStrokeStyle(1, COLORS.panelBorder);

    this.add.text(cx, cy + 74 * sf, 'Goal: Arrange tiles 1 to 16 in order\nSlide entire rows & columns to solve', {
      fontSize: `${Math.round(12 * sf)}px`,
      fontFamily: font,
      resolution: dpr,
      align: 'center',
      color: '#' + COLORS.text.toString(16).padStart(6, '0'),
    }).setOrigin(0.5);

    // ─── Progressive Save Detection ──────────────────────────────────────────
    const savedLevel = parseInt(crazyGames.getItem('oneshift_current_level') || '1', 10);
    const startLevel = isNaN(savedLevel) || savedLevel < 1 ? 1 : savedLevel;
    const btnLabel = startLevel > 1 ? `▶ RESUME LEVEL ${startLevel}` : '▶ TAP TO PLAY';

    // ─── High-Juice Action Play Button ───────────────────────────────────────
    const btnW = Math.min(230 * sf, width - 60);
    const btnH = 50 * sf;
    const btnY = cy + 135 * sf;

    const playBtnBg = this.add.rectangle(0, 0, btnW, btnH, COLORS.accent)
      .setOrigin(0.5);
    const playBtnTxt = this.add.text(0, 0, btnLabel, {
      fontSize: `${Math.round(16 * sf)}px`,
      fontFamily: font,
      fontStyle: 'bold',
      resolution: dpr,
      color: '#' + COLORS.bgDeep.toString(16).padStart(6, '0'),
    }).setOrigin(0.5);

    const playBtnContainer = this.add.container(cx, btnY, [playBtnBg, playBtnTxt]);
    playBtnContainer.setSize(btnW, btnH);
    playBtnContainer.setInteractive({ useHandCursor: true });

    // Button pulse animation
    this.tweens.add({
      targets: playBtnContainer,
      scaleX: 1.06,
      scaleY: 1.06,
      duration: 750,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.InOut',
    });

    // Desktop hover state
    playBtnContainer.on('pointerover', () => {
      playBtnBg.setFillStyle(COLORS.accentHover);
      this.tweens.add({ targets: playBtnContainer, scaleX: 1.1, scaleY: 1.1, duration: 80 });
    });
    playBtnContainer.on('pointerout', () => {
      playBtnBg.setFillStyle(COLORS.accent);
      this.tweens.add({ targets: playBtnContainer, scaleX: 1.0, scaleY: 1.0, duration: 80 });
    });

    let started = false;
    const startGame = () => {
      if (started) return;
      started = true;
      sounds.resume();
      sounds.playClick();
      playBtnContainer.off('pointerdown', startGame);
      this.input.off('pointerdown', startGame);
      if (this.input.keyboard) this.input.keyboard.off('keydown', startGame);
      this.scene.start(SCENE.GAME, { level: startLevel });
    };

    playBtnContainer.on('pointerdown', startGame);
    this.input.once('pointerdown', startGame);
    if (this.input.keyboard) {
      this.input.keyboard.once('keydown', startGame);
    }

    // Resize listener
    const onResize = () => {
      if (!started) this.scene.restart();
    };
    this.scale.on('resize', onResize);
    this.events.once('shutdown', () => {
      this.scale.off('resize', onResize);
    });
  }
}
