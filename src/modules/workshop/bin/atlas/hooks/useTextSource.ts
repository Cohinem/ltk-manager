import { useQueries, useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ClampToEdgeWrapping, NoColorSpace, type Texture } from "three";

import type { AssetRef } from "@/lib/tauri";
import { useAssetTextures } from "@/modules/viewport";

import { uiQueries } from "../api/uiQueries";
import type { View, ViewFont, ViewStyleSheet, ViewTextIcon } from "../engine/model/view";
import { faceOf } from "../engine/text/sizing";
import type { TextSource } from "../engine/text/source";
import { assetKey, type LoadedFont } from "../rendering/text/fontFiles";
import { GlyphCache, type GlyphPage } from "../rendering/text/glyphCache";

const NO_STRINGS: ReadonlyMap<string, string> = new Map();

/** The game's text of every `TRAKey` the view's texts and combo box labels name. */
export function useViewStrings(view: View | null): ReadonlyMap<string, string> {
  const keys = useMemo(() => {
    const held = new Set<string>();
    for (const element of view?.elements ?? []) {
      if (element.look.kind === "text" && element.look.traKey !== "") held.add(element.look.traKey);
    }
    for (const combo of view?.comboBoxes ?? []) {
      if (combo.labelKey !== null) held.add(combo.labelKey);
    }
    return [...held].sort();
  }, [view]);
  const read = useQuery({ ...uiQueries.strings(keys), enabled: keys.length > 0 }).data;

  return useMemo(() => (read === undefined ? NO_STRINGS : new Map(Object.entries(read))), [read]);
}

/** What a frame's texts draw from, and the glyph pages and textures its draws sample. */
export interface TextSources {
  readonly source: TextSource;
  /** Uploads the glyph pages the last build rasterized into. */
  readonly flush: () => void;
  readonly glyphPage: (page: number) => GlyphPage | undefined;
  readonly textTextures: ReadonlyMap<string, Texture>;
}

/** A fill's or an icon's texels as the client samples them. */
const RAW_TEXTURES = { colorSpace: NoColorSpace, wrap: ClampToEdgeWrapping } as const;

/**
 * The text source for `fonts` and `sheets`: each font's files loaded into the webview, its fill
 * and its sheets' icons on the GPU, and one glyph cache for the canvas's life.
 */
export function useTextSource(
  fonts: readonly ViewFont[],
  sheets: readonly ViewStyleSheet[],
  strings: ReadonlyMap<string, string>,
): TextSources {
  const [cache] = useState(() => new GlyphCache());
  useEffect(() => () => cache.dispose(), [cache]);

  const files = useMemo(() => {
    const held = new Map<string, AssetRef>();
    for (const font of fonts) {
      const face = faceOf(font);
      for (const file of [face?.regular, face?.bold]) {
        if (file?.asset !== null && file?.asset !== undefined) {
          held.set(assetKey(file.asset), file.asset);
        }
      }
    }
    return [...held.values()];
  }, [fonts]);
  const combine = useCallback(
    (results: readonly { data?: LoadedFont }[]) => {
      const held = new Map<string, LoadedFont>();
      files.forEach((asset, at) => {
        const data = results[at]?.data;
        if (data !== undefined) held.set(assetKey(asset), data);
      });
      return held;
    },
    [files],
  );
  const loaded = useQueries({
    queries: files.map((asset) => uiQueries.fontFile(asset)),
    combine,
  });

  const textureAssets = useMemo(() => {
    const held = new Map<string, AssetRef>();
    const add = (asset: AssetRef | null | undefined) => {
      if (asset !== null && asset !== undefined) held.set(assetKey(asset), asset);
    };
    for (const font of fonts) add(font.fill?.asset);
    for (const sheet of sheets) {
      for (const icon of sheet.icons) add(icon.texture?.asset);
    }
    return held;
  }, [fonts, sheets]);
  const textTextures = useAssetTextures(textureAssets, RAW_TEXTURES);

  const source = useMemo<TextSource>(() => {
    const iconSize = (icon: ViewTextIcon) => {
      const asset = icon.texture?.asset;
      const texture =
        asset === null || asset === undefined ? undefined : textTextures.get(assetKey(asset));
      const image = texture?.image as { width?: number; height?: number } | null | undefined;
      return image?.width === undefined || image.height === undefined
        ? null
        : ([image.width, image.height] as const);
    };

    return {
      string: (key) => strings.get(key) ?? null,
      face: (index, size) => {
        const font = fonts[index];
        const face = font === undefined ? null : faceOf(font);
        const regular = face?.regular.asset;
        const held =
          regular === null || regular === undefined ? undefined : loaded.get(assetKey(regular));
        if (face === null || held === undefined) return null;

        const bold = face.bold?.asset;
        const boldHeld =
          bold === null || bold === undefined ? null : (loaded.get(assetKey(bold)) ?? null);
        return cache.face(held, boldHeld, size.pixels, size.outline, iconSize);
      },
    };
  }, [cache, fonts, loaded, strings, textTextures]);

  const flush = useCallback(() => cache.flush(), [cache]);
  const glyphPage = useCallback((page: number) => cache.page(page), [cache]);
  return useMemo(
    () => ({ source, flush, glyphPage, textTextures }),
    [source, flush, glyphPage, textTextures],
  );
}
