import { applyMove, legalMoves } from './Board.ts';
import type { MoveRecord, Rules } from '../types.ts';
import { OPPOSITE } from '../types.ts';

// Exact shortest-path solver (bidirectional BFS) over key-states.
// Used to prove each level's par, to generate levels of an exact difficulty,
// and to give hints that are always the best next move.

interface Node { key: string; state: number[] }
type Parent = { prev: string; move: number; depth: number } | null;

function encode(state: number[]): string {
  return String.fromCharCode(...state.map(v => v + 48));
}

/**
 * Shortest sequence of legal moves turning `start` into `goal`, or null when
 * no solution exists within `maxDepth` moves.
 */
export function solve(
  start: number[],
  goal: number[],
  size: number,
  rules: Rules,
  maxDepth: number,
): MoveRecord[] | null {
  const sKey = encode(start);
  const gKey = encode(goal);
  if (sKey === gKey) return [];

  const moves = legalMoves(size, rules, true);
  const inverse = moves.map(m => ({ ...m, direction: OPPOSITE[m.direction] }));

  const fSeen = new Map<string, Parent>([[sKey, null]]);
  const bSeen = new Map<string, Parent>([[gKey, null]]);
  let fFront: Node[] = [{ key: sKey, state: start }];
  let bFront: Node[] = [{ key: gKey, state: goal }];
  let fDepth = 0;
  let bDepth = 0;

  const depthIn = (seen: Map<string, Parent>, key: string) => seen.get(key)?.depth ?? 0;

  while (fDepth + bDepth < maxDepth && fFront.length && bFront.length) {
    const forward = fFront.length <= bFront.length;
    const seen = forward ? fSeen : bSeen;
    const other = forward ? bSeen : fSeen;
    const list = forward ? moves : inverse;
    const nextDepth = (forward ? fDepth : bDepth) + 1;
    const next: Node[] = [];
    let bestMeet: string | null = null;
    let bestLen = Infinity;

    for (const node of forward ? fFront : bFront) {
      for (let i = 0; i < list.length; i++) {
        const state = applyMove(node.state, size, list[i], rules);
        const key = encode(state);
        if (seen.has(key)) continue;
        seen.set(key, { prev: node.key, move: i, depth: nextDepth });
        if (other.has(key)) {
          const len = nextDepth + depthIn(other, key);
          if (len < bestLen) { bestLen = len; bestMeet = key; }
        }
        next.push({ key, state });
      }
    }

    if (bestMeet !== null) {
      if (bestLen > maxDepth) return null;
      return buildPath(bestMeet, fSeen, bSeen, moves);
    }

    if (forward) { fFront = next; fDepth = nextDepth; } else { bFront = next; bDepth = nextDepth; }
  }
  return null;
}

function buildPath(
  meet: string,
  fSeen: Map<string, Parent>,
  bSeen: Map<string, Parent>,
  moves: MoveRecord[],
): MoveRecord[] {
  const head: MoveRecord[] = [];
  let key = meet;
  let p = fSeen.get(key);
  while (p) {
    head.push(moves[p.move]);
    key = p.prev;
    p = fSeen.get(key);
  }
  head.reverse();

  // A backward entry "prev --inverse[i]--> key" means "key --moves[i]--> prev"
  const tail: MoveRecord[] = [];
  key = meet;
  p = bSeen.get(key);
  while (p) {
    tail.push(moves[p.move]);
    key = p.prev;
    p = bSeen.get(key);
  }
  return [...head, ...tail];
}
