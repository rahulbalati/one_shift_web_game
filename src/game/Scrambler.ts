import { GRID_SIZE, BASE_SCRAMBLE_MOVES, SCRAMBLE_INCREASE_PER_LEVEL, MAX_SCRAMBLE_MOVES } from '../config.ts';
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
 * Scramble the board by applying `count` random legal row/col shifts.
 * Consecutive opposite moves are avoided to keep the puzzle meaningful.
 * Guaranteed solvable (reverse the `moves` array with opposing directions).
 * Guaranteed to not produce a solved board (retry if unlucky).
 */
export function scramble(level: number): ScrambleResult {
  const count = Math.min(
    BASE_SCRAMBLE_MOVES + (level - 1) * SCRAMBLE_INCREASE_PER_LEVEL,
    MAX_SCRAMBLE_MOVES,
  );

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

  // Should never happen; return a single-shift fallback
  const fallback = solvedBoard();
  const move: MoveRecord = { type: 'row', index: 0, direction: 'left' };
  return { board: applyMove(fallback, move), moves: [move] };
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
