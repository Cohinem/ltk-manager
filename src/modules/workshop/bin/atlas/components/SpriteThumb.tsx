import { useEffect, useRef, useState } from "react";

import { usePreviewUrl } from "@/lib/previewUrl";
import type { AssetRef } from "@/lib/tauri";
import { twMerge } from "@/utils";

import { drawSprite, loadPage, type SpriteUv } from "../utils/spriteImages";

export interface SpriteThumbProps {
  /** The texture the sprite sits on. */
  readonly asset: AssetRef;
  readonly uv: SpriteUv;
  readonly flip?: readonly [boolean, boolean];
  /** The drawn size in CSS pixels, square. */
  readonly size: number;
  readonly className?: string;
}

/**
 * One sprite at thumbnail size: its part of its texture, as large as fits the square and
 * centred. The texture loads once for every thumbnail that crops it (`loadPage`), and a texture
 * that fails to load leaves the square empty.
 */
export function SpriteThumb({ asset, uv, flip, size, className }: SpriteThumbProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const url = usePreviewUrl(asset);
  const [u0, v0, u1, v1] = uv;
  const [flipX, flipY] = flip ?? [false, false];
  const [pixels] = useState(() => Math.ceil(size * Math.min(window.devicePixelRatio, 2)));

  useEffect(() => {
    let live = true;
    loadPage(url)
      .then((image) => {
        if (live && canvas.current !== null) {
          drawSprite(canvas.current, image, [u0, v0, u1, v1], [flipX, flipY]);
        }
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [url, u0, v0, u1, v1, flipX, flipY]);

  return (
    <canvas
      ref={canvas}
      aria-hidden
      width={pixels}
      height={pixels}
      className={twMerge("shrink-0", className)}
      style={{ width: size, height: size }}
    />
  );
}
