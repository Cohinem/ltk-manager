/** `u0, v0, u1, v1`, normalized to a texture, v down. */
export type SpriteUv = readonly [number, number, number, number];

/** How many decoded pages stay held, the most recently drawn first. */
const HELD_PAGES = 12;

const pages = new Map<string, Promise<HTMLImageElement>>();

/**
 * The decoded image at `url`, loaded once however many thumbnails crop it. The scheme answers
 * `no-store`, so an `<img>` per thumbnail would read and decode a whole page per row.
 */
export function loadPage(url: string): Promise<HTMLImageElement> {
  const held = pages.get(url);
  if (held !== undefined) {
    pages.delete(url);
    pages.set(url, held);
    return held;
  }

  const loading = new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    /* The scheme allows any origin, and a canvas it draws into stays readable. */
    image.crossOrigin = "anonymous";
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`No image at ${url}`));
    image.src = url;
  });
  loading.catch(() => pages.delete(url));
  pages.set(url, loading);

  while (pages.size > HELD_PAGES) {
    const oldest = pages.keys().next().value;
    if (oldest === undefined) break;
    pages.delete(oldest);
  }
  return loading;
}

/**
 * Draw the part `uv` of `image` into `canvas`, as large as fits and centred, mirrored per axis
 * where `flip` says. The canvas is cleared first.
 */
export function drawSprite(
  canvas: HTMLCanvasElement,
  image: HTMLImageElement,
  uv: SpriteUv,
  flip: readonly [boolean, boolean] = [false, false],
): void {
  const context = canvas.getContext("2d");
  if (context === null) return;

  context.clearRect(0, 0, canvas.width, canvas.height);
  const [u0, v0, u1, v1] = uv;
  const sx = Math.min(u0, u1) * image.naturalWidth;
  const sy = Math.min(v0, v1) * image.naturalHeight;
  const sw = Math.abs(u1 - u0) * image.naturalWidth;
  const sh = Math.abs(v1 - v0) * image.naturalHeight;
  if (sw <= 0 || sh <= 0) return;

  const scale = Math.min(canvas.width / sw, canvas.height / sh);
  const dw = sw * scale;
  const dh = sh * scale;
  context.save();
  context.translate(canvas.width / 2, canvas.height / 2);
  context.scale(flip[0] ? -1 : 1, flip[1] ? -1 : 1);
  context.drawImage(image, sx, sy, sw, sh, -dw / 2, -dh / 2, dw, dh);
  context.restore();
}

/** The part `uv` of the image at `url` as a PNG data URL `size` pixels square. */
export async function spriteDataUrl(
  url: string,
  uv: SpriteUv,
  size: number,
  flip?: readonly [boolean, boolean],
): Promise<string> {
  const image = await loadPage(url);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  drawSprite(canvas, image, uv, flip);
  return canvas.toDataURL("image/png");
}
