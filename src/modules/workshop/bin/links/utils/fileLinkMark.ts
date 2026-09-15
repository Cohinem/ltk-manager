import type { AssetInfo, WorkshopFileKind } from "@/lib/tauri";

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
  return { kind: "badge", fileKind: sniffed.fileKind };
}

function isTexture(kind: WorkshopFileKind): boolean {
  return kind === "texture" || kind === "texture_dds";
}
