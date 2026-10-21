import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene.ts';
import { GameScene } from './scenes/GameScene.ts';
import { MapScene } from './scenes/MapScene.ts';
import { COLORS } from './config.ts';
import { crazyGames } from './sdk/CrazyGamesSDK.ts';

// ─── Canvas sizing ────────────────────────────────────────────────────────────
// The canvas always matches the frame's aspect ratio (portrait on phones,
// landscape on desktop) at native device resolution, so nothing is letterboxed
// and text stays sharp. Scenes lay themselves out from the live size.
const DPR = Math.min(window.devicePixelRatio || 1, 2);

function frameSize(): { w: number; h: number } {
  const el = document.getElementById('game-container');
  const w = el?.clientWidth || window.innerWidth;
  const h = el?.clientHeight || window.innerHeight;
  return { w: Math.max(240, Math.round(w * DPR)), h: Math.max(240, Math.round(h * DPR)) };
}

const initial = frameSize();

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: initial.w,
  height: initial.h,
  backgroundColor: '#' + COLORS.bgDeep.toString(16).padStart(6, '0'),
  parent: 'game-container',
  scene: [BootScene, GameScene, MapScene],
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  input: {
    activePointers: 2,
    touch: { capture: true },
  },
  render: {
    antialias: true,
    roundPixels: false,
    powerPreference: 'high-performance',
  },
  fps: {
    target: 60,
    smoothStep: true,
  },
};

async function bootstrap() {
  document.addEventListener('contextmenu', e => e.preventDefault());
  document.addEventListener('touchmove', e => e.preventDefault(), { passive: false });

  // Fonts and the SDK load in parallel, each with a short cap so a slow network
  // never holds the game back.
  const cap = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
  const fonts = 'fonts' in document ? document.fonts.ready.then(() => undefined).catch(() => undefined) : Promise.resolve();
  await Promise.all([
    Promise.race([fonts, cap(700)]),
    Promise.race([crazyGames.init().catch(() => undefined), cap(1500)]),
  ]);

  crazyGames.loadingStart();
  const game = new Phaser.Game(config);
  if (import.meta.env.DEV) (window as unknown as { __game: Phaser.Game }).__game = game;

  let timer = 0;
  const resize = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      const { w, h } = frameSize();
      if (w !== game.scale.width || h !== game.scale.height) game.scale.setGameSize(w, h);
    }, 120);
  };
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', resize);

  // Platform hooks (Telegram, YouTube Playables)
  try {
    const w = window as unknown as {
      Telegram?: { WebApp?: { ready?: () => void; expand?: () => void; setHeaderColor?: (c: string) => void; setBackgroundColor?: (c: string) => void } };
      YT_PLAYABLES?: { firstFrameReady?: () => void; gameReady?: () => void };
    };
    const tg = w.Telegram?.WebApp;
    tg?.ready?.();
    tg?.expand?.();
    tg?.setHeaderColor?.('#0a0f2e');
    tg?.setBackgroundColor?.('#0a0f2e');
    w.YT_PLAYABLES?.firstFrameReady?.();
    w.YT_PLAYABLES?.gameReady?.();
  } catch (_) {}
}

bootstrap();
