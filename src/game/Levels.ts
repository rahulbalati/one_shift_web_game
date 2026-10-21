import { applyMove, emptyRules, legalMoves } from './Board.ts';
import { solve } from './Solver.ts';
import type { MoveRecord, Puzzle, PuzzleKind, Rules } from '../types.ts';
import { OPPOSITE } from '../types.ts';

// ─── Worlds ───────────────────────────────────────────────────────────────────
export interface WorldInfo {
  id: number;
  name: string;
  tagline: string;
  first: number;
  last: number | null;          // null = endless
  intro?: { title: string; body: string };
}

export const LEVELS_PER_WORLD = 10;

export const WORLDS: WorldInfo[] = [
  { id: 1, name: 'First Shifts', tagline: 'Learn to slide', first: 1, last: 10 },
  {
    id: 2, name: 'Big Board', tagline: 'Four by four', first: 11, last: 20,
    intro: { title: 'Bigger board', body: 'Same rules, one more row and column.\nEach row has its own colour.' },
  },
  {
    id: 3, name: 'Locks', tagline: "Some lines won't move", first: 21, last: 30,
    intro: { title: 'New: locked lines', body: "Lines with a lock can't slide.\nMove the other lines to work around them." },
  },
  {
    id: 4, name: 'Shapes', tagline: 'Build the picture', first: 31, last: 40,
    intro: { title: 'New: shapes', body: 'Copy the small target picture.\nAny tile of the right colour counts.' },
  },
  {
    id: 5, name: 'Conveyors', tagline: 'One-way lines', first: 41, last: 50,
    intro: { title: 'New: conveyors', body: 'Gold lines only slide one way.\nGo all the way round to move back.' },
  },
  {
    id: 6, name: 'Links', tagline: 'Lines move together', first: 51, last: 60,
    intro: { title: 'New: linked lines', body: 'Pink lines are linked.\nMoving one moves its partner the same way.' },
  },
  {
    id: 7, name: 'Mixed', tagline: 'Everything at once', first: 61, last: null,
    intro: { title: 'Mixed world', body: 'Every rule can appear now, two at a time.\nHow far can you go?' },
  },
];

export function worldOf(level: number): WorldInfo {
  for (const w of WORLDS) {
    if (level >= w.first && (w.last === null || level <= w.last)) return w;
  }
  return WORLDS[WORLDS.length - 1];
}

// ─── Seeded RNG (levels are identical for every player and every retry) ───────
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: () => number, arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

// ─── Shape targets (4×4) ──────────────────────────────────────────────────────
// 0 = base colour, 1 = pink, 2 = teal
const PATTERNS: { name: string; cells: number[] }[] = [
  { name: 'Stripes', cells: [1,1,1,1, 0,0,0,0, 1,1,1,1, 0,0,0,0] },
  { name: 'Frame',   cells: [1,1,1,1, 1,0,0,1, 1,0,0,1, 1,1,1,1] },
  { name: 'Halves',  cells: [1,1,2,2, 1,1,2,2, 1,1,2,2, 1,1,2,2] },
  { name: 'Checker', cells: [1,0,1,0, 0,1,0,1, 1,0,1,0, 0,1,0,1] },
  { name: 'Arrow',   cells: [0,1,1,0, 1,1,1,1, 0,1,1,0, 0,1,1,0] },
  { name: 'Steps',   cells: [1,0,0,0, 1,1,0,0, 1,1,1,0, 1,1,1,1] },
  { name: 'Ring',    cells: [2,2,2,2, 2,1,1,2, 2,1,1,2, 2,2,2,2] },
  { name: 'Diagonal',cells: [1,0,0,2, 0,1,2,0, 0,2,1,0, 2,0,0,1] },
  { name: 'Cross',   cells: [0,1,1,0, 1,2,2,1, 1,2,2,1, 0,1,1,0] },
  { name: 'Corners', cells: [1,0,0,2, 0,0,0,0, 0,0,0,0, 2,0,0,1] },
];

// ─── Rule builders ────────────────────────────────────────────────────────────
type RuleKind = 'lock' | 'lock2' | 'conveyor' | 'conveyor2' | 'link';

