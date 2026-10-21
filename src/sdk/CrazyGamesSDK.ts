// ─── CrazyGames SDK v3 Integration ───────────────────────────────────────────
// Lifecycle (in this order, each at most once where it applies):
//   1. init()           – awaited in main.ts BEFORE the game is created
//   2. loadingStart()   – right after init, before Phaser boots
//   3. loadingStop()    – BootScene, when the first scene is ready
//   4. gameplayStart() / gameplayStop() – only on real state changes
// The SDK is only ever called when init succeeded AND the environment is
// 'crazygames' or 'local'. In the 'disabled' environment every SDK call throws,
// so nothing is called there and the game runs on plain localStorage instead.
import { sounds } from '../audio/SoundManager.ts';

type Environment = 'crazygames' | 'local' | 'disabled';

interface SystemInfo {
  device?: { type?: 'desktop' | 'tablet' | 'mobile' };
  applicationType?: 'google_play_store' | 'apple_store' | 'pwa' | 'web';
  locale?: string;
}

interface CrazyGamesSDKInterface {
  init: () => Promise<void>;
  environment?: Environment;
  game: {
    loadingStart: () => void;
    loadingStop: () => void;
    gameplayStart: () => void;
    gameplayStop: () => void;
    happytime: () => void;
    reportGameCompletedPercentage?: (percent: number) => void;
    setGameContext?: (context: Record<string, unknown>) => void;
    clearGameContext?: () => void;
    settings?: { muteAudio?: boolean };
    addSettingsChangeListener?: (listener: (settings: { muteAudio?: boolean }) => void) => void;
  };
  user?: { systemInfo?: SystemInfo };
  ad?: {
    requestAd: (
      type: 'midgame' | 'rewarded',
      callbacks?: {
        adStarted?: () => void;
        adFinished?: () => void;
        adError?: (error: unknown) => void;
      }
    ) => Promise<void> | void;
  };
  data?: {
    setItem: (key: string, value: string) => void;
    getItem: (key: string) => string | null;
    removeItem: (key: string) => void;
    clear: () => void;
  };
}

declare global {
  interface Window {
    CrazyGames?: { SDK?: CrazyGamesSDKInterface };
  }
}

const INIT_TIMEOUT_MS = 10_000;

function safe<T>(fn: () => T): T | undefined {
  try { return fn(); } catch (_) { return undefined; }
}

class CrazyGamesBridge {
  /** The SDK, set only when init succeeded in a supported environment. */
  private sdk: CrazyGamesSDKInterface | null = null;
  private initPromise: Promise<void> | null = null;
  private loadingStarted = false;
  private loadingStopped = false;
  private gameplayWanted = false;          // what the game currently is (playing or on a break)
  private gameplaySent: boolean | null = null;  // what the SDK was last told
  private gameplaySentAt = 0;
  private gameplayTimer = 0;
  private reportedPercent = 0;
  private contextLevel: number | null = null;

  /** True when SDK calls are allowed (initialised, environment crazygames/local). */
  get active(): boolean {
    return this.sdk !== null;
  }

  // ─── 1. Init ────────────────────────────────────────────────────────────────
  init(): Promise<void> {
    if (this.initPromise) return this.initPromise;
    this.initPromise = (async () => {
      const SDK = window.CrazyGames?.SDK;
      if (!SDK) return;                        // not on CrazyGames / script blocked
      let timedOut = false;
      try {
        await Promise.race([
          SDK.init(),
          new Promise<void>((_, reject) => setTimeout(() => { timedOut = true; reject(new Error('timeout')); }, INIT_TIMEOUT_MS)),
        ]);
      } catch (_) {
        return;                                // never switch to the SDK later in this session
      }
      if (timedOut) return;
      const env = safe(() => SDK.environment);
      if (env !== 'crazygames' && env !== 'local') return;
      this.sdk = SDK;

      // Platform mute setting always overrides the in-game toggle
      const mute = safe(() => SDK.game.settings?.muteAudio);
      if (typeof mute === 'boolean') sounds.setSdkMute(mute);
      safe(() => SDK.game.addSettingsChangeListener?.(settings => {
        if (typeof settings.muteAudio === 'boolean') sounds.setSdkMute(settings.muteAudio);
      }));
    })();
    return this.initPromise;
  }

  // ─── 2–3. Loading ───────────────────────────────────────────────────────────
  loadingStart(): void {
    if (this.loadingStarted) return;
    this.loadingStarted = true;
    if (this.sdk) safe(() => this.sdk!.game.loadingStart());
  }

  loadingStop(): void {
    if (this.loadingStopped) return;
    if (!this.loadingStarted) this.loadingStart();
    this.loadingStopped = true;
    if (this.sdk) safe(() => this.sdk!.game.loadingStop());
  }

  // ─── 4. Gameplay ────────────────────────────────────────────────────────────
  // Only real state changes reach the SDK, spaced at least GAP ms apart: the SDK
  // throttles (and logs an error for) start/stop calls under 1 s apart. A break
  // shorter than that (e.g. fail -> instant Retry) collapses into "still playing".
  gameplayStart(): void {
    if (!this.loadingStopped) this.loadingStop();
    this.gameplayWanted = true;
    this.flushGameplay();
  }

