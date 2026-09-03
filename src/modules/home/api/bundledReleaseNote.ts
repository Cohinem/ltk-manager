import { body, version } from "virtual:release-notes";

import type { ReleaseNote } from "@/lib/tauri";

/**
 * The installed version's notes, read from the build rather than the network.
 *
 * `null` for a build with no notes file of its own, which is what a
 * pre-release gets. The row carries no date: the feed's row for the same
 * version replaces it when the feed answers.
 */
export function bundledReleaseNote(): ReleaseNote | null {
  if (body.trim() === "") return null;

  return {
    version,
    tag: `v${version}`,
    body,
    publishedAt: null,
    prerelease: false,
    url: `https://github.com/LeagueToolkit/ltk-manager/releases/tag/v${version}`,
  };
}
