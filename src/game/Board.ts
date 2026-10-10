import { GRID_SIZE } from '../config.ts';
import type { Board, MoveRecord, ShiftDirection } from '../types.ts';

// ─── Solved board ─────────────────────────────────────────────────────────────
export function solvedBoard(): Board {
  return Array.from({ length: GRID_SIZE * GRID_SIZE }, (_, i) => i + 1);
}

// ─── Board copy ───────────────────────────────────────────────────────────────
export function cloneBoard(board: Board): Board {
  return [...board];
}

// ─── Grid accessors ───────────────────────────────────────────────────────────
export function getCell(board: Board, row: number, col: number): number {
  return board[row * GRID_SIZE + col];
}

export function setCell(board: Board, row: number, col: number, value: number): void {
  board[row * GRID_SIZE + col] = value;
}

// ─── Shift operations (mutate a copy) ────────────────────────────────────────
/**
 * Shift an entire row left or right by 1, wrapping the displaced tile.
 * Returns a NEW board.
 */
export function shiftRow(board: Board, rowIndex: number, direction: 'left' | 'right'): Board {
  const next = cloneBoard(board);
  const base = rowIndex * GRID_SIZE;

  if (direction === 'left') {
    // [a, b, c, d] → [b, c, d, a]
    const displaced = next[base];
    for (let c = 0; c < GRID_SIZE - 1; c++) {
      next[base + c] = next[base + c + 1];
    }
    next[base + GRID_SIZE - 1] = displaced;
  } else {
    // [a, b, c, d] → [d, a, b, c]
    const displaced = next[base + GRID_SIZE - 1];
    for (let c = GRID_SIZE - 1; c > 0; c--) {
      next[base + c] = next[base + c - 1];
    }
    next[base] = displaced;
  }
  return next;
}

/**
 * Shift an entire column up or down by 1, wrapping the displaced tile.
 * Returns a NEW board.
 */
export function shiftCol(board: Board, colIndex: number, direction: 'up' | 'down'): Board {
  const next = cloneBoard(board);

  if (direction === 'up') {
    // top displaced, everything moves up
    const displaced = next[colIndex];
    for (let r = 0; r < GRID_SIZE - 1; r++) {
      next[r * GRID_SIZE + colIndex] = next[(r + 1) * GRID_SIZE + colIndex];
    }
    next[(GRID_SIZE - 1) * GRID_SIZE + colIndex] = displaced;
  } else {
    // bottom displaced, everything moves down
    const displaced = next[(GRID_SIZE - 1) * GRID_SIZE + colIndex];
    for (let r = GRID_SIZE - 1; r > 0; r--) {
      next[r * GRID_SIZE + colIndex] = next[(r - 1) * GRID_SIZE + colIndex];
    }
    next[colIndex] = displaced;
  }
  return next;
}

// ─── Apply a MoveRecord ───────────────────────────────────────────────────────
export function applyMove(board: Board, move: MoveRecord): Board {
  if (move.type === 'row') {
    return shiftRow(board, move.index, move.direction as 'left' | 'right');
  } else {
    return shiftCol(board, move.index, move.direction as 'up' | 'down');
  }
}

// ─── Victory check ────────────────────────────────────────────────────────────
export function isSolved(board: Board): boolean {
  for (let i = 0; i < board.length; i++) {
    if (board[i] !== i + 1) return false;
  }
  return true;
}

// ─── Direction helpers ────────────────────────────────────────────────────────
export function allDirections(): ShiftDirection[] {
  return ['left', 'right', 'up', 'down'];
}

export function rowDirections(): ('left' | 'right')[] {
  return ['left', 'right'];
}

export function colDirections(): ('up' | 'down')[] {
  return ['up', 'down'];
}