  gameplayStop(): void {
    this.gameplayWanted = false;
    this.flushGameplay();
  }

  private flushGameplay(): void {
    if (!this.sdk) return;
    window.clearTimeout(this.gameplayTimer);
    // Before the first start there is nothing to stop
    if (this.gameplaySent === null && !this.gameplayWanted) return;
    if (this.gameplayWanted === this.gameplaySent) return;
    const GAP = 1100;
    const wait = this.gameplaySentAt + GAP - Date.now();
    if (wait > 0) {
      this.gameplayTimer = window.setTimeout(() => this.flushGameplay(), wait);
      return;
    }
    this.gameplaySent = this.gameplayWanted;
    this.gameplaySentAt = Date.now();
    const sdk = this.sdk;
    safe(() => (this.gameplayWanted ? sdk.game.gameplayStart() : sdk.game.gameplayStop()));
  }

  /** Real achievements only (world completed, new Rush best) – never plain level clears. */
  happytime(): void {
    if (this.sdk) safe(() => this.sdk!.game.happytime());
  }

  /** Overall completion 0–100; only ever increases. */
  reportCompletion(percent: number): void {
    const p = Math.max(0, Math.min(100, Math.floor(percent)));
    if (p <= this.reportedPercent) return;
    this.reportedPercent = p;
    if (this.sdk) safe(() => this.sdk!.game.reportGameCompletedPercentage?.(p));
  }

  /** Current level for CrazyGames context; null clears it. */
  setLevelContext(level: number | null): void {
    if (level === this.contextLevel) return;
    this.contextLevel = level;
    if (!this.sdk) return;
    if (level === null) safe(() => this.sdk!.game.clearGameContext?.());
    else safe(() => this.sdk!.game.setGameContext?.({ level }));
  }

  // ─── System info ────────────────────────────────────────────────────────────
  private systemInfo(): SystemInfo | undefined {
    return this.sdk ? safe(() => this.sdk!.user?.systemInfo) : undefined;
  }

  /** Touch-first device (phone/tablet). Uses CrazyGames system info, else the browser. */
  isTouchDevice(): boolean {
    const type = this.systemInfo()?.device?.type;
    if (type) return type !== 'desktop';
    return safe(() => window.matchMedia('(pointer: coarse)').matches) ?? false;
  }

  // ─── Data Module ────────────────────────────────────────────────────────────
  // With the SDK active, saves go ONLY through the Data Module (it handles guests,
  // logged-in users and syncing). localStorage is used only when there is no SDK.
  // If the Data Module itself errors (e.g. progress save not enabled for this game),
  // the session switches to localStorage so progress is never silently dropped.
  private dataFailed = false;

  getItem(key: string): string | null {
    const data = this.dataFailed ? undefined : this.sdk?.data;
    if (data) {
      try { return data.getItem(key) ?? null; } catch (_) { this.dataFailed = true; }
    }
    return safe(() => localStorage.getItem(key)) ?? null;
  }

  setItem(key: string, value: string): void {
    const data = this.dataFailed ? undefined : this.sdk?.data;
    if (data) {
      try { data.setItem(key, value); return; } catch (_) { this.dataFailed = true; }
    }
    safe(() => localStorage.setItem(key, value));
  }

  // ─── Paced Midgame Ads ──────────────────────────────────────────────────────
  // No ads during the first levels, and at least 3 minutes between ads.
  // (Ads are disabled by CrazyGames during Basic Launch anyway.)
  private lastAdAt = Date.now();

  maybeMidgameAd(level: number, onComplete: () => void): void {
    const MIN_LEVEL = 6;
    const MIN_GAP_MS = 180_000;
    if (!this.sdk || level < MIN_LEVEL || Date.now() - this.lastAdAt < MIN_GAP_MS) {
      onComplete();
      return;
    }
    this.lastAdAt = Date.now();
    this.requestMidgameAd(onComplete);
  }

  private requestMidgameAd(onComplete: () => void): void {
    let completed = false;
    let started = false;
    let timedOut = false;
    const finish = () => {
      if (completed) return;
      completed = true;
      if (started) sounds.startBGM();    // unmute only after a real ad
      onComplete();
    };
    // Never leave the player stuck if the SDK never responds (but never cut a running ad)
    window.setTimeout(() => {
      if (!started) {
        timedOut = true;
        finish();
      }
    }, 5000);

    const requestAd = this.sdk?.ad?.requestAd;
    if (!requestAd) { finish(); return; }
    try {
      const result = requestAd.call(this.sdk!.ad, 'midgame', {
        adStarted: () => {
          started = true;
          sounds.stopBGM();
        },
        adFinished: () => {
          // An ad that started after the fallback fired: only restore the music
          if (timedOut) sounds.startBGM();
          finish();
        },
        adError: () => finish(),
      });
      if (result && typeof (result as Promise<void>).catch === 'function') (result as Promise<void>).catch(() => finish());
    } catch (_) {
      finish();
    }
  }
}

export const crazyGames = new CrazyGamesBridge();
