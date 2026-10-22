import { defineConfig } from 'vite';
import type { Plugin } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// ─── Platforms ────────────────────────────────────────────────────────────────
// One codebase, one build per platform. Pick with --mode, e.g.
//   vite build --mode web
// Plain `vite` / `vite build` (modes development/production) build CrazyGames.
// `sdk` is injected at <!-- PLATFORM_SDK --> in index.html for that platform only.
const PLATFORMS: Record<string, { sdk: string }> = {
  crazygames: {
    sdk: '<script src="https://sdk.crazygames.com/crazygames-sdk-v3.js"></script>',
  },
  web: {
    sdk: '',
  },
};
const DEFAULT_PLATFORM = 'crazygames';

function platformHtml(name: string): Plugin {
  return {
    name: 'platform-html',
    transformIndexHtml(html) {
      return html.replace('<!-- PLATFORM_SDK -->', PLATFORMS[name].sdk);
    },
  };
}

export default defineConfig(({ mode }) => {
  const platform = mode in PLATFORMS ? mode : DEFAULT_PLATFORM;
  return {
    base: './',
    plugins: [platformHtml(platform), viteSingleFile()],
    define: {
      __PLATFORM__: JSON.stringify(platform),
    },
    build: {
      outDir: `dist/${platform}`,
      emptyOutDir: true,
      target: 'es2020',
      cssCodeSplit: false,
      assetsInlineLimit: 100000000,
      reportCompressedSize: true,
    },
    server: {
      port: 5173,
    },
  };
});
