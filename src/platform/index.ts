// ─── Platform selection ───────────────────────────────────────────────────────
// __PLATFORM__ is replaced with a string literal at build time (vite.config.ts),
// so the unused branches and their adapter code are removed from each build:
// the CrazyGames zip contains no other platform's code, and vice versa.
//
// Adding a platform: create src/platform/<name>.ts implementing Platform, add a
// case here, add it to PLATFORMS in vite.config.ts and a build script.
import type { Platform } from './Platform.ts';
import { createCrazyGamesPlatform } from './crazygames.ts';
import { createWebPlatform } from './web.ts';

function select(): Platform {
  switch (__PLATFORM__) {
    case 'crazygames':
      return createCrazyGamesPlatform();
    default:
      return createWebPlatform();
  }
}

export const platform: Platform = select();
export type { Platform, BreakKind, Capabilities } from './Platform.ts';
