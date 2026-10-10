import Phaser from 'phaser';
import { COLORS, SCENE, BASE_WIDTH, BASE_HEIGHT } from '../config.ts';
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
    const sf = Math.min(width / BASE_WIDTH, height / BASE_HEIGHT, 1.4);

    // Gradient background
    const bg = this.add.graphics();
    bg.fillGradientStyle(COLORS.bgDeep, COLORS.bgDeep, COLORS.bgPanel, COLORS.bgPanel, 1);
    bg.fillRect(0, 0, width, height);

    // Logo
    const cx = width / 2;
    const cy = height / 2;

    // Decorative grid preview
    const gridSize = 80 * sf;
    const tileSize = 17 * sf;
    const tileGap = 2 * sf;
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        const x = cx - gridSize / 2 + c * (tileSize + tileGap) + tileSize / 2;
        const y = cy - 100 * sf + r * (tileSize + tileGap) + tileSize / 2;
        const val = r * 4 + c + 1;
        const isAcc = val === 1 || val === 16;
        this.add.rectangle(x, y, tileSize, tileSize, isAcc ? COLORS.accent : COLORS.tile)
          .setAlpha(0.9);
      }
    }

    const dpr = Math.max(window.devicePixelRatio || 1, 2);
    const font = "'Outfit', 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif";

    // Title
    this.add.text(cx, cy - 20 * sf, 'ONE SHIFT', {
      fontSize: `${Math.round(42 * sf)}px`,
      fontFamily: font,
      fontStyle: 'bold',
      resolution: dpr,
      color: '#' + COLORS.accent.toString(16).padStart(6, '0'),
    }).setOrigin(0.5);

    this.add.text(cx, cy + 28 * sf, 'A Logic Puzzle', {
      fontSize: `${Math.round(15 * sf)}px`,
      fontFamily: font,
      resolution: dpr,
      color: '#' + COLORS.textMuted.toString(16).padStart(6, '0'),
    }).setOrigin(0.5);

    // Progressive auto-save: load highest level reached
    const savedLevel = parseInt(crazyGames.getItem('oneshift_current_level') || '1', 10);
    const startLevel = isNaN(savedLevel) || savedLevel < 1 ? 1 : savedLevel;
    const btnLabel = startLevel > 1 ? `▶ Resume Level ${startLevel}` : '▶ Tap to Play';

    // 1-Click to Play prompt (active immediately from frame 0)
    const playBtn = this.add.text(cx, cy + 85 * sf, btnLabel, {
      fontSize: `${Math.round(18 * sf)}px`,
      fontFamily: font,
      fontStyle: 'bold',
      resolution: dpr,
      color: '#' + COLORS.accent.toString(16).padStart(6, '0'),
    }).setOrigin(0.5);

    this.tweens.add({
      targets: playBtn,
      scaleX: 1.08,
      scaleY: 1.08,
      duration: 650,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.InOut',
    });

    let started = false;
    const startGame = () => {
      if (started) return;
      started = true;
      sounds.resume();
      this.input.off('pointerdown', startGame);
      if (this.input.keyboard) this.input.keyboard.off('keydown', startGame);
      this.scene.start(SCENE.GAME, { level: startLevel });
    };

    // Instant 1-click trigger
    this.input.once('pointerdown', startGame);
    if (this.input.keyboard) {
      this.input.keyboard.once('keydown', startGame);
    }
  }
}
