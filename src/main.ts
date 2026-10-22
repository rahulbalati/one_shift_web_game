import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene.ts';
import { GameScene } from './scenes/GameScene.ts';
import { MapScene } from './scenes/MapScene.ts';
import { COLORS } from './config.ts';
import { platform } from './platform/index.ts';
import { progress } from './game/Progress.ts';
import { sounds } from './audio/SoundManager.ts';

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
  // Browser defaults that would move the host page around the game: context menu,
  // touch scroll, mouse-wheel scroll, and arrow keys / space scrolling.
  document.addEventListener('contextmenu', e => e.preventDefault());
  document.addEventListener('touchmove', e => e.preventDefault(), { passive: false });
  window.addEventListener('wheel', e => e.preventDefault(), { passive: false });
  window.addEventListener('keydown', e => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code) || e.key === ' ') e.preventDefault();
  });

  // Platform signals → audio. This is the only place game and platform meet: the
  // platform reports mute/ad changes, the game decides what that means for sound.
  platform.onMuteChange(muted => sounds.setPlatformMute(muted));
  platform.onAdChange(playing => (playing ? sounds.stopBGM() : sounds.startBGM()));

  // The platform must be fully initialised before any save data is read, so the game
  // is created only after init (it has its own timeout). Fonts load in parallel, capped.
  const cap = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
  const fonts = 'fonts' in document ? document.fonts.ready.then(() => undefined).catch(() => undefined) : Promise.resolve();
  await Promise.all([
    Promise.race([fonts, cap(700)]),
    platform.init(),
  ]);

  // Restore the player's own sound choices from the save
  sounds.setUserMuted(progress.soundMuted());
  sounds.onUserMuteChange = muted => progress.setSoundMuted(muted);
  sounds.setMusicMuted(progress.musicMuted());
  sounds.onMusicChange = muted => progress.setMusicMuted(muted);

  platform.loadingStart();
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
  // The frame can start hidden or zero-sized (e.g. an iframe shown after load) and gain
  // its real size without a window resize event, so watch the container itself too.
  const container = document.getElementById('game-container');
  if (container && 'ResizeObserver' in window) new ResizeObserver(resize).observe(container);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) resize(); });
  resize();
}

bootstrap();
