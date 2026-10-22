// Small helpers shared by platform adapters (no game code, no SDKs).

export function safe<T>(fn: () => T): T | undefined {
  try { return fn(); } catch (_) { return undefined; }
}

/** localStorage that never throws (private mode, sandboxed iframes, blocked storage). */
export const localStore = {
  get(key: string): string | null {
    return safe(() => localStorage.getItem(key)) ?? null;
  },
  set(key: string, value: string): void {
    safe(() => localStorage.setItem(key, value));
  },
};

/** Touch-first device according to the browser (coarse pointer). */
export function browserIsTouch(): boolean {
  return safe(() => window.matchMedia('(pointer: coarse)').matches) ?? false;
}

/** Simple listener list. */
export class Listeners<T> {
  private list: ((value: T) => void)[] = [];
  add(cb: (value: T) => void): void {
    this.list.push(cb);
  }
  emit(value: T): void {
    for (const cb of this.list) safe(() => cb(value));
  }
}
