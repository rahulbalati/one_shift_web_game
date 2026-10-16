// ─── Layout constants ────────────────────────────────────────────────────────
export const GRID_SIZE = 4;
export const TILE_COUNT = GRID_SIZE * GRID_SIZE;

// Design: portrait-first virtual resolution (Scale.FIT auto-scales to any screen/embed)
export const BASE_WIDTH  = 460;
export const BASE_HEIGHT = 760;

// Grid layout (calculated relative to BASE_WIDTH/HEIGHT)
export const GRID_COLS = 4;
export const GRID_ROWS = 4;
export const TILE_SIZE = 78;          // px for each tile
export const TILE_GAP  = 6;           // gap between tiles
export const GRID_TOTAL = GRID_COLS * (TILE_SIZE + TILE_GAP) - TILE_GAP; // 330
export const GRID_X = (BASE_WIDTH - GRID_TOTAL) / 2;   // (460 - 330) / 2 = 65
export const GRID_Y = 246;            // grid top edge

// Arrow button layout
export const ARROW_SIZE  = 40;
export const ARROW_MARGIN = 10;

// ─── Color palette ───────────────────────────────────────────────────────────
export const COLORS = {
  bgDeep:       0x0a0f2e,   // deep navy
  bgPanel:      0x111836,   // slightly lighter panel
  bgCard:       0x0d1533,   // tile background area
  tile:         0x1a2550,   // default tile face
  tileSolved:   0x0e3a5a,   // tile when in correct position
  tileText:     0xe0eaff,   // tile number text
  tileSolvedTxt:0x5df5c9,   // text on solved tile
  accent:       0x00d4aa,   // cyan accent
  accentDark:   0x007a62,   // darker accent
  accentHover:  0x00ffcc,   // bright hover
  arrowBg:      0x1e2d5a,   // arrow button normal bg
  arrowHover:   0x253a78,   // arrow hover bg
  arrowStroke:  0x334d99,   // arrow border
  text:         0xdce8ff,   // general text
  textMuted:    0x6b7db3,   // muted text
  textAccent:   0x00d4aa,   // accent text
  success:      0x00d4aa,
  warning:      0xf5a623,
  panelBg:      0x080d24,   // dark overlay panels
  panelBorder:  0x1e2d5a,
  white:        0xffffff,
  black:        0x000000,
  shadow:       0x000000,
} as const;

// ─── Game parameters ─────────────────────────────────────────────────────────
export const BASE_SCRAMBLE_MOVES = 20;
export const SCRAMBLE_INCREASE_PER_LEVEL = 3;
export const MAX_SCRAMBLE_MOVES = 60;

// ─── Animation timing ────────────────────────────────────────────────────────
export const SHIFT_ANIM_DURATION = 110;   // ms for a row/column shift tween (buttery & responsive)
export const VICTORY_ANIM_DURATION = 600;

// ─── Scene keys ──────────────────────────────────────────────────────────────
export const SCENE = {
  BOOT:    'BootScene',
  GAME:    'GameScene',
  VICTORY: 'VictoryScene',
} as const;
