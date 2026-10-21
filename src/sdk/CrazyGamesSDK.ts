// ─── CrazyGames SDK Integration Wrapper ──────────────────────────────────────
// Official HTML5 SDK v3 Support with Data Module & Platform Audio Muting
import { sounds } from '../audio/SoundManager.ts';

interface CrazyGamesSDKInterface {
  init: () => Promise<void>;
  game: {
    loadingStart: () => void;
    loadingStop: () => void;
    gameplayStart: () => void;
    gameplayStop: () => void;
    happytime: () => void;
    settings?: {
      muteAudio?: boolean;
    };
    addSettingsChangeListener?: (listener: (settings: { muteAudio?: boolean }) => void) => void;
  };
  ad?: {
    requestAd: (
      type: 'midgame' | 'rewarded',
      callbacks?: {
        adStarted?: () => void;
        adFinished?: () => void;
        adError?: (error: unknown) => void;
      }
    ) => Promise<void>;
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
    CrazyGames?: {
      SDK?: CrazyGamesSDKInterface;
    };
  }
}

class CrazyGamesBridge {
  private initialized = false;
  private initPromise: Promise<void> | null = null;
  private hasLoadingStarted = false;
  private hasLoadingStopped = false;
  private pendingLoadingStop = false;
  private readBeforeInit = false;
  private lateInitListeners: (() => void)[] = [];

  /** Runs `fn` if the SDK finishes initialising after the game already read save data. */
  onLateInit(fn: () => void): void {
    this.lateInitListeners.push(fn);
  }

  /** Raw value from one storage source, used to reconcile saves after a late init. */
  getRaw(source: 'sdk' | 'local', key: string): string | null {
    try {
      if (source === 'sdk') return this.initialized ? window.CrazyGames?.SDK?.data?.getItem(key) ?? null : null;
      return localStorage.getItem(key);
    } catch (_) {
      return null;
    }
  }

  async init(): Promise<void> {
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      try {
        if (typeof window !== 'undefined' && window.CrazyGames?.SDK) {
          await window.CrazyGames.SDK.init();
          this.initialized = true;
          if (this.readBeforeInit) {
            for (const fn of this.lateInitListeners) {
              try { fn(); } catch (_) {}
            }
          }

          // Platform audio muting support
          const initialMute = window.CrazyGames.SDK.game?.settings?.muteAudio;
          if (typeof initialMute === 'boolean') {
            sounds.setSdkMute(initialMute);
          }

          window.CrazyGames.SDK.game?.addSettingsChangeListener?.((settings) => {
            if (typeof settings.muteAudio === 'boolean') {
              sounds.setSdkMute(settings.muteAudio);
            }
          });
        }
      } catch (_) {
        // Graceful fallback if offline or running outside CrazyGames
      }
    })();

    return this.initPromise;
  }

  loadingStart(): void {
    if (this.hasLoadingStarted) return;
    this.hasLoadingStarted = true;
    this.whenReady(() => window.CrazyGames?.SDK?.game?.loadingStart());

    // If loadingStop was requested while awaiting loadingStart
    if (this.pendingLoadingStop) {
      this.pendingLoadingStop = false;
      this.loadingStop();
    }
  }

  loadingStop(): void {
    if (this.hasLoadingStopped) return;

    if (!this.hasLoadingStarted) {
      // Defer loadingStop until loadingStart has been called
      this.pendingLoadingStop = true;
      return;
    }

    this.hasLoadingStopped = true;
    this.whenReady(() => window.CrazyGames?.SDK?.game?.loadingStop());
  }

  // Events fired before SDK.init() has resolved are sent once it does, in order
  private whenReady(fn: () => void): void {
    if (this.initialized || !this.initPromise) {
      try { fn(); } catch (_) {}
      return;
    }
    this.initPromise.then(() => { try { fn(); } catch (_) {} });
  }

  // Only real state changes are sent (repeated calls get throttled by the SDK)
  private gameplayActive = false;

  gameplayStart(): void {
    // Safety requirement: loadingStop must precede gameplayStart
    if (!this.hasLoadingStopped) {
      this.loadingStop();
    }
    if (this.gameplayActive) return;
    this.gameplayActive = true;
    this.whenReady(() => window.CrazyGames?.SDK?.game?.gameplayStart());
  }

  gameplayStop(): void {
    if (!this.gameplayActive) return;
    this.gameplayActive = false;
    this.whenReady(() => window.CrazyGames?.SDK?.game?.gameplayStop());
  }

  happytime(): void {
    this.whenReady(() => window.CrazyGames?.SDK?.game?.happytime());
  }

  // ─── Data Module (Cloud save on CrazyGames, localStorage fallback) ──────────
  getItem(key: string): string | null {
    if (!this.initialized) this.readBeforeInit = true;
    if (this.initialized) {
      try {
        if (window.CrazyGames?.SDK?.data) {
          const val = window.CrazyGames.SDK.data.getItem(key);
          if (val !== null && val !== undefined) return val;
        }
      } catch (_) {}
    }
    try {
      return localStorage.getItem(key);
    } catch (_) {
      return null;
    }
  }

  setItem(key: string, value: string): void {
    if (this.initialized) {
      try {
        if (window.CrazyGames?.SDK?.data) {
          window.CrazyGames.SDK.data.setItem(key, value);
        }
      } catch (_) {}
    }
    try {
      localStorage.setItem(key, value);
    } catch (_) {}
  }

  // ─── Paced Midgame Ads ──────────────────────────────────────────────────────
  // No ads during the first levels, and at least 3 minutes between ads.
  // (Ads are disabled by CrazyGames during Basic Launch anyway.)
  private lastAdAt = Date.now();

  maybeMidgameAd(level: number, onComplete: () => void): void {
    const MIN_LEVEL = 6;
    const MIN_GAP_MS = 180_000;
    if (level < MIN_LEVEL || Date.now() - this.lastAdAt < MIN_GAP_MS) {
      onComplete();
      return;
    }
    this.lastAdAt = Date.now();
    this.requestMidgameAd(onComplete);
  }

  // ─── Midgame Ad Request ─────────────────────────────────────────────────────
  requestMidgameAd(onComplete?: () => void): void {
    let completed = false;
    let started = false;
    let timedOut = false;
    const finish = () => {
      if (!completed) {
        completed = true;
        if (started) sounds.startBGM();   // unmute only after a real ad
        onComplete?.();
      }
    };
    // Never leave the player stuck if the SDK never responds (but never cut a running ad)
    window.setTimeout(() => {
      if (!started) {
        timedOut = true;
        finish();
      }
    }, 5000);

    try {
      if (window.CrazyGames?.SDK?.ad?.requestAd) {
        window.CrazyGames.SDK.ad.requestAd('midgame', {
          adStarted: () => {
            started = true;
            sounds.stopBGM();
          },
          adFinished: () => {
            // An ad that started after the fallback fired: the game already moved on,
            // so only restore the music it muted.
            if (timedOut) sounds.startBGM();
            finish();
          },
          adError: (err) => {
            console.warn('CrazyGames midgame ad notice / unfilled:', err);
            finish();
          },
        }).catch(() => {
          finish();
        });
        return;
      }
    } catch (_) {}

    finish();
  }
}

export const crazyGames = new CrazyGamesBridge();
