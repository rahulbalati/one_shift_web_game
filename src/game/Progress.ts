import { crazyGames } from '../sdk/CrazyGamesSDK.ts';

// Saved through the CrazyGames Data Module; localStorage only when the SDK is unavailable.
const K_MAX = 'os2_max_level';
const K_STARS = 'os2_stars';
const K_RUSH = 'os2_rush_best';
const K_SEEN = 'os2_seen_intros';
const K_HINTS = 'os2_hint_tokens';
const K_MUTED = 'os2_sound_muted';
const STORY_LEVELS = 60;   // worlds 1–6; world 7 is endless

export const START_HINTS = 3;
export const HINTS_PER_PERFECT = 1;
export const HINTS_PER_WORLD = 2;

function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = crazyGames.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch (_) {
    return fallback;
  }
}

function readInt(key: string, fallback: number): number {
  const v = parseInt(crazyGames.getItem(key) || '', 10);
  return isNaN(v) ? fallback : v;
}

export const progress = {
  /** Highest level the player may play (first uncleared level). */
  maxLevel(): number {
    return Math.max(1, readInt(K_MAX, 1));
  },

  stars(level: number): number {
    return readJSON<Record<string, number>>(K_STARS, {})[level] ?? 0;
  },

  allStars(): Record<string, number> {
    return readJSON<Record<string, number>>(K_STARS, {});
  },

  totalStars(): number {
    return Object.values(this.allStars()).reduce((a, b) => a + b, 0);
  },

  /** Records a clear. Returns true when this clear unlocked a new level. */
  recordClear(level: number, stars: number): boolean {
    const all = this.allStars();
    if ((all[level] ?? 0) < stars) {
      all[level] = stars;
      crazyGames.setItem(K_STARS, JSON.stringify(all));
    }
    const max = this.maxLevel();
    if (level + 1 > max) {
      crazyGames.setItem(K_MAX, String(level + 1));
      return true;
    }
    return false;
  },

  rushBest(): number {
    return readInt(K_RUSH, 0);
  },

  recordRush(score: number): boolean {
    if (score > this.rushBest()) {
      crazyGames.setItem(K_RUSH, String(score));
      return true;
    }
    return false;
  },

  hints(): number {
    return Math.max(0, readInt(K_HINTS, START_HINTS));
  },

  addHints(n: number): number {
    const v = this.hints() + n;
    crazyGames.setItem(K_HINTS, String(v));
    return v;
  },

  /** Spends one hint token. Returns false when none are left. */
  spendHint(): boolean {
    const v = this.hints();
    if (v <= 0) return false;
    crazyGames.setItem(K_HINTS, String(v - 1));
    return true;
  },

  /** Share of the 60 world levels cleared, for SDK completion reporting. */
  completionPercent(): number {
    return Math.min(100, ((this.maxLevel() - 1) / STORY_LEVELS) * 100);
  },

  soundMuted(): boolean {
    return crazyGames.getItem(K_MUTED) === '1';
  },

  setSoundMuted(muted: boolean): void {
    crazyGames.setItem(K_MUTED, muted ? '1' : '0');
  },

  seenIntro(world: number): boolean {
    return readJSON<number[]>(K_SEEN, []).includes(world);
  },

  markIntro(world: number): void {
    const seen = readJSON<number[]>(K_SEEN, []);
    if (!seen.includes(world)) {
      seen.push(world);
      crazyGames.setItem(K_SEEN, JSON.stringify(seen));
    }
  },
};
