import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import type { Plugin } from "vite";

const MODULE_ID = "virtual:release-notes";
const RESOLVED_ID = `\0${MODULE_ID}`;

/**
 * The release notes for the package version, as a virtual module.
 *
 * `docs/releases/<version>.md` is what `release.yml` publishes as the release
 * body, so bundling the same file is what lets Home draw the installed
 * version's notes with no network. A version with no file, such as a
 * pre-release, resolves to an empty body.
 */
export function releaseNotes(root: string): Plugin {
  return {
    name: "ltk-release-notes",
    resolveId(id) {
      if (id === MODULE_ID) return RESOLVED_ID;
    },
    load(id) {
      if (id !== RESOLVED_ID) return;

      const manifest = path.join(root, "package.json");
      const { version } = JSON.parse(readFileSync(manifest, "utf8")) as { version: string };
      const file = path.join(root, "docs", "releases", `${version}.md`);
      this.addWatchFile(file);
      const body = existsSync(file) ? readFileSync(file, "utf8") : "";

      return [
        `export const version = ${JSON.stringify(version)};`,
        `export const body = ${JSON.stringify(body)};`,
        "",
      ].join("\n");
    },
  };
}
