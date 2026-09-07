import { mergeConfig, type Plugin } from "vite";

import base from "./vite.config";

/**
 * Fork-only config for `preview:web`, the browser-hosted preview of the Tauri
 * UI. Injects the browser mock before the app entry so every Tauri API is
 * stubbed before anything reads it, keeping upstream's `vite.config.ts` and
 * `src/main.tsx` untouched. The real Tauri build never runs this config, so
 * the mock stays out of its bundle.
 */
function browserMock(): Plugin {
  return {
    name: "ltk-fork:browser-mock",
    transformIndexHtml: {
      order: "pre",
      handler() {
        return [
          {
            tag: "script",
            attrs: { type: "module", src: "/src/lib/browserMock.ts" },
            /* Module scripts execute in document order, so head-prepend runs
            the shim before the entry imports. */
            injectTo: "head-prepend",
          },
        ];
      },
    },
  };
}

export default mergeConfig(base, {
  plugins: [browserMock()],
});
