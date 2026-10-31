import type { AssetInfo, AudioContainer, WorkshopFileKind } from "@/lib/tauri";

/** What follows a `file` chip. */
export type FileLinkMark =
  | {
      /** The target is a texture. A swatch at row height, and the card on hover. */
      readonly kind: "swatch";
    }
  | {
      /** The target is any other kind, drawn as its kind badge. */
      readonly kind: "badge";
      readonly fileKind: WorkshopFileKind;
    }
  | {
      /** The name has no extension and the bytes are unanswered. */
      readonly kind: "pending";
    };

const SWATCH: FileLinkMark = { kind: "swatch" };
const PENDING: FileLinkMark = { kind: "pending" };

/**
 * The mark for a `file` link whose extension names `named`.
 *
 * `sniffed` is what the bytes say about a name with no extension: absent while
 * unasked, and null where the read failed.
 */
export function fileLinkMark(
  named: WorkshopFileKind,
  sniffed: AssetInfo | null | undefined,
): FileLinkMark {
  if (isTexture(named)) return SWATCH;
  if (named !== "unknown") return { kind: "badge", fileKind: named };
  if (sniffed === undefined) return PENDING;
  if (sniffed === null) return { kind: "badge", fileKind: "unknown" };
  if (sniffed.kind === "texture") return SWATCH;
  if (sniffed.kind === "web") {
    return { kind: "badge", fileKind: sniffed.format === "svg" ? "svg" : "unknown" };
  }
  if (sniffed.kind === "audio") return { kind: "badge", fileKind: AUDIO_KINDS[sniffed.container] };
  return { kind: "badge", fileKind: sniffed.fileKind };
}

const AUDIO_KINDS: Record<AudioContainer, WorkshopFileKind> = {
  package: "wwise_package",
  bank: "wwise_bank",
  media: "wwise_media",
};

function isTexture(kind: WorkshopFileKind): boolean {
  return kind === "texture" || kind === "texture_dds";
}
