// ─── Color palette ───────────────────────────────────────────────────────────
export const COLORS = {
  bgDeep:       0x0a0f2e,   // deep navy
  bgPanel:      0x111836,   // slightly lighter panel
  bgCard:       0x0d1533,   // board background
  slot:         0x161f45,   // empty cell slot
  accent:       0x00d4aa,   // cyan accent
  accentHover:  0x00ffcc,
  arrowBg:      0x1e2d5a,
  arrowHover:   0x2a3d78,
  arrowStroke:  0x334d99,
  text:         0xdce8ff,
  textMuted:    0x7b8cc0,
  warning:      0xf5a623,
  danger:       0xff5d6c,
  panelBg:      0x080d24,
  panelBorder:  0x26366a,
  lock:         0x8a93b8,
  conveyor:     0xffc145,
  link:         0xff6fa5,
  white:        0xffffff,
  black:        0x000000,
} as const;

// Row colours for numbered tiles (tile colour = the row it belongs to)
export const ROW_COLORS = [0x2ec4b6, 0x8b7cf6, 0xff8a5c, 0xffc145, 0x5fa8ff];

// Colours for shape (pattern) tiles: base, pink, teal
export const PATTERN_COLORS = [0x4a5aa8, 0xff6fa5, 0x2ec4b6];

export const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');

export const FONT = "'Outfit', 'Plus Jakarta Sans', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

// ─── Animation timing ────────────────────────────────────────────────────────
export const SHIFT_ANIM_MS = 120;     // row/column slide

// ─── Shift Rush ──────────────────────────────────────────────────────────────
export const RUSH_START_MS = 45_000;
export const RUSH_BONUS_MS = 6_000;
export const RUSH_PERFECT_BONUS_MS = 2_000;
export const RUSH_MAX_MS = 60_000;

// ─── Scene keys ──────────────────────────────────────────────────────────────
export const SCENE = {
  BOOT: 'BootScene',
  GAME: 'GameScene',
  MAP:  'MapScene',
} as const;
