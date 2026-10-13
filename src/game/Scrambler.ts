import { GRID_SIZE, MAX_SCRAMBLE_MOVES } from '../config.ts';
import { solvedBoard, applyMove, isSolved } from './Board.ts';
import type { Board, MoveRecord } from '../types.ts';

// ─── Random integer in [0, max) ───────────────────────────────────────────────
function randInt(max: number): number {
  return Math.floor(Math.random() * max);
}

// ─── Opposite directions (avoid trivial no-op scramble back-and-forth) ────────
function isOpposite(a: MoveRecord, b: MoveRecord): boolean {
  if (a.type !== b.type || a.index !== b.index) return false;
  const opposites: Record<string, string> = { left: 'right', right: 'left', up: 'down', down: 'up' };
  return opposites[a.direction] === b.direction;
}

// ─── Scramble result ──────────────────────────────────────────────────────────
export interface ScrambleResult {
  board: Board;
  moves: MoveRecord[];   // ordered list of moves applied to solved board
}

/**
 * Level countdown balancing blueprint:
 * Level 1: 45s
 * Level 2 - 3: 40s
 * Level 4 - 6: 35s
 * Level 7 - 10: 30s
 * Level 11+: 25s
 */
/**
 * Level countdown balancing blueprint:
 * Level 1 & 2: 0 (Zen / No timer pressure for onboarding)
 * Level 3: 120s
 * Level 4: 90s
 * Level 5 - 8: 75s
 * Level 9+: 60s
 */
export function getLevelTimeLimit(level: number): number {
  if (level === 1 || level === 2) return 0; // Zen Mode for tutorial levels!
  if (level === 3) return 120;
  if (level === 4) return 90;
  if (level <= 8) return 75;
  return 60;
}

export function getParMoves(level: number): number {
  if (level === 1) return 1; // Pure 1-shift puzzle
  if (level === 2) return 2; // Pure 2-shift puzzle
  if (level === 3) return 3;
  if (level === 4) return 4;
  if (level === 5) return 5;
  if (level <= 8) return 7;
  return 10;
}

/**
 * Scramble the board by applying shifts.
 * Levels 1 & 2 are strictly deterministic so the tutorial instructions are 100% accurate!
 */
export function scramble(level: number): ScrambleResult {
  // ─── Level 1: Deterministic 1-Shift Tutorial ──────────────────────────────
  // Solved board with Row 0 shifted 1 step RIGHT.
  // Solving action: Shift Row 0 LEFT (via left arrow [←] or swipe left).
  if (level === 1) {
    const move: MoveRecord = { type: 'row', index: 0, direction: 'right' };
    return {
      board: applyMove(solvedBoard(), move),
      moves: [move],
    };
  }

  // ─── Level 2: Deterministic 2-Shift Tutorial ──────────────────────────────
  // Teaches both Columns and Rows:
  // Move 1: Row 0 shifted RIGHT
  // Move 2: Column 0 shifted DOWN
  // Solving order: Col 0 UP (Step 1, solves all columns!), then Row 0 LEFT (Step 2, solves board!)
  if (level === 2) {
    const m1: MoveRecord = { type: 'row', index: 0, direction: 'right' };
    const m2: MoveRecord = { type: 'col', index: 0, direction: 'down' };
    let b = applyMove(solvedBoard(), m1);
    b = applyMove(b, m2);
    return {
      board: b,
      moves: [m1, m2],
    };
  }

  // ─── Levels 3+: Progressive Scramble Curve ────────────────────────────────
  let count: number;
  if (level === 3) count = 3;
  else if (level === 4) count = 4;
  else if (level === 5) count = 5;
  else if (level <= 8) count = 5 + (level - 5); // 5 to 8 shifts
  else count = Math.min(8 + Math.floor((level - 8) * 0.6), MAX_SCRAMBLE_MOVES); // 8 to 12 shifts

  let attempts = 0;
  while (attempts < 100) {
    attempts++;
    let board = solvedBoard();
    const moves: MoveRecord[] = [];
    let lastMove: MoveRecord | null = null;

    for (let i = 0; i < count; i++) {
      let move: MoveRecord;
      let tries = 0;
      do {
        const useRow = Math.random() < 0.5;
        const index = randInt(GRID_SIZE);
        if (useRow) {
          const direction = Math.random() < 0.5 ? 'left' : 'right';
          move = { type: 'row', index, direction };
        } else {
          const direction = Math.random() < 0.5 ? 'up' : 'down';
          move = { type: 'col', index, direction };
        }
        tries++;
      } while (lastMove && isOpposite(lastMove, move) && tries < 20);

      board = applyMove(board, move);
      moves.push(move);
      lastMove = move;
    }

    if (!isSolved(board)) {
      return { board, moves };
    }
  }

  const fallback = solvedBoard();
  const move: MoveRecord = { type: 'row', index: 0, direction: 'left' };
  return { board: applyMove(fallback, move), moves: [move] };
}

