/// <reference types="vite/client" />
/// <reference types="vite-plugin-svgr/client" />

/** The release notes file for the package version, resolved at build - see `scripts/vite-release-notes.ts`. */
declare module "virtual:release-notes" {
  /** The package version the build was made from. */
  export const version: string;
  /** The text of `docs/releases/<version>.md`, or empty where no file exists. */
  export const body: string;
}

interface ImportMetaEnv {
  /** Set to `1` in a dev run to seed the stand-in update - see `mockUpdate`. */
  readonly VITE_MOCK_UPDATE?: string;
}
