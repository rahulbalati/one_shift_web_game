import { crazyGames } from '../sdk/CrazyGamesSDK.ts';

// Saved through the CrazyGames data module (cloud save), with localStorage fallback.
const K_MAX = 'os2_max_level';
const K_STARS = 'os2_stars';
const K_RUSH = 'os2_rush_best';
const K_SEEN = 'os2_seen_intros';

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
