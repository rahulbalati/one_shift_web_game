import Phaser from 'phaser';
import { COLORS, SCENE, BASE_WIDTH, BASE_HEIGHT } from '../config.ts';

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: SCENE.BOOT });
  }

  create() {
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
    const title = this.add.text(cx, cy - 20 * sf, 'ONE SHIFT', {
      fontSize: `${Math.round(42 * sf)}px`,
      fontFamily: font,
      fontStyle: 'bold',
      resolution: dpr,
      color: '#' + COLORS.accent.toString(16).padStart(6, '0'),
    }).setOrigin(0.5).setAlpha(0);

    const sub = this.add.text(cx, cy + 28 * sf, 'A Logic Puzzle', {
      fontSize: `${Math.round(15 * sf)}px`,
      fontFamily: font,
      resolution: dpr,
      color: '#' + COLORS.textMuted.toString(16).padStart(6, '0'),
    }).setOrigin(0.5).setAlpha(0);

    const loading = this.add.text(cx, cy + 80 * sf, 'Loading…', {
      fontSize: `${Math.round(13 * sf)}px`,
      fontFamily: font,
      resolution: dpr,
      color: '#' + COLORS.textMuted.toString(16).padStart(6, '0'),
    }).setOrigin(0.5);

    this.tweens.add({ targets: title, alpha: 1, y: cy - 25 * sf, duration: 600, ease: 'Sine.Out' });
    this.tweens.add({ targets: sub, alpha: 1, duration: 500, delay: 200 });

    this.time.delayedCall(800, () => {
      loading.setText('Tap to Play');
      loading.setStyle({ color: '#' + COLORS.accent.toString(16).padStart(6, '0') });
      this.tweens.add({ targets: loading, scaleX: 1.06, scaleY: 1.06, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.InOut' });

      const startGame = () => {
        this.input.off('pointerdown', startGame);
        if (this.input.keyboard) this.input.keyboard.off('keydown', startGame);
        this.cameras.main.fadeOut(300, 0, 0, 0);
        this.time.delayedCall(320, () => this.scene.start(SCENE.GAME, { level: 1 }));
      };

      this.input.once('pointerdown', startGame);
      if (this.input.keyboard) {
        this.input.keyboard.once('keydown', startGame);
      }
    });
  }
}
