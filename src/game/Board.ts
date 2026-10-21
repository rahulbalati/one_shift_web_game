import type { MoveRecord, Puzzle, Rules } from '../types.ts';

// ─── Rules helpers ────────────────────────────────────────────────────────────
export function emptyRules(): Rules {
  return { lockedRows: [], lockedCols: [], oneWayRows: {}, oneWayCols: {}, links: [] };
}

export function hasRules(rules: Rules): boolean {
  return rules.lockedRows.length > 0 || rules.lockedCols.length > 0 ||
    Object.keys(rules.oneWayRows).length > 0 || Object.keys(rules.oneWayCols).length > 0 ||
    rules.links.length > 0;
}

export function isLocked(rules: Rules, type: 'row' | 'col', index: number): boolean {
  return type === 'row' ? rules.lockedRows.includes(index) : rules.lockedCols.includes(index);
}

export function oneWayDir(rules: Rules, type: 'row' | 'col', index: number): string | undefined {
  return type === 'row' ? rules.oneWayRows[index] : rules.oneWayCols[index];
}

export function linkedPartner(rules: Rules, type: 'row' | 'col', index: number): number | null {
  for (const l of rules.links) {
    if (l.type !== type) continue;
    if (l.a === index) return l.b;
    if (l.b === index) return l.a;
  }
  return null;
}

/** Whether the player is allowed to make this shift under the board rules. */
export function canMove(move: MoveRecord, rules: Rules): boolean {
  if (isLocked(rules, move.type, move.index)) return false;
  const ow = oneWayDir(rules, move.type, move.index);
  return !ow || ow === move.direction;
}

/** The lines a move actually shifts (itself plus any linked partner). */
export function linesFor(move: MoveRecord, rules: Rules): MoveRecord[] {
  const partner = linkedPartner(rules, move.type, move.index);
  return partner === null ? [move] : [move, { ...move, index: partner }];
}

/** Board positions covered by a row or column, in order. */
export function lineIndices(size: number, type: 'row' | 'col', index: number): number[] {
  const out: number[] = [];
  for (let k = 0; k < size; k++) out.push(type === 'row' ? index * size + k : k * size + index);
  return out;
}

function shiftInPlace<T>(arr: T[], size: number, move: MoveRecord): void {
  const idx = lineIndices(size, move.type, move.index);
  const vals = idx.map(i => arr[i]);
  const forward = move.direction === 'right' || move.direction === 'down';
  for (let k = 0; k < size; k++) {
    arr[idx[k]] = forward ? vals[(k - 1 + size) % size] : vals[(k + 1) % size];
  }
}

/** Apply a move (including linked lines). Returns a new array. Rules are NOT validated here. */
export function applyMove<T>(arr: T[], size: number, move: MoveRecord, rules: Rules): T[] {
  const next = arr.slice();
  for (const m of linesFor(move, rules)) shiftInPlace(next, size, m);
  return next;
}

/** Every legal move. With `dedupeLinks`, a linked pair counts once (for the solver). */
export function legalMoves(size: number, rules: Rules, dedupeLinks = false): MoveRecord[] {
  const out: MoveRecord[] = [];
  for (const type of ['row', 'col'] as const) {
    for (let i = 0; i < size; i++) {
      if (dedupeLinks) {
        const p = linkedPartner(rules, type, i);
        if (p !== null && p < i) continue;
      }
      const dirs = type === 'row' ? (['left', 'right'] as const) : (['up', 'down'] as const);
      for (const direction of dirs) {
        const m: MoveRecord = { type, index: i, direction };
        if (canMove(m, rules)) out.push(m);
      }
    }
  }
  return out;
}

// ─── Goal checks ──────────────────────────────────────────────────────────────
export function keysOf(board: number[], puzzle: Puzzle): number[] {
  return board.map(id => puzzle.keys[id]);
}

export function isCorrectAt(board: number[], puzzle: Puzzle, pos: number): boolean {
  return puzzle.keys[board[pos]] === puzzle.target[pos];
}

export function correctCount(board: number[], puzzle: Puzzle): number {
  let n = 0;
  for (let i = 0; i < board.length; i++) if (isCorrectAt(board, puzzle, i)) n++;
  return n;
}

export function isSolved(board: number[], puzzle: Puzzle): boolean {
  return correctCount(board, puzzle) === board.length;
}