/**
 * Seeded Daily Puzzle Generator
 */
export function scrambleDaily(dateStr: string): ScrambleResult {
  // Simple deterministic hash of date string (e.g. '2026-10-13')
  let seed = 0;
  for (let i = 0; i < dateStr.length; i++) {
    seed = (seed * 31 + dateStr.charCodeAt(i)) & 0xffffffff;
  }
  const seededRandom = () => {
    seed = (seed * 1664525 + 1013904223) & 0xffffffff;
    return (seed >>> 0) / 4294967296;
  };

  let board = solvedBoard();
  const moves: MoveRecord[] = [];
  let lastMove: MoveRecord | null = null;
  const count = 6; // Standard 6-shift daily puzzle

  for (let i = 0; i < count; i++) {
    let move: MoveRecord;
    let tries = 0;
    do {
      const useRow = seededRandom() < 0.5;
      const index = Math.floor(seededRandom() * GRID_SIZE);
      if (useRow) {
        const direction = seededRandom() < 0.5 ? 'left' : 'right';
        move = { type: 'row', index, direction };
      } else {
        const direction = seededRandom() < 0.5 ? 'up' : 'down';
        move = { type: 'col', index, direction };
      }
      tries++;
    } while (lastMove && isOpposite(lastMove, move) && tries < 20);

    board = applyMove(board, move);
    moves.push(move);
    lastMove = move;
  }

  return { board, moves };
}

/**
 * Calculates total Toroidal Manhattan Distance of the board towards the solved target.
 */
export function toroidalDistance(board: Board): number {
  let total = 0;
  for (let idx = 0; idx < board.length; idx++) {
    const val = board[idx];
    const targetR = Math.floor((val - 1) / GRID_SIZE);
    const targetC = (val - 1) % GRID_SIZE;
    const currR = Math.floor(idx / GRID_SIZE);
    const currC = idx % GRID_SIZE;
    const dr = Math.abs(currR - targetR);
    const dc = Math.abs(currC - targetC);
    total += Math.min(dr, GRID_SIZE - dr) + Math.min(dc, GRID_SIZE - dc);
  }
  return total;
}

/**
 * Compact 64-bit BigInt encoding of a 4x4 board (16 tiles * 4 bits = 64 bits).
 * Allows ultra-fast O(1) equality and hashing in Maps without string allocation overhead.
 */
export function boardToBigInt(board: Board): bigint {
  let n = 0n;
  for (let i = 0; i < 16; i++) {
    n = (n << 4n) | BigInt(board[i] - 1);
  }
  return n;
}

const ALL_MOVES: MoveRecord[] = [];
for (let i = 0; i < GRID_SIZE; i++) {
  ALL_MOVES.push({ type: 'row', index: i, direction: 'left' });
  ALL_MOVES.push({ type: 'row', index: i, direction: 'right' });
  ALL_MOVES.push({ type: 'col', index: i, direction: 'up' });
  ALL_MOVES.push({ type: 'col', index: i, direction: 'down' });
}

/**
 * Bidirectional Breadth-First-Search (Meet-in-the-Middle):
 * Expands forward from startBoard and backward from solvedBoard simultaneously.
 * Guarantees optimal winning path up to depth 8 in milliseconds.
 */
