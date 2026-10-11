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

  async init(): Promise<void> {
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      try {
        if (typeof window !== 'undefined' && window.CrazyGames?.SDK) {
          await window.CrazyGames.SDK.init();
          this.initialized = true;

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

    try {
      window.CrazyGames?.SDK?.game?.loadingStart();
    } catch (_) {}

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
    try {
      window.CrazyGames?.SDK?.game?.loadingStop();
    } catch (_) {}
  }

  gameplayStart(): void {
    // Safety requirement: loadingStop must precede gameplayStart
    if (!this.hasLoadingStopped) {
      this.loadingStop();
    }

    try {
      window.CrazyGames?.SDK?.game?.gameplayStart();
    } catch (_) {}
  }

  gameplayStop(): void {
    try {
      window.CrazyGames?.SDK?.game?.gameplayStop();
    } catch (_) {}
  }

  happytime(): void {
    try {
      window.CrazyGames?.SDK?.game?.happytime();
    } catch (_) {}
  }

  // ─── Data Module (Cloud save on CrazyGames, localStorage fallback) ──────────
  getItem(key: string): string | null {
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

  // ─── Midgame Ad Request ─────────────────────────────────────────────────────
  requestMidgameAd(onComplete?: () => void): void {
    let completed = false;
    const finish = () => {
      if (!completed) {
        completed = true;
        onComplete?.();
      }
    };

    try {
      if (window.CrazyGames?.SDK?.ad?.requestAd) {
        window.CrazyGames.SDK.ad.requestAd('midgame', {
          adStarted: () => {
            sounds.stopBGM();
          },
          adFinished: () => {
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
