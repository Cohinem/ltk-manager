/** The last segment of a path, whichever slash it uses, or the path when it has none. */
export function basename(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).at(-1) ?? path;
}

const VERBATIM_PREFIX = /^(\\\\\?\\|\/\/\?\/)/;

/**
 * `path` as a reader sees it: forward slashes, without the `\\?\` prefix.
 *
 * The backend's `slashed`, for a path that never crossed IPC, such as a
 * setting the picker filled.
 */
export function slashed(path: string): string {
  return path.replace(VERBATIM_PREFIX, "").replace(/\\/g, "/");
}
