/**
 * The mip chain buffer the `ltk-asset` scheme answers `?as=mips` with.
 *
 * The layout is `crates/ltk-manager-core/src/preview/mips.rs`'s module doc, and this is
 * the other half of it.
 */

import { BufferError, BufferReader } from "../utils/bufferReader";

/** `LTKT`, the word a mip chain buffer opens with. */
const MAGIC = 0x544b544c;

/** The layouts this build reads. */
const VERSIONS: readonly number[] = [1];

/** One level of a texture's own mip chain, as the PNG the backend encoded it in. */
export interface MipLevel {
  readonly width: number;
  readonly height: number;
  readonly png: Uint8Array<ArrayBuffer>;
}

/**
 * A texture's levels out of the bytes the scheme answered, widest first.
 *
 * # Throws
 *
 * [`BufferError`] where the bytes are not a mip chain buffer this build reads, where a
 * length reaches past the bytes that arrived, or where the chain has no level.
 */
export function readMipBuffer(bytes: ArrayBuffer): MipLevel[] {
  const reader = new BufferReader(bytes);
  reader.header(MAGIC, VERSIONS, "mip chain");

  const count = reader.u32();
  if (count === 0) throw new BufferError("A mip chain buffer holds no level");
  const levels: MipLevel[] = [];
  for (let level = 0; level < count; level += 1) {
    const width = reader.u32();
    const height = reader.u32();
    const png = reader.bytes(reader.u32());
    levels.push({ width, height, png });
  }
  if (!reader.done) throw new BufferError("A mip chain buffer runs past its last level");
  return levels;
}
