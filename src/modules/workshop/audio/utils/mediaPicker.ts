import type { MediaContainer, MediaLocation, MediaRow, SetFile, SoundStream } from "@/lib/tauri";

import { fileName, unitFileKind } from "./bankUnits";

/** The media rows of one file of a bank set. */
export interface SetFileMedia {
  readonly file: SetFile;
  readonly media: readonly MediaRow[];
}

/** One media that a sound's source can point at, with the name of the file that holds it. */
export interface MediaCandidate {
  readonly media: MediaLocation;
  /** The file name of the file that holds the media. */
  readonly name: string;
}

/** The most media that the picker lists for one query. */
const PICKER_LIMIT = 50;

/** Returns the container that a sound of `stream` reads its media from, or null if none. */
function containerOf(stream: SoundStream): MediaContainer | null {
  if (stream === "dataBank") return "bank";
  if (stream === "streaming") return "package";

  return null;
}

/**
 * Returns the media of `files` that a sound of `stream` can play, each source ID once.
 *
 * A sound of a bank's media index takes the media of the banks, and a streamed sound the media of
 * the packages. A prefetched sound takes none, as its media is in two files. A source ID that two
 * files hold comes from the first of them.
 */
export function mediaCandidates(
  files: readonly SetFileMedia[],
  stream: SoundStream,
): MediaCandidate[] {
  const container = containerOf(stream);
  if (container === null) return [];

  const seen = new Set<number>();
  const candidates: MediaCandidate[] = [];
  for (const { file, media } of files) {
    const held: MediaContainer = unitFileKind(file.path) === "package" ? "package" : "bank";
    if (file.asset === null || held !== container) continue;

    for (const row of media) {
      if (seen.has(row.sourceId)) continue;

      seen.add(row.sourceId);
      candidates.push({
        media: { asset: file.asset, path: file.path, source: row.sourceId, container },
        name: fileName(file.path),
      });
    }
  }
  return candidates;
}

/**
 * Returns the candidates whose decimal source ID or file name contains `query`, without regard to
 * case, leaving out the source `current`.
 *
 * Returns the first fifty, in the order of `candidates`.
 */
export function matchingMedia(
  candidates: readonly MediaCandidate[],
  query: string,
  current: number,
): MediaCandidate[] {
  const needle = query.trim().replace(/^#/, "").toLowerCase();
  const matches: MediaCandidate[] = [];
  for (const candidate of candidates) {
    if (candidate.media.source === current) continue;

    const found =
      needle === "" ||
      String(candidate.media.source).includes(needle) ||
      candidate.name.toLowerCase().includes(needle);
    if (!found) continue;

    matches.push(candidate);
    if (matches.length === PICKER_LIMIT) break;
  }
  return matches;
}