function addRule(rules: Rules, kind: RuleKind, size: number, rng: () => number): void {
  // Lines already used by a rule are never reused, so rules never conflict
  const used = (type: 'row' | 'col', i: number) =>
    (type === 'row' ? rules.lockedRows : rules.lockedCols).includes(i) ||
    (type === 'row' ? rules.oneWayRows : rules.oneWayCols)[i] !== undefined ||
    rules.links.some(l => l.type === type && (l.a === i || l.b === i));
  const freeLine = (type: 'row' | 'col'): number | null => {
    const free = [...Array(size).keys()].filter(i => !used(type, i));
    return free.length ? pick(rng, free) : null;
  };
  const anyType = (): 'row' | 'col' => (rng() < 0.5 ? 'row' : 'col');

  if (kind === 'lock' || kind === 'lock2') {
    const types: ('row' | 'col')[] = kind === 'lock2' ? ['row', 'col'] : [anyType()];
    for (const t of types) {
      const i = freeLine(t);
      if (i === null) continue;
      (t === 'row' ? rules.lockedRows : rules.lockedCols).push(i);
    }
  } else if (kind === 'conveyor' || kind === 'conveyor2') {
    const types: ('row' | 'col')[] = kind === 'conveyor2' ? ['row', 'col'] : [anyType()];
    for (const t of types) {
      const i = freeLine(t);
      if (i === null) continue;
      if (t === 'row') rules.oneWayRows[i] = rng() < 0.5 ? 'left' : 'right';
      else rules.oneWayCols[i] = rng() < 0.5 ? 'up' : 'down';
    }
  } else if (kind === 'link') {
    const t = anyType();
    const a = freeLine(t);
    if (a === null) return;
    const rest = [...Array(size).keys()].filter(i => i !== a && !used(t, i));
    if (!rest.length) return;
    rules.links.push({ type: t, a, b: pick(rng, rest) });
  }
}

// ─── Generator ────────────────────────────────────────────────────────────────
interface Spec {
  size: number;
  kind: PuzzleKind;
  par: number;
  rules: Rules;
  pattern?: { name: string; cells: number[] };
  slack: number;      // move limit = par + slack (0 = unlimited)
}

/**
 * Scrambles from the goal using inverse legal moves (so it is always solvable),
 * then proves the exact minimum with the solver and keeps only boards whose
 * minimum equals the requested par.
 */
function generate(spec: Spec, rng: () => number): Puzzle {
  const n = spec.size * spec.size;
  const target = spec.pattern ? spec.pattern.cells.slice() : [...Array(n).keys()];
  const keys = target.slice();             // tile id i starts on its own goal cell
  const moves = legalMoves(spec.size, spec.rules);

  let best: { start: number[]; par: number } | null = null;

  for (let attempt = 0; attempt < 60; attempt++) {
    const walk = spec.par + (attempt >= 20 ? 1 : 0) + (attempt >= 40 ? 1 : 0);
    let board = [...Array(n).keys()];
    let last: MoveRecord | null = null;
    for (let s = 0; s < walk; s++) {
      let m: MoveRecord;
      let tries = 0;
      do {
        m = pick(rng, moves);
        tries++;
      } while (last && m.type === last.type && m.index === last.index && m.direction !== last.direction && tries < 20);
      last = m;
      board = applyMove(board, spec.size, { ...m, direction: OPPOSITE[m.direction] }, spec.rules);
    }

    const state = board.map(id => keys[id]);
    const path = solve(state, target, spec.size, spec.rules, walk);
    if (!path || path.length === 0) continue;
    if (path.length === spec.par) {
      best = { start: board, par: path.length };
      break;
    }
    if (!best || Math.abs(path.length - spec.par) < Math.abs(best.par - spec.par)) {
      best = { start: board, par: path.length };
    }
  }

  if (!best) {
    // Extremely unlikely fallback: a single legal move away
    const m = moves[0];
    best = { start: applyMove([...Array(n).keys()], spec.size, { ...m, direction: OPPOSITE[m.direction] }, spec.rules), par: 1 };
  }

  return {
    size: spec.size,
    kind: spec.kind,
    keys,
    target,
    start: best.start,
    par: best.par,
    limit: spec.slack > 0 ? best.par + spec.slack : 0,
    rules: spec.rules,
    patternName: spec.pattern?.name,
  };
}

