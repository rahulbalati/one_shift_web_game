// ─── CrazyGames SDK Integration Wrapper ──────────────────────────────────────
// Official HTML5 SDK v3 Support with graceful offline/fallback handling
import { sounds } from '../audio/SoundManager.ts';

interface CrazyGamesSDKInterface {
  init: () => Promise<void>;
  game: {
    loadingStart: () => void;
    loadingStop: () => void;
    gameplayStart: () => void;
    gameplayStop: () => void;
    happytime: () => void;
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

  async init(): Promise<void> {
    if (this.initialized) return;

    try {
      if (window.CrazyGames?.SDK) {
        await window.CrazyGames.SDK.init();
        this.initialized = true;
      }
    } catch (_) {
      // Graceful fallback if offline or running outside CrazyGames
    }
  }

  loadingStart(): void {
    try {
      window.CrazyGames?.SDK?.game?.loadingStart();
    } catch (_) {}
  }

  loadingStop(): void {
    try {
      window.CrazyGames?.SDK?.game?.loadingStop();
    } catch (_) {}
  }

  gameplayStart(): void {
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
