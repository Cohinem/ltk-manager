import { CubeTexture } from "three";

/** The faces a cube map holds. */
const CUBE_FACES = 6;

/** A decode that keeps the file's bytes, neither premultiplied nor colour managed. */
const RAW: ImageBitmapOptions = { premultiplyAlpha: "none", colorSpaceConversion: "none" };

/**
 * The cube map `previewCubeUrl` answers, six square faces stacked top to bottom.
 *
 * Cut into bitmaps rather than drawn through a canvas, which would premultiply the alpha
 * and lose the colour under a transparent texel. Null for a map the scheme cannot answer.
 */
export async function loadCubeTexture(url: string): Promise<CubeTexture | null> {
  const answer = await fetch(url);
  if (!answer.ok) return null;

  const strip = await createImageBitmap(await answer.blob(), RAW);
  const size = strip.width;
  const faces = await Promise.all(
    Array.from({ length: CUBE_FACES }, (_, face) =>
      createImageBitmap(strip, 0, face * size, size, size, RAW),
    ),
  );
  strip.close();

  const cube = new CubeTexture(faces);
  cube.generateMipmaps = false;
  cube.needsUpdate = true;
  return cube;
}
