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
 * Robust Breadth-First-Search (BFS) + Toroidal Distance Solver for the Hint System.
 * - Explores depth 1-3 to find guaranteed shortest winning move.
 * - When >3 moves from victory, uses 2-step lookahead Toroidal Manhattan Distance.
 * - Prevents immediate opposite cycles by filtering against `lastMove`.
 */
export function findHintMove(currentBoard: Board, lastMove?: MoveRecord | null): MoveRecord | null {
  if (isSolved(currentBoard)) return null;

  const ALL_MOVES: MoveRecord[] = [];
  for (let i = 0; i < GRID_SIZE; i++) {
    ALL_MOVES.push({ type: 'row', index: i, direction: 'left' });
    ALL_MOVES.push({ type: 'row', index: i, direction: 'right' });
    ALL_MOVES.push({ type: 'col', index: i, direction: 'up' });
    ALL_MOVES.push({ type: 'col', index: i, direction: 'down' });
  }

  // Depth 1 check (immediate win)
  for (const m1 of ALL_MOVES) {
    const b1 = applyMove(currentBoard, m1);
    if (isSolved(b1)) return m1;
  }

  // Depth 2 check (2 moves to win)
  for (const m1 of ALL_MOVES) {
    if (lastMove && isOpposite(m1, lastMove)) continue;
    const b1 = applyMove(currentBoard, m1);
    for (const m2 of ALL_MOVES) {
      if (isOpposite(m1, m2)) continue;
      const b2 = applyMove(b1, m2);
      if (isSolved(b2)) return m1;
    }
  }

  // Depth 3 check (3 moves to win)
  for (const m1 of ALL_MOVES) {
    if (lastMove && isOpposite(m1, lastMove)) continue;
    const b1 = applyMove(currentBoard, m1);
    for (const m2 of ALL_MOVES) {
      if (isOpposite(m1, m2)) continue;
      const b2 = applyMove(b1, m2);
      for (const m3 of ALL_MOVES) {
        if (isOpposite(m2, m3)) continue;
        const b3 = applyMove(b2, m3);
        if (isSolved(b3)) return m1;
      }
    }
  }

  // Heuristic Fallback for deep states (>= 4 moves):
  // Evaluates which initial move m1 leads to the minimal 2-step Toroidal Manhattan Distance,
  // strictly excluding opposite reversals of lastMove.
  let bestMove: MoveRecord | null = null;
  let minDistance = Infinity;

  for (const m1 of ALL_MOVES) {
    if (lastMove && isOpposite(m1, lastMove)) continue;
    const b1 = applyMove(currentBoard, m1);
    let bestB1Dist = toroidalDistance(b1);

    for (const m2 of ALL_MOVES) {
      if (isOpposite(m1, m2)) continue;
      const b2 = applyMove(b1, m2);
      const d2 = toroidalDistance(b2);
      if (d2 < bestB1Dist) {
        bestB1Dist = d2;
      }
    }

    if (bestB1Dist < minDistance) {
      minDistance = bestB1Dist;
      bestMove = m1;
    }
  }

  // If all non-opposite moves were somehow filtered, fall back to any move that minimizes distance
  if (!bestMove) {
    for (const m of ALL_MOVES) {
      const b = applyMove(currentBoard, m);
      const d = toroidalDistance(b);
      if (d < minDistance) {
        minDistance = d;
        bestMove = m;
      }
    }
  }

  return bestMove;
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
