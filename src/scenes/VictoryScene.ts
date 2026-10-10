import Phaser from 'phaser';
import {
  BASE_WIDTH, BASE_HEIGHT,
  COLORS, SCENE,
  VICTORY_ANIM_DURATION,
} from '../config.ts';
import type { VictoryData } from '../types.ts';
import { sounds } from '../audio/SoundManager.ts';
import { crazyGames } from '../sdk/CrazyGamesSDK.ts';

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

    // Calculate 3-Star Rating
    let targetMoves = 1;
    if (this.victoryData.level === 1) targetMoves = 1;
    else if (this.victoryData.level === 2) targetMoves = 2;
    else if (this.victoryData.level === 3) targetMoves = 3;
    else if (this.victoryData.level === 4) targetMoves = 5;
    else if (this.victoryData.level === 5) targetMoves = 8;
    else targetMoves = Math.min(10 + (this.victoryData.level - 6) * 3, 40);

    let earnedStars = 1;
    if (this.victoryData.moves <= targetMoves) {
      earnedStars = 3;
    } else if (this.victoryData.moves <= Math.ceil(targetMoves * 1.5)) {
      earnedStars = 2;
    }

    const prevStars = parseInt(localStorage.getItem(`oneshift_stars_${this.victoryData.level}`) || '0', 10);
    if (earnedStars > prevStars) {
      localStorage.setItem(`oneshift_stars_${this.victoryData.level}`, String(earnedStars));
    }

    // Render 3 Interactive Animated Stars
    const starGap = 42 * sf;
    const starY = panY - 145 * sf;
    for (let i = 0; i < 3; i++) {
      const sx = panX + (i - 1) * starGap;
      const isEarned = i < earnedStars;
      const starChar = isEarned ? '★' : '☆';
      const starColor = isEarned ? '#f5a623' : '#334466';

      const star = this.add.text(sx, starY, starChar, {
        fontSize: `${Math.round(44 * sf)}px`,
        fontFamily: "'Outfit', 'Plus Jakarta Sans', system-ui, sans-serif",
        fontStyle: 'bold',
        color: starColor,
      }).setOrigin(0.5).setScale(0).setAlpha(0);

      this.tweens.add({
        targets: star,
        scaleX: 1,
        scaleY: 1,
        alpha: 1,
        duration: 400,
        delay: 350 + i * 150,
        ease: 'Back.Out',
      });
    }

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

    addText('PUZZLE SOLVED!', -110, 24, COLORS.accent, 350, 'bold');
    addText(`Level ${this.victoryData.level}`, -76, 14, COLORS.textMuted, 400);

    // Divider
    const div = this.add.graphics().setAlpha(0);
    div.lineStyle(1, COLORS.panelBorder);
    div.lineBetween(panX - panW / 2 + 20 * sf, panY - 55 * sf, panX + panW / 2 - 20 * sf, panY - 55 * sf);
    this.tweens.add({ targets: div, alpha: 1, duration: 300, delay: 450 });

    addText('Moves', -34, 11, COLORS.textMuted, 500);
    addText(String(this.victoryData.moves), -16, 26, COLORS.text, 550, 'bold');

    addText('Time', 22, 11, COLORS.textMuted, 500);
    const s = this.victoryData.elapsedSeconds;
    addText(`${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`, 40, 26, COLORS.text, 550, 'bold');

    if (this.victoryData.bestMoves != null && this.victoryData.moves <= this.victoryData.bestMoves) {
      addText('🏆 New Best Record!', 78, 14, COLORS.warning, 600, 'bold');
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
    nextBtn.on('pointerup', () => {
      sounds.playClick();
      crazyGames.gameplayStart();
      this.nextLevel();
    });

    // Also allow keyboard Enter/Space
    if (this.input.keyboard) {
      this.input.keyboard.once('keydown-ENTER', () => this.nextLevel());
      this.input.keyboard.once('keydown-SPACE', () => this.nextLevel());
    }

    // Dynamic Confetti Explosion
    this.createConfetti(width, height);
  }

  private createConfetti(width: number, height: number) {
    const sf = this.scaleFactor;
    const colors = [0x00d4aa, 0x00ffcc, 0xf5a623, 0xff3366, 0x3399ff, 0xffffff];
    const count = 48;

    for (let i = 0; i < count; i++) {
      const startX = width / 2 + Phaser.Math.Between(-120 * sf, 120 * sf);
      const startY = height / 2 + Phaser.Math.Between(-40 * sf, 120 * sf);
      const color = colors[Phaser.Math.Between(0, colors.length - 1)];
      const w = Phaser.Math.Between(6, 12) * sf;
      const h = Phaser.Math.Between(4, 9) * sf;

      const piece = this.add.rectangle(startX, startY, w, h, color)
        .setAlpha(0)
        .setDepth(15);

      const targetX = startX + Phaser.Math.Between(-200 * sf, 200 * sf);
      const targetY = startY - Phaser.Math.Between(150 * sf, 350 * sf);
      const fallY = height + 40 * sf;
      const delay = Phaser.Math.Between(50, 400);

      // Shoot up, then flutter down
      this.tweens.add({
        targets: piece,
        alpha: { from: 0, to: 1 },
        x: targetX,
        y: targetY,
        angle: Phaser.Math.Between(-180, 180),
        duration: Phaser.Math.Between(500, 750),
        delay,
        ease: 'Cubic.Out',
        onComplete: () => {
          this.tweens.add({
            targets: piece,
            y: fallY,
            x: targetX + Phaser.Math.Between(-60 * sf, 60 * sf),
            angle: Phaser.Math.Between(-360, 360),
            duration: Phaser.Math.Between(1400, 2200),
            ease: 'Sine.In',
            onComplete: () => piece.destroy(),
          });
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
