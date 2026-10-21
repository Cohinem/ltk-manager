import { globSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { paraglideVitePlugin } from "@inlang/paraglide-js";
import react from "@vitejs/plugin-react";
import svgr from "vite-plugin-svgr";
import { configDefaults, defineConfig } from "vitest/config";

import { releaseNotes } from "./scripts/vite-release-notes";
import { phosphorIconImports } from "./scripts/vitest-phosphor-imports";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const TEST_FILES = "src/**/*.test.{ts,tsx}";

/** Matches a test file that mocks, spies, fakes timers, stubs globals, reads `@/test/mocks` or needs a DOM. */
const NEEDS_ISOLATION =
  /vi\.(mock|doMock|hoisted|spyOn|useFakeTimers|stubGlobal|stubEnv)\b|@vitest-environment|@\/test\/mocks/;

/** Test files that can share one module registry per worker, which skips a re-import per file. */
const sharedFiles = globSync(TEST_FILES, { cwd: __dirname })
  .map((file) => file.replaceAll("\\", "/"))
  .filter((file) => !NEEDS_ISOLATION.test(readFileSync(path.join(__dirname, file), "utf8")));

export default defineConfig({
  plugins: [
    paraglideVitePlugin({ project: "./project.inlang" }),
    react({ compiler: true }),
    svgr(),
    releaseNotes(__dirname),
    phosphorIconImports(__dirname),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    coverage: {
      provider: "v8",
      exclude: [
        "src/routeTree.gen.ts",
        "src/lib/bindings.ts",
        "src/lib/ipc/**",
        "src/test/**",
        "**/*.config.*",
      ],
    },

    environment: "node",

    projects: [
      { extends: true, test: { name: "shared", include: sharedFiles, isolate: false } },
      {
        extends: true,
        test: {
          name: "isolated",
          include: [TEST_FILES, "scripts/**/*.test.mjs"],
          exclude: [...configDefaults.exclude, ...sharedFiles],
        },
      },
    ],

    experimental: { fsModuleCache: !process.env.CI },
  },
});
