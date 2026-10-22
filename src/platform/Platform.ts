// ─── Platform contract ────────────────────────────────────────────────────────
// The game talks ONLY to this interface; it never imports an SDK and never asks
// which platform it is on. Each platform (CrazyGames, GameDistribution, your own
// server, …) is one file in this folder implementing it, chosen at build time.
//
// Rules that keep maintenance near zero:
//   1. Only files in src/platform/ may touch a platform SDK.
//   2. Platform files never import game code; they report back through the
//      listener callbacks (onMuteChange / onAdChange).
//   3. Platform differences are Capabilities with safe defaults, never
//      `if (platform === 'x')` in game code.

export type PlatformName = 'web' | 'crazygames';

/** Natural pauses where a platform may show an ad or similar. */
export type BreakKind =
  | 'levelEnd'   // player chose to continue after finishing a level
  | 'restart';   // player starts a new run (e.g. Shift Rush "Play again")

export interface BreakContext {
  /** The player's level (used by platforms that pace breaks by progress). */
  level: number;
}

export interface Capabilities {
  /** Needs a Play screen before gameplay starts (e.g. to show a pre-roll). */
  startScreen: boolean;
  /** Saves sync to a platform account across devices. */
  cloudSave: boolean;
  /** The platform can mute the game (reported through onMuteChange). */
  platformMute: boolean;
  /** The platform may show ads at break points. */
  ads: boolean;
}

export interface Platform {
  readonly name: PlatformName;
  readonly caps: Capabilities;

  /** Load/initialise the platform. Resolves even if the SDK is missing or slow. */
  init(): Promise<void>;

  // Lifecycle
  loadingStart(): void;
  loadingStop(): void;
  /** Real gameplay started or resumed. */
  gameplayStart(): void;
  /** Gameplay stopped for a break (menu, win/fail panel, pause). */
  gameplayStop(): void;

  /** A real achievement (world completed, new best). Not for plain level clears. */
  celebrate(): void;
  /** Overall progress 0–100. */
  reportCompletion(percent: number): void;
  /** The level being played; null when not in a level. */
  setLevelContext(level: number | null): void;

  /** True on phones/tablets (touch-first). */
  isTouchDevice(): boolean;

  // Save data (same API shape as localStorage)
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;

  /** A natural break. `done` is always called exactly once, ad or no ad. */
  breakPoint(kind: BreakKind, ctx: BreakContext, done: () => void): void;

  /** The platform muted/unmuted the game (e.g. a site-wide mute setting). */
  onMuteChange(cb: (muted: boolean) => void): void;
  /** An ad started (true) or ended (false): pause music while true. */
  onAdChange(cb: (playing: boolean) => void): void;
}

export const DEFAULT_CAPS: Capabilities = {
  startScreen: false,
  cloudSave: false,
  platformMute: false,
  ads: false,
};
