import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene.ts';
import { GameScene } from './scenes/GameScene.ts';
import { VictoryScene } from './scenes/VictoryScene.ts';
import { COLORS, BASE_WIDTH, BASE_HEIGHT } from './config.ts';
import { crazyGames } from './sdk/CrazyGamesSDK.ts';

// ─── Phaser Game config (Virtual Resolution with Scale.FIT) ───────────────────
const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: BASE_WIDTH,
  height: BASE_HEIGHT,
  backgroundColor: '#' + COLORS.bgDeep.toString(16).padStart(6, '0'),
  parent: 'game-container',
  scene: [BootScene, GameScene, VictoryScene],
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  // roundPixels MUST be false — true causes tiles to snap to integers mid-tween
  // producing the "shattered / jittery" movement on mobile.
  roundPixels: false,
  input: {
    activePointers: 3,
  },
  render: {
    antialias: true,
    pixelArt: false,
    roundPixels: false,
  },
};

// ─── Bootstrap ────────────────────────────────────────────────────────────────
let game: Phaser.Game | null = null;

async function bootstrap() {
  // Prevent context menu and touch bounce on mobile
  if (typeof document !== 'undefined') {
    document.addEventListener('contextmenu', e => e.preventDefault());
    document.addEventListener('touchmove', e => {
      const scale = (e as unknown as { scale?: number }).scale;
      if (scale !== undefined && scale !== 1) e.preventDefault();
    }, { passive: false });
  }

  // CrazyGames SDK v3: Initialize first with safety timeout
  try {
    const timeout = new Promise<void>(resolve => setTimeout(resolve, 1500));
    await Promise.race([crazyGames.init(), timeout]);
  } catch (_) {}

  // Signal SDK that loading has started
  crazyGames.loadingStart();

  // Create Phaser Game instance (BootScene will call loadingStop once created)
  game = new Phaser.Game(config);

  // Platform Hooks (Telegram, YouTube Playables)
  try {
    const tg = (window as unknown as { Telegram?: { WebApp?: { ready: () => void; expand: () => void; setHeaderColor: (c: string) => void; setBackgroundColor: (c: string) => void } } }).Telegram?.WebApp;
    if (tg) {
      tg.ready?.();
      tg.expand?.();
      tg.setHeaderColor?.('#0a0f2e');
      tg.setBackgroundColor?.('#0a0f2e');
    }

    const yt = (window as unknown as { YT_PLAYABLES?: { firstFrameReady?: () => void; gameReady?: () => void } }).YT_PLAYABLES;
    if (yt?.firstFrameReady) yt.firstFrameReady();
    if (yt?.gameReady) yt.gameReady();
  } catch (_) {}
}

bootstrap();

export default game;