const W1_PARS = [1, 1, 2, 2, 2, 3, 3, 3, 4, 4];
const W2_PARS = [2, 2, 3, 3, 3, 4, 4, 4, 5, 5];
const W3_PARS = [2, 3, 3, 3, 4, 4, 4, 5, 5, 5];
const W4_PARS = [2, 3, 3, 4, 4, 4, 5, 5, 5, 6];
const W5_PARS = [2, 3, 3, 4, 4, 4, 5, 5, 5, 6];
const W6_PARS = [2, 3, 3, 4, 4, 4, 5, 5, 5, 6];
const MIX_PARS = [4, 5, 5, 6, 4, 5, 6, 6, 5, 6];

function slackFor(level: number, par: number): number {
  if (level <= 3) return 0;               // tutorial levels: no pressure
  return par <= 3 ? 3 : 4;
}

const levelCache = new Map<number, Puzzle>();

export function buildLevel(level: number): Puzzle {
  const cached = levelCache.get(level);
  if (cached) return cached;

  const rng = mulberry32(level * 7919 + 17);
  const world = worldOf(level);
  const i = (level - world.first) % LEVELS_PER_WORLD;
  const rules = emptyRules();
  let puzzle: Puzzle;

  // Tutorial levels are hand-made so the guidance is exact
  if (level === 1 || level === 2) {
    const size = 3;
    const target = [...Array(9).keys()];
    const m: MoveRecord = level === 1
      ? { type: 'row', index: 0, direction: 'right' }
      : { type: 'col', index: 1, direction: 'down' };
    puzzle = {
      size, kind: 'numbers', keys: target.slice(), target,
      start: applyMove(target, size, m, rules), par: 1, limit: 0, rules,
    };
  } else {
    let spec: Spec;
    switch (world.id) {
      case 1:
        spec = { size: 3, kind: 'numbers', par: W1_PARS[i], rules, slack: 0 };
        break;
      case 2:
        spec = { size: 4, kind: 'numbers', par: W2_PARS[i], rules, slack: 0 };
        break;
      case 3:
        addRule(rules, i < 6 ? 'lock' : 'lock2', 4, rng);
        spec = { size: 4, kind: 'numbers', par: W3_PARS[i], rules, slack: 0 };
        break;
      case 4:
        spec = { size: 4, kind: 'pattern', par: W4_PARS[i], rules, pattern: PATTERNS[i % PATTERNS.length], slack: 0 };
        break;
      case 5:
        addRule(rules, i < 5 ? 'conveyor' : 'conveyor2', 4, rng);
        spec = { size: 4, kind: 'numbers', par: W5_PARS[i], rules, slack: 0 };
        break;
      case 6:
        addRule(rules, 'link', 4, rng);
        spec = { size: 4, kind: 'numbers', par: W6_PARS[i], rules, slack: 0 };
        break;
      default: {
        const kinds: RuleKind[] = ['lock', 'conveyor', 'link'];
        const first = pick(rng, kinds);
        addRule(rules, first, 4, rng);
        const usePattern = rng() < 0.35;
        if (!usePattern) addRule(rules, pick(rng, kinds.filter(k => k !== first)), 4, rng);
        spec = {
          size: 4,
          kind: usePattern ? 'pattern' : 'numbers',
          par: MIX_PARS[i],
          rules,
          pattern: usePattern ? pick(rng, PATTERNS) : undefined,
          slack: 0,
        };
      }
    }
    spec.slack = slackFor(level, spec.par);
    puzzle = generate(spec, rng);
  }

  levelCache.set(level, puzzle);
  return puzzle;
}

// ─── Shift Rush boards ────────────────────────────────────────────────────────
export function buildRush(index: number, seed: number): Puzzle {
  const rng = mulberry32(seed * 31 + index * 101 + 7);
  let size = 3;
  let par = 2;
  if (index >= 3) par = 3;
  if (index >= 6) { size = 4; par = 3; }
  if (index >= 10) par = 4;
  if (index >= 15) par = 5;
  return generate({ size, kind: 'numbers', par, rules: emptyRules(), slack: 0 }, rng);
}

export const RUSH_UNLOCK_LEVEL = 6;
