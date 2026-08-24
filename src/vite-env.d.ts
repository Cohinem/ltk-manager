/// <reference types="vite/client" />
/// <reference types="vite-plugin-svgr/client" />

interface ImportMetaEnv {
  /** Set to `1` in a dev run to seed the stand-in update - see `mockUpdate`. */
  readonly VITE_MOCK_UPDATE?: string;
}
