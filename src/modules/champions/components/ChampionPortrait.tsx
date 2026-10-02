import { ChampionIcon } from "@/components";
import { usePreviewUrl } from "@/lib/previewUrl";
import type { AssetRef, Champion } from "@/lib/tauri";
import { twMerge } from "@/utils";

/** The width a portrait is asked for at, twice the largest it is drawn for a sharp thumbnail. */
const PORTRAIT_WIDTH = 48;

export interface ChampionPortraitProps {
  /** Absent for a value no champion of the install answers to, which draws the helmet glyph. */
  readonly champion: Champion | undefined;
  /** Sizes the portrait, such as `size-4`. */
  readonly className: string;
}

/** A champion's base skin icon as a small circle. Decorative, since a label always names it. */
export function ChampionPortrait({ champion, className }: ChampionPortraitProps) {
  const asset = champion?.icon?.asset;
  if (asset == null) return <ChampionIcon className={twMerge("shrink-0", className)} />;

  return <PortraitImage asset={asset} className={className} />;
}

function PortraitImage({ asset, className }: { asset: AssetRef; className: string }) {
  const url = usePreviewUrl(asset, PORTRAIT_WIDTH);

  return (
    /* DS-RADIUS */
    <img
      src={url}
      alt=""
      loading="lazy"
      draggable={false}
      className={twMerge("shrink-0 rounded-full bg-surface-700 object-cover", className)}
    />
  );
}