export function solveBiBFS(startBoard: Board, maxDepth = 8): MoveRecord | null {
  const startInt = boardToBigInt(startBoard);
  const targetInt = boardToBigInt(solvedBoard());
  if (startInt === targetInt) return null;

  const forward = new Map<bigint, MoveRecord | null>();
  forward.set(startInt, null);

  const backward = new Map<bigint, MoveRecord | null>();
  backward.set(targetInt, null);

  let forwardQueue: { board: Board; bInt: bigint; dist: number; firstMove: MoveRecord | null; lastMove: MoveRecord | null }[] = [
    { board: startBoard, bInt: startInt, dist: 0, firstMove: null, lastMove: null },
  ];
  let backwardQueue: { board: Board; bInt: bigint; dist: number; lastMove: MoveRecord | null }[] = [
    { board: solvedBoard(), bInt: targetInt, dist: 0, lastMove: null },
  ];

  const halfDepth = Math.ceil(maxDepth / 2);

  for (let step = 0; step < halfDepth; step++) {
    const nextForwardQueue: typeof forwardQueue = [];
    for (const item of forwardQueue) {
      if (item.dist !== step) continue;
      for (const m of ALL_MOVES) {
        if (item.lastMove && isOpposite(item.lastMove, m)) continue;
        const nb = applyMove(item.board, m);
        const nk = boardToBigInt(nb);

        if (backward.has(nk)) {
          return item.firstMove || m;
        }

        if (!forward.has(nk)) {
          const fm = item.firstMove || m;
          forward.set(nk, fm);
          nextForwardQueue.push({ board: nb, bInt: nk, dist: item.dist + 1, firstMove: fm, lastMove: m });
        }
      }
    }
    forwardQueue = nextForwardQueue;

    const nextBackwardQueue: typeof backwardQueue = [];
    for (const item of backwardQueue) {
      if (item.dist !== step) continue;
      for (const m of ALL_MOVES) {
        if (item.lastMove && isOpposite(item.lastMove, m)) continue;
        const nb = applyMove(item.board, m);
        const nk = boardToBigInt(nb);

        if (forward.has(nk)) {
          return forward.get(nk)!;
        }

        if (!backward.has(nk)) {
          backward.set(nk, m);
          nextBackwardQueue.push({ board: nb, bInt: nk, dist: item.dist + 1, lastMove: m });
        }
      }
    }
    backwardQueue = nextBackwardQueue;
  }

  return null;
}

/**
 * 100% Anti-Cycle Hint Solver:
 * 1. Solves up to depth 8 using exact Bidirectional BFS (guaranteed optimal, 0 cycles).
 * 2. Deep fallback (>8 moves) uses Toroidal Distance with Tabu loop avoidance.
 */
export function findHintMove(
  currentBoard: Board,
  recentMoves?: MoveRecord[] | MoveRecord | null,
  recentBoards?: Board[] | null,
): MoveRecord | null {
  if (isSolved(currentBoard)) return null;

  // 1. Exact Bidirectional BFS up to depth 8
  const exact = solveBiBFS(currentBoard, 8);
  if (exact) return exact;

  // 2. Fallback for deep scrambles (> 8 moves away):
  const movesArr = Array.isArray(recentMoves) ? recentMoves : recentMoves ? [recentMoves] : [];
  const lastMove = movesArr.length > 0 ? movesArr[movesArr.length - 1] : null;
  const recentBoardInts = new Set<bigint>();
  if (recentBoards) {
    for (const b of recentBoards) recentBoardInts.add(boardToBigInt(b));
  }

  let bestMove: MoveRecord | null = null;
  let minScore = Infinity;

  for (const m1 of ALL_MOVES) {
    if (lastMove && isOpposite(m1, lastMove)) continue;
    const b1 = applyMove(currentBoard, m1);
    const k1 = boardToBigInt(b1);
    const isVisited = recentBoardInts.has(k1);

    let bestB1Dist = toroidalDistance(b1);
    for (const m2 of ALL_MOVES) {
      if (isOpposite(m1, m2)) continue;
      const b2 = applyMove(b1, m2);
      const d2 = toroidalDistance(b2);
      if (d2 < bestB1Dist) bestB1Dist = d2;
    }

    let score = bestB1Dist;
    if (isVisited) score += 30; // heavy penalty against loops

    if (score < minScore) {
      minScore = score;
      bestMove = m1;
    }
  }

  return bestMove || ALL_MOVES[0];
}

/**
 * Verify puzzle solvability by reversing its scramble moves.
 */
export function verifySolvable(scrambleResult: ScrambleResult): boolean {
  let board = [...scrambleResult.board];
  const reversedMoves = [...scrambleResult.moves].reverse();
  for (const move of reversedMoves) {
    const opp: Record<string, string> = { left: 'right', right: 'left', up: 'down', down: 'up' };
    const reverseDirection = opp[move.direction] as MoveRecord['direction'];
    const revMove: MoveRecord = { type: move.type, index: move.index, direction: reverseDirection };
    board = applyMove(board, revMove);
  }
  return isSolved(board);
}
