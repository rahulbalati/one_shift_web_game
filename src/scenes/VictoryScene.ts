import Phaser from 'phaser';
import {
  BASE_WIDTH, BASE_HEIGHT,
  COLORS, SCENE,
  VICTORY_ANIM_DURATION,
} from '../config.ts';
import type { VictoryData } from '../types.ts';

export class VictoryScene extends Phaser.Scene {
  private victoryData!: VictoryData;
  private scaleFactor = 1;

  constructor() {
    super({ key: SCENE.VICTORY });
  }

  init(data: VictoryData) {
    this.victoryData = data;
  }

  create() {
    const { width, height } = this.scale;
    const sf = Math.min(width / BASE_WIDTH, height / BASE_HEIGHT, 1.4);
    this.scaleFactor = sf;

    // Dim overlay
    const overlay = this.add.rectangle(0, 0, width, height, 0x000000, 0).setOrigin(0);
    this.tweens.add({ targets: overlay, fillAlpha: 0.75, duration: 400 });

    // Panel
    const panW = Math.min(340 * sf, width - 40 * sf);
    const panH = 360 * sf;
    const panX = width / 2;
    const panY = height / 2;

    const panel = this.add.rectangle(panX, panY, panW, panH, COLORS.panelBg)
      .setStrokeStyle(2.5, COLORS.accent)
      .setScale(0.6)
      .setAlpha(0);

    this.tweens.add({
      targets: panel,
      scaleX: 1, scaleY: 1, alpha: 1,
      duration: VICTORY_ANIM_DURATION,
      ease: 'Back.Out',
    });

    // Stars / celebration text
    const stars = this.add.text(panX, panY - 140 * sf, '🎉', {
      fontSize: `${Math.round(52 * sf)}px`,
    }).setOrigin(0.5).setAlpha(0);
    this.tweens.add({ targets: stars, alpha: 1, duration: 400, delay: 300 });

    // Bounce the stars
    this.tweens.add({
      targets: stars,
      y: panY - 150 * sf,
      duration: 700,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.InOut',
      delay: 500,
    });

    const dpr = Math.max(window.devicePixelRatio || 1, 2);
    const font = "'Outfit', 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif";

    const addText = (text: string, dy: number, size: number, color: number, delay = 300, style = '') => {
      const t = this.add.text(panX, panY + dy * sf, text, {
        fontSize: `${Math.round(size * sf)}px`,
        fontFamily: font,
        fontStyle: style,
        resolution: dpr,
        color: '#' + color.toString(16).padStart(6, '0'),
        align: 'center',
      }).setOrigin(0.5).setAlpha(0);
      this.tweens.add({ targets: t, alpha: 1, duration: 300, delay });
      return t;
    };

    addText('PUZZLE SOLVED!', -120, 26, COLORS.accent, 350, 'bold');
    addText(`Level ${this.victoryData.level}`, -82, 15, COLORS.textMuted, 400);

    // Divider
    const div = this.add.graphics().setAlpha(0);
    div.lineStyle(1, COLORS.panelBorder);
    div.lineBetween(panX - panW / 2 + 20 * sf, panY - 60 * sf, panX + panW / 2 - 20 * sf, panY - 60 * sf);
    this.tweens.add({ targets: div, alpha: 1, duration: 300, delay: 450 });

    addText('Moves', -38, 11, COLORS.textMuted, 500);
    addText(String(this.victoryData.moves), -20, 28, COLORS.text, 550, 'bold');

    addText('Time', 20, 11, COLORS.textMuted, 500);
    const s = this.victoryData.elapsedSeconds;
    addText(`${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`, 38, 28, COLORS.text, 550, 'bold');

    if (this.victoryData.bestMoves != null && this.victoryData.moves <= this.victoryData.bestMoves) {
      addText('🏆 New Best!', 78, 15, COLORS.warning, 600, 'bold');
    } else if (this.victoryData.bestMoves != null) {
      addText(`Best: ${this.victoryData.bestMoves}`, 78, 12, COLORS.textMuted, 600);
    }

    // Next Level button
    const btnW = 160 * sf;
    const btnH = 48 * sf;
    const btnY = panY + 130 * sf;

    const btnBg = this.add.rectangle(panX, btnY, btnW, btnH, COLORS.accent)
      .setStrokeStyle(0)
      .setAlpha(0) as Phaser.GameObjects.Rectangle;
    const btnTxt = this.add.text(panX, btnY, '→ Next Level', {
      fontSize: `${Math.round(16 * sf)}px`,
      fontFamily: font,
      fontStyle: 'bold',
      resolution: dpr,
      color: '#' + COLORS.bgDeep.toString(16).padStart(6, '0'),
    }).setOrigin(0.5).setAlpha(0);

    this.tweens.add({ targets: [btnBg, btnTxt], alpha: 1, duration: 300, delay: 700 });

    // Subtle pulse on Next button
    this.tweens.add({
      targets: [btnBg, btnTxt],
      scaleX: 1.04, scaleY: 1.04,
      duration: 800,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.InOut',
      delay: 900,
    });

    const nextBtn = this.add.container(0, 0, [btnBg, btnTxt]);
    nextBtn.setSize(btnW, btnH);
    nextBtn.setInteractive({ useHandCursor: true });
    nextBtn.on('pointerover', () => {
      btnBg.setFillStyle(COLORS.accentHover);
      this.tweens.add({ targets: nextBtn, scaleX: 1.06, scaleY: 1.06, duration: 80 });
    });
    nextBtn.on('pointerout', () => {
      btnBg.setFillStyle(COLORS.accent);
      this.tweens.add({ targets: nextBtn, scaleX: 1, scaleY: 1, duration: 80 });
    });
    nextBtn.on('pointerup', () => this.nextLevel());

    // Also allow keyboard Enter/Space
    if (this.input.keyboard) {
      this.input.keyboard.once('keydown-ENTER', () => this.nextLevel());
      this.input.keyboard.once('keydown-SPACE', () => this.nextLevel());
    }

    // Particle sparkles
    this.createSparkles(width, height);
  }

  private createSparkles(width: number, height: number) {
    const sf = this.scaleFactor;
    const colors = [COLORS.accent, COLORS.accentHover, 0xffffff, COLORS.warning];
    for (let i = 0; i < 22; i++) {
      const x = Phaser.Math.Between(30, width - 30);
      const y = Phaser.Math.Between(30, height - 30);
      const color = colors[Phaser.Math.Between(0, colors.length - 1)];
      const size = Phaser.Math.FloatBetween(3, 7) * sf;

      const spark = this.add.rectangle(x, y, size, size, color).setAlpha(0);
      const delay = Phaser.Math.Between(0, 1000);

      this.tweens.add({
        targets: spark,
        alpha: { from: 0, to: 0.9 },
        scaleX: { from: 0, to: 1 },
        scaleY: { from: 0, to: 1 },
        y: y - Phaser.Math.Between(30, 80),
        duration: Phaser.Math.Between(600, 1200),
        delay,
        yoyo: false,
        ease: 'Sine.Out',
        onComplete: () => {
          this.tweens.add({ targets: spark, alpha: 0, duration: 400, onComplete: () => spark.destroy() });
        },
      });
    }
  }

  private nextLevel() {
    this.scene.stop(SCENE.VICTORY);
    this.scene.resume(SCENE.GAME);
    this.scene.stop(SCENE.GAME);
    this.scene.start(SCENE.GAME, { level: this.victoryData.level + 1 });
  }
}
