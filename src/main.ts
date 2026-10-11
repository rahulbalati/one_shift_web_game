import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene.ts';
import { GameScene } from './scenes/GameScene.ts';
import { VictoryScene } from './scenes/VictoryScene.ts';
import { COLORS } from './config.ts';
import { crazyGames } from './sdk/CrazyGamesSDK.ts';

// ─── Responsive canvas sizing ─────────────────────────────────────────────────
function getGameSize(): { width: number; height: number } {
  const w = typeof window !== 'undefined' && window.innerWidth > 0 ? window.innerWidth : 390;
  const h = typeof window !== 'undefined' && window.innerHeight > 0 ? window.innerHeight : 780;
  return { width: w, height: h };
}

const { width, height } = getGameSize();

// ─── Phaser Game config ───────────────────────────────────────────────────────
const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width,
  height,
  backgroundColor: '#' + COLORS.bgDeep.toString(16).padStart(6, '0'),
  parent: 'game-container',
  scene: [BootScene, GameScene, VictoryScene],
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  roundPixels: true,
  input: {
    activePointers: 3,
  },
  render: {
    antialias: true,
    pixelArt: false,
    roundPixels: true,
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
