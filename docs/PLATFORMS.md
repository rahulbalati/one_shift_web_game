# Platforms

ONE SHIFT is one game built for several platforms from a single codebase. The
platform is chosen when you build, not by branch.

## Build commands

| Command | Output |
|---|---|
| `npm run dev` | Dev server, CrazyGames platform (default) |
| `npm run dev:web` | Dev server, plain web platform (no SDK) |
| `npm run build:crazygames` | `dist/crazygames/` |
| `npm run build:web` | `dist/web/` |
| `npm run pack:zip` | `one-shift-playable.zip` (CrazyGames upload) |
| `npm run release` | `release/one-shift-<platform>.zip` for every platform |

Each build contains only its own platform code and SDK script.

## How it fits together

```
src/
  game/ scenes/ ui/ audio/   the game: never imports an SDK
  platform/
    Platform.ts              the contract every platform implements
    index.ts                 picks the platform at build time
    web.ts                   default: no SDK, browser saves, no ads
    crazygames.ts            CrazyGames SDK v3
```

The game calls `platform.*` (for example `platform.gameplayStart()`,
`platform.breakPoint('levelEnd', …)`, `platform.getItem(…)`). Each platform
decides what those moments mean. `main.ts` is the only place where platform
signals (mute, ads) are connected to the game's audio.

## Rules

1. Only files in `src/platform/` may touch a platform SDK.
2. Platform files never import game code; they report back through
   `onMuteChange` / `onAdChange`.
3. Game code never asks which platform it is on. Differences are
   `Capabilities` (`startScreen`, `cloudSave`, `platformMute`, `ads`) with safe
   defaults.
4. If a new platform seems to need a change in game code, the contract is
   missing something: add a capability or a break-point kind with a safe
   default instead.

## Adding a platform

1. Create `src/platform/<name>.ts` implementing `Platform` (start from `web.ts`).
2. Add a `case` in `src/platform/index.ts` and the name to `PlatformName`.
3. Add it to `PLATFORMS` in `vite.config.ts` (its SDK `<script>` tag, if any).
4. Add `build:<name>` and `pack:<name>` scripts and include it in `release`.
5. Run the full test pass against the new build.
