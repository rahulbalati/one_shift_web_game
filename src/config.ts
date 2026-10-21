// ─── Color palette: "Gem Workshop" theme ─────────────────────────────────────
export const COLORS = {
  bgDeep:       0x24164f,   // page / scene background (violet)
  bgPanel:      0x2e1f66,   // raised panels
  bgCard:       0x1b1240,   // board well
  slot:         0x2a1d5c,   // empty cell slot
  accent:       0x2fd3c0,   // teal accent / primary buttons
  accentHover:  0x7ff0e0,
  accentShadow: 0x1a8f82,
  onAccent:     0x06302b,   // text on teal
  arrowBg:      0x3a2a7a,   // button face
  arrowHover:   0x4a3892,
  arrowStroke:  0x22184d,   // button shadow / outline
  text:         0xf3eaff,
  textMuted:    0xcbb9ff,
  warning:      0xffc43d,   // gold: stars, hint
  warningShadow:0xb8860b,
  onWarning:    0x3a2400,
  danger:       0xff5d6c,
  panelBg:      0x2e1f66,
  panelBorder:  0x1b1240,
  tileText:     0x1b1240,
  lock:         0x9aa3c7,
  conveyor:     0xf5b52e,
  link:         0xff6fa5,
  white:        0xffffff,
  black:        0x000000,
} as const;

/** Background colour as RGB, for camera fades. */
export const BG_RGB: [number, number, number] = [0x24, 0x16, 0x4f];

// Row colours for numbered tiles (tile colour = the row it belongs to)
export const ROW_COLORS = [0x2fd3c0, 0xa77bff, 0xff9a6b, 0xffc43d, 0x5fa8ff];

// Colours for shape (pattern) tiles: base, pink, teal
export const PATTERN_COLORS = [0x5a4aa8, 0xff6fa5, 0x2fd3c0];

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
