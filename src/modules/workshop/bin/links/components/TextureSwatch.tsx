import { type MouseEvent as ReactMouseEvent, useState } from "react";

import { Popover, Properties, Property, Spinner } from "@/components";
import { m } from "@/i18n";
import type { AssetRef, TextureInfo, WorkshopFileKind } from "@/lib/tauri";
import { usePreviewCheckered } from "@/stores";
import { twMerge } from "@/utils";

import type { OpenIntent } from "../../../palette/utils/types";
import { useAssetInfo } from "../../../preview/api/useAssetInfo";
import { CHECKERBOARD } from "../../../preview/components/ImagePreview";
import { useImageSlot } from "../../../preview/hooks/useImageSlot";
import { assetArchive, usePreviewUrl } from "../../../preview/utils/assetRef";
import { clickIntent } from "../../../state";
import { KindBadge } from "../../values/components/KindBadge";

/** The `w` a row swatch asks for: the mipmap that covers 20px, and reads on a 2x display. */
export const SWATCH_WIDTH = 32;

/** The `w` a tile asks for: the mipmap that covers 48px, and reads on a 2x display. */
export const TILE_WIDTH = 96;

/** The `w` a card's square asks for: the mipmap that covers its 148px, at 2x. */
export const SQUARE_WIDTH = 320;

/** How big the swatch is drawn, and which mipmap that asks for. */
const SIZES = {
  row: { box: "size-5", width: SWATCH_WIDTH },
  tile: { box: "size-12", width: TILE_WIDTH },
  card: { box: "aspect-square w-full", width: SQUARE_WIDTH },
} as const;

/** The `w` the hover card asks for, and the card's own width. */
export const CARD_WIDTH = 256;

/** Hover for this long opens the card, the tooltip delay. */
const CARD_DELAY = 600;

interface TextureSwatchProps {
  asset: AssetRef;
  /** The chunk's path as the tables name it. */
  path: string;
  /** The kind the badge takes where the pixels fail to arrive. */
  fileKind: WorkshopFileKind;
  /** The layer's title, for the card of a layer's copy. */
  layerTitle?: string;
  /** The room it takes: a row's height, a sampler's 48px tile, or a card's own square. */
  size?: keyof typeof SIZES;
  onOpen: (intent: OpenIntent) => void;
}

/**
 * A texture's pixels at row height after its `file` chip, per "A WAD chunk link" in
 * docs/ux/BIN_EDITOR.md.
 *
 * The swatch opens the preview as the chip does, and a hover opens the card. A
 * texture the protocol cannot draw falls back to its kind badge.
 */
export function TextureSwatch({
  asset,
  path,
  fileKind,
  layerTitle,
  size = "row",
  onOpen,
}: TextureSwatchProps) {
  const url = usePreviewUrl(asset, SIZES[size].width);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const slot = useImageSlot(url, {
    lane: "tile",
    archive: assetArchive(asset),
  });

  if (failedUrl === url) return <KindBadge fileKind={fileKind} />;

  const button = (
    <button
      type="button"
      data-ui="TextureSwatch"
      aria-label={m.workshop_bin_texture_swatch_label()}
      /* DS-VEIL, DS-HOVER */
      className={twMerge(
        "shrink-0 cursor-pointer overflow-hidden rounded-sm border border-surface-veil-strong bg-surface-veil-soft hover:border-accent-hover",
        SIZES[size].box,
      )}
      onClick={(event: ReactMouseEvent<HTMLButtonElement>) => {
        event.stopPropagation();
        onOpen(clickIntent(event));
      }}
    >
      {slot.src !== undefined && (
        <img
          src={slot.src}
          alt=""
          draggable={false}
          onLoad={slot.onSettled}
          onError={() => {
            slot.onSettled();
            setFailedUrl(url);
          }}
          className="size-full object-cover"
        />
      )}
    </button>
  );

  return (
    <Popover.Root>
      <Popover.Trigger openOnHover delay={CARD_DELAY} render={button} />
      <Popover.Content
        side="bottom"
        align="start"
        sideOffset={6}
        aria-label={path}
        className="p-3 text-meta select-none"
      >
        <TextureCard asset={asset} path={path} layerTitle={layerTitle} />
      </Popover.Content>
    </Popover.Root>
  );
}

type TextureCardProps = Pick<TextureSwatchProps, "asset" | "path" | "layerTitle">;

/** The texture at 256px over the checkerboard, its path, and the facts its header declares. */
function TextureCard({ asset, path, layerTitle }: TextureCardProps) {
  const info = useAssetInfo(asset);
  const checkered = usePreviewCheckered();
  const url = usePreviewUrl(asset, CARD_WIDTH);
  const slot = useImageSlot(url, {
    lane: "tile",
    archive: assetArchive(asset),
  });
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  const loaded = loadedUrl === url;
  const texture = info.data?.kind === "texture" ? info.data : null;

  return (
    <div data-ui="TextureSwatch:card" className="flex w-64 flex-col gap-2">
      <div
        className={twMerge(
          "relative grid size-64 place-items-center overflow-hidden rounded-sm bg-surface-950/40",
          checkered && CHECKERBOARD,
          checkered && "[background-size:16px_16px]",
        )}
      >
        {slot.src !== undefined && (
          <img
            src={slot.src}
            alt={path}
            draggable={false}
            onLoad={() => {
              slot.onSettled();
              setLoadedUrl(url);
            }}
            onError={slot.onSettled}
            className={twMerge("max-h-full max-w-full object-contain", !loaded && "invisible")}
          />
        )}
        {!loaded && <Spinner size={16} className="absolute" />}
      </div>
      <span className="truncate font-mono text-code text-surface-100 select-text">{path}</span>
      {texture && <TextureFacts texture={texture} asset={asset} layerTitle={layerTitle} />}
    </div>
  );
}

interface TextureFactsProps {
  texture: TextureInfo;
  asset: AssetRef;
  layerTitle?: string;
}

function TextureFacts({ texture, asset, layerTitle }: TextureFactsProps) {
  const { container, format } = texture;
  return (
    <Properties>
      <Property label={m.workshop_bin_texture_size_label()} className="select-text">
        {m.workshop_bin_texture_dimensions_label({ width: texture.width, height: texture.height })}
      </Property>
      <Property label={m.workshop_bin_texture_format_label()} className="select-text">
        {format === null && container}
        {format !== null && m.workshop_bin_texture_container_format_label({ container, format })}
      </Property>
      <Property label={m.workshop_bin_texture_mips_label()} className="select-text">
        {texture.mipCount}
      </Property>
      {asset.kind === "gameChunk" && (
        <Property
          label={m.workshop_bin_archive_label()}
          className="truncate font-mono text-code select-text"
        >
          {asset.wad}
        </Property>
      )}
      {asset.kind === "layer" && layerTitle !== undefined && (
        <Property label={m.workshop_bin_layer_label()} className="truncate select-text">
          {layerTitle}
        </Property>
      )}
    </Properties>
  );
}
