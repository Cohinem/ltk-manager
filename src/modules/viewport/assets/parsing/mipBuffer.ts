/**
 * The mip chain buffer the `ltk-asset` scheme answers `?as=mips` with.
 *
 * The layout is `crates/ltk-manager-assets/src/preview/mips.rs`'s module doc, and this is
 * the other half of it.
 */

import { BufferError, BufferReader } from "../utils/bufferReader";

/** `LTKT`, the word a mip chain buffer opens with. */
const MAGIC = 0x544b544c;

/** The layouts this build reads. */
const VERSIONS: readonly number[] = [2];

/** How every level of a chain is written: an RGBA PNG, or the file's own BC1 or BC3 blocks. */
export type MipEncoding = "png" | "bc1" | "bc3";

const ENCODINGS: readonly MipEncoding[] = ["png", "bc1", "bc3"];

/** One level of a texture's own mip chain, in the chain's encoding. */
export interface MipLevel {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array<ArrayBuffer>;
}

/** A texture's levels, widest first, and how they are written. */
export interface MipChain {
  readonly encoding: MipEncoding;
  readonly levels: readonly MipLevel[];
}

/**
 * A texture's levels out of the bytes the scheme answered, widest first.
 *
 * # Throws
 *
 * [`BufferError`] where the bytes are not a mip chain buffer this build reads, where a
 * length reaches past the bytes that arrived, where the encoding is unknown, or where the
 * chain has no level.
 */
export function readMipBuffer(bytes: ArrayBuffer): MipChain {
  const reader = new BufferReader(bytes);
  reader.header(MAGIC, VERSIONS, "mip chain");

  const count = reader.u32();
  if (count === 0) throw new BufferError("A mip chain buffer holds no level");
  const encoding = ENCODINGS[reader.u32()];
  if (encoding === undefined) throw new BufferError("A mip chain buffer names no known encoding");

  const levels: MipLevel[] = [];
  for (let level = 0; level < count; level += 1) {
    const width = reader.u32();
    const height = reader.u32();
    const data = reader.bytes(reader.u32());
    levels.push({ width, height, data });
  }
  if (!reader.done) throw new BufferError("A mip chain buffer runs past its last level");
  return { encoding, levels };
}
