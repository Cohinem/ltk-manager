import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { ClampToEdgeWrapping, NoColorSpace, type Texture } from "three";

import type { AppError, AssetRef, BinDocumentId, UiShader } from "@/lib/tauri";
import { type ReadyProgram, useAssetTextures } from "@/modules/viewport";
import { usePreviewShaders } from "@/stores";

import { FRAME_SHADERS, uiQueries } from "../api/uiQueries";
import { buildTree, type ViewTree } from "../engine/model/tree";
import { finiteView, type View } from "../engine/model/view";
import { useAtlasScene, useAtlasVariant } from "../state/atlasEdit";
import { useViewVariant, viewKey } from "../state/atlasPreview";

export interface AtlasViewRead {
  readonly view: View | null;
  readonly tree: ViewTree | null;
  readonly error: AppError | null;
  readonly pending: boolean;
}

/**
 * Where a view is read from: the view controller or loadable at `entry`, or the scene bin open
 * as the document, read for its element at `entry`.
 */
export type ViewSource = "controller" | "scene";

/**
 * The view at `entry` of `document`, resolved and linked into its tree. A controller's view draws
 * its base scene bin from the shell's open scene bin once it is open, with the chosen variant
 * laid over it.
 */
export function useAtlasView(
  document: BinDocumentId,
  entry: string,
  source: ViewSource = "controller",
): AtlasViewRead {
  const scene = useAtlasScene();
  const slot = useViewVariant(viewKey(document, entry));
  const declared = useAtlasVariant();
  const variant = useMemo(
    () => (slot === null ? null : { slot, document: declared }),
    [slot, declared],
  );
  const read =
    source === "scene"
      ? uiQueries.sceneView(document, entry)
      : uiQueries.view(document, entry, scene, variant);
  const query = useQuery({ ...read, enabled: entry !== "", placeholderData: keepPreviousData });
  const view = useMemo(
    () => (query.data === undefined ? null : finiteView(query.data)),
    [query.data],
  );
  const tree = useMemo(() => (view === null ? null : buildTree(view)), [view]);
  return { view, tree, error: query.error, pending: query.isPending };
}

const NO_PROGRAMS: ReadonlyMap<UiShader, ReadyProgram> = new Map();

/**
 * The translated UI programs by pair, none where the game's shaders are switched off or a pair
 * failed, which the fallback draws instead.
 */
export function useUiPrograms(document: BinDocumentId | null): ReadonlyMap<UiShader, ReadyProgram> {
  const enabled = usePreviewShaders();
  const reads = useQuery({ ...uiQueries.programs(document), enabled }).data;

  return useMemo(() => {
    if (!enabled || reads === undefined) return NO_PROGRAMS;

    const programs = new Map<UiShader, ReadyProgram>();
    FRAME_SHADERS.forEach((shader, at) => {
      const read = reads[at];
      if (read?.kind === "ready") programs.set(shader, read);
    });
    return programs;
  }, [enabled, reads]);
}

/** A page's or a sheet's texels as the client samples them: no decoding, clamped. */
const RAW_TEXTURES = { colorSpace: NoColorSpace, wrap: ClampToEdgeWrapping } as const;

export interface UiTextures {
  /** Each loaded texture by its index in the view. */
  readonly textures: ReadonlyMap<number, Texture>;
  /** Each loaded texture's size in pixels by its index. */
  readonly sizes: ReadonlyMap<number, readonly [number, number]>;
}

/** The view's pages and sheets on the GPU, each as it lands. */
export function useUiTextures(view: View | null): UiTextures {
  const assets = useMemo(() => {
    const located = new Map<string, AssetRef>();
    view?.textures.forEach((texture, at) => {
      if (texture.asset !== null) located.set(String(at), texture.asset);
    });
    return located;
  }, [view]);
  const loaded = useAssetTextures(assets, RAW_TEXTURES);

  return useMemo(() => {
    const textures = new Map<number, Texture>();
    const sizes = new Map<number, readonly [number, number]>();
    for (const [key, texture] of loaded) {
      const at = Number(key);
      textures.set(at, texture);
      const image = texture.image as { width?: number; height?: number } | null | undefined;
      if (image?.width !== undefined && image.height !== undefined) {
        sizes.set(at, [image.width, image.height]);
      }
    }
    return { textures, sizes };
  }, [loaded]);
}
