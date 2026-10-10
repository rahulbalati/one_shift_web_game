// ─── CrazyGames SDK Integration Wrapper ──────────────────────────────────────
// Official HTML5 SDK v3 Support with graceful offline/fallback handling

interface CrazyGamesSDKInterface {
  init: () => Promise<void>;
  game: {
    loadingStart: () => void;
    loadingStop: () => void;
    gameplayStart: () => void;
    gameplayStop: () => void;
    happytime: () => void;
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
}

export const crazyGames = new CrazyGamesBridge();
