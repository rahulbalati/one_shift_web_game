// ─── Plain web (default) ──────────────────────────────────────────────────────
// No platform SDK: saves in the browser, no ads, no platform mute. This is the
// safe fallback for any host, including your own server.
import type { BreakContext, BreakKind, Platform } from './Platform.ts';
import { DEFAULT_CAPS } from './Platform.ts';
import { browserIsTouch, localStore, safe } from './common.ts';

export function createWebPlatform(): Platform {
  return {
    name: 'web',
    caps: { ...DEFAULT_CAPS },

    async init() {
      embedHooks();
    },

    loadingStart() {},
    loadingStop() {},
    gameplayStart() {},
    gameplayStop() {},
    celebrate() {},
    reportCompletion() {},
    setLevelContext() {},

    isTouchDevice: browserIsTouch,

    getItem: localStore.get,
    setItem: localStore.set,

    breakPoint(_kind: BreakKind, _ctx: BreakContext, done: () => void) {
      done();
    },

    onMuteChange() {},
    onAdChange() {},
  };
}

/** Light-touch hooks for web containers that expose a global API (Telegram, YouTube Playables). */
function embedHooks() {
  safe(() => {
    const w = window as unknown as {
      Telegram?: { WebApp?: { ready?: () => void; expand?: () => void; setHeaderColor?: (c: string) => void; setBackgroundColor?: (c: string) => void } };
      YT_PLAYABLES?: { firstFrameReady?: () => void; gameReady?: () => void };
    };
    const tg = w.Telegram?.WebApp;
    tg?.ready?.();
    tg?.expand?.();
    tg?.setHeaderColor?.('#24164f');
    tg?.setBackgroundColor?.('#24164f');
    w.YT_PLAYABLES?.firstFrameReady?.();
    w.YT_PLAYABLES?.gameReady?.();
  });
}
