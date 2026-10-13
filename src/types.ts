import { GRID_SIZE } from './config.ts';

// A 4×4 board is a flat array of 16 numbers (values 1–16)
export type Board = number[];

// Direction of a shift
export type ShiftDirection = 'left' | 'right' | 'up' | 'down';

// A single move record used for undo
export interface MoveRecord {
  type: 'row' | 'col';
  index: number;          // 0-based row or column index
  direction: ShiftDirection;
}

// Data passed to the VictoryScene
export interface VictoryData {
  level: number;
  moves: number;
  elapsedSeconds: number;
  bestMoves: number | null;
  isDaily?: boolean;
  streak?: number;
}

// Per-level session data
export interface LevelSession {
  level: number;
  scrambledBoard: Board;   // saved so Restart can go back to it
  scrambleMoves: MoveRecord[];
}

// Helper to convert row/col + direction to a MoveRecord
export function makeMove(type: 'row' | 'col', index: number, direction: ShiftDirection): MoveRecord {
  return { type, index, direction };
}

// Reverse of a move (for undo)
export function reverseMove(move: MoveRecord): MoveRecord {
  const opp: Record<ShiftDirection, ShiftDirection> = {
    left: 'right', right: 'left', up: 'down', down: 'up',
  };
  return { type: move.type, index: move.index, direction: opp[move.direction] };
}

// Validated row/col range
export function validIndex(i: number): boolean {
  return i >= 0 && i < GRID_SIZE;
}
