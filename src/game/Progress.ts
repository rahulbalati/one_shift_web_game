import { crazyGames } from '../sdk/CrazyGamesSDK.ts';

// Saved through the CrazyGames data module (cloud save), with localStorage fallback.
const K_MAX = 'os2_max_level';
const K_STARS = 'os2_stars';
const K_RUSH = 'os2_rush_best';
const K_SEEN = 'os2_seen_intros';
const K_HINTS = 'os2_hint_tokens';

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

// If the SDK finished initialising only after the game had started (slow network),
// saves made so far went to localStorage only. Merge both sources so progress never
// rolls back: highest level / stars / Rush best win, seen intros are unioned, and the
// hint count from this session is kept.
function reconcileLateInit(): void {
  const both = (key: string) => ({ sdk: crazyGames.getRaw('sdk', key), local: crazyGames.getRaw('local', key) });
  const parse = <T>(raw: string | null, fallback: T): T => {
    try { return raw ? (JSON.parse(raw) as T) : fallback; } catch (_) { return fallback; }
  };
  const maxInt = (key: string) => {
    const v = both(key);
    const n = Math.max(parseInt(v.sdk || '0', 10) || 0, parseInt(v.local || '0', 10) || 0);
    if (n > 0) crazyGames.setItem(key, String(n));
  };
  maxInt(K_MAX);
  maxInt(K_RUSH);

  const stars = both(K_STARS);
  const merged: Record<string, number> = { ...parse<Record<string, number>>(stars.sdk, {}) };
  for (const [lvl, n] of Object.entries(parse<Record<string, number>>(stars.local, {}))) {
    merged[lvl] = Math.max(merged[lvl] ?? 0, n);
  }
  crazyGames.setItem(K_STARS, JSON.stringify(merged));

  const seen = both(K_SEEN);
  const union = [...new Set([...parse<number[]>(seen.sdk, []), ...parse<number[]>(seen.local, [])])];
  crazyGames.setItem(K_SEEN, JSON.stringify(union));

  const hints = both(K_HINTS).local;
  if (hints !== null) crazyGames.setItem(K_HINTS, hints);
}

crazyGames.onLateInit(reconcileLateInit);
