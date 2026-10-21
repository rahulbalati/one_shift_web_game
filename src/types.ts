// ─── Core puzzle types ────────────────────────────────────────────────────────

export type ShiftDirection = 'left' | 'right' | 'up' | 'down';
export type LineType = 'row' | 'col';

// A single shift of one row or column (linked lines follow automatically)
export interface MoveRecord {
  type: LineType;
  index: number;
  direction: ShiftDirection;
}

export interface LineLink {
  type: LineType;
  a: number;
  b: number;
}

// Board rules introduced world by world. Every rule still only uses row/column shifts.
export interface Rules {
  lockedRows: number[];
  lockedCols: number[];
  oneWayRows: Record<number, 'left' | 'right'>;
  oneWayCols: Record<number, 'up' | 'down'>;
  links: LineLink[];
}

export type PuzzleKind = 'numbers' | 'pattern';

export interface Puzzle {
  size: number;
  kind: PuzzleKind;
  // keys[tileId] = colour/number group that tile counts as
  keys: number[];
  // target[pos] = key that must end up at that position
  target: number[];
  // start[pos] = tileId placed there at the start
  start: number[];
  par: number;        // proven minimum number of moves
  limit: number;      // move limit (0 = unlimited)
  rules: Rules;
  patternName?: string;
}

export function makeMove(type: LineType, index: number, direction: ShiftDirection): MoveRecord {
  return { type, index, direction };
}

export const OPPOSITE: Record<ShiftDirection, ShiftDirection> = {
  left: 'right', right: 'left', up: 'down', down: 'up',
};

export function reverseMove(move: MoveRecord): MoveRecord {
  return { type: move.type, index: move.index, direction: OPPOSITE[move.direction] };
}
