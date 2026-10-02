/** The bytes of an RGBA texel a read hands back. */
const TEXEL_BYTES = 4;

/** The largest id the three colour bytes of one texel carry. */
export const MOST_PICK_ID = 0xffffff;

/** The colour pick id `id` draws as, one byte of it per channel, low byte in red. */
export function pickColor(id: number): [number, number, number] {
  return [(id & 0xff) / 255, ((id >> 8) & 0xff) / 255, ((id >> 16) & 0xff) / 255];
}

/** The pick id the texel at `texel` of a read carries, and 0 for one nothing drew. */
export function pickIdAt(pixels: Uint8Array, texel: number): number {
  const at = texel * TEXEL_BYTES;
  return pixels[at] | (pixels[at + 1] << 8) | (pixels[at + 2] << 16);
}

/** The id drawn nearest the middle of a `size` by `size` read, and 0 where nothing drew. */
export function nearestPick(pixels: Uint8Array, size: number): number {
  const middle = (size - 1) / 2;
  let nearest = 0;
  let least = Number.POSITIVE_INFINITY;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const id = pickIdAt(pixels, y * size + x);
      const reach = (x - middle) ** 2 + (y - middle) ** 2;
      if (id === 0 || reach >= least) continue;

      nearest = id;
      least = reach;
    }
  }

  return nearest;
}
