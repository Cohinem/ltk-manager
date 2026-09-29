import { queryOptions } from "@tanstack/react-query";

import {
  api,
  type AppError,
  type AssetRef,
  type BinDocumentId,
  type DeclaredObjects,
  type SandboxRef,
  type ProgramRead,
  type UiFont,
  type UiShader,
  type UiView,
  type ViewVariant,
} from "@/lib/tauri";
import { unwrapForQuery } from "@/utils/query";

import { BUILDING_POLL_MS } from "../../../gameBrowser/api/keys";
import { sandboxKey } from "../../../sandbox/utils/sandboxRef";
import { assetKey, type LoadedFont, loadFont } from "../rendering/text/fontFiles";

/** The UI and font programs a frame draws with, section 2.2 of docs/plans/atlas-renderer.md. */
export const FRAME_SHADERS: readonly UiShader[] = [
  "blend",
  "opaque",
  "copy",
  "cooldown",
  "cooldownLine",
  "ammo",
  "ammoLine",
  "circleMaskCooldown",
  "cooldownRadial",
  "cooldownRadialFill",
  "arcFill",
  "glow",
  "glowConstant",
  "animation",
  "fillPercentage",
  "desaturate",
  "circleMaskDesaturate",
  "line",
  "lineGraph",
  "rotatingIcon",
  "glowingRotatingIcon",
  "animatedRotatingIcon",
  "gradient",
  "font",
  "fontOutline",
  "fontIcon",
];

export const uiKeys = {
  view: (
    document: BinDocumentId,
    entry: string,
    scene: BinDocumentId | null,
    variant: ViewVariant | null,
  ) =>
    ["ui-view", document, entry, scene, variant?.slot ?? null, variant?.document ?? null] as const,
  sceneView: (document: BinDocumentId, entry: string) =>
    ["ui-scene-view", document, entry] as const,
  font: (document: BinDocumentId, entry: string) => ["ui-font", document, entry] as const,
  programs: (document: BinDocumentId | null) => ["ui-programs", document] as const,
  strings: (keys: readonly string[]) => ["ui-strings", ...keys] as const,
  fontFile: (asset: AssetRef) => ["ui-font-file", assetKey(asset)] as const,
  declared: (sandbox: SandboxRef, hash: string) =>
    ["ui-declared", sandboxKey(sandbox), hash] as const,
};

export const uiQueries = {
  /**
   * The files that declare the object `hash`, which is how an element reaches the particle
   * system it links. A cold object index is warmed first, and a building one is asked again.
   */
  declared: (sandbox: SandboxRef, hash: string) =>
    queryOptions<DeclaredObjects, AppError>({
      queryKey: uiKeys.declared(sandbox, hash),
      queryFn: async () => {
        const first = await api.objects.declared(sandbox, [hash]);
        if (!first.ok || first.value.index.status !== "absent") return unwrapForQuery(first);

        await api.objects.warm();
        return unwrapForQuery(await api.objects.declared(sandbox, [hash]));
      },
      staleTime: Infinity,
      retry: false,
      refetchInterval: (query) =>
        query.state.data?.index.status === "building" ? BUILDING_POLL_MS : false,
    }),
  /**
   * The view at `entry`, its base scene bin drawn from the open `scene` where one is open, with
   * `variant` laid over it.
   */
  view: (
    document: BinDocumentId,
    entry: string,
    scene: BinDocumentId | null = null,
    variant: ViewVariant | null = null,
  ) =>
    queryOptions<UiView, AppError>({
      queryKey: uiKeys.view(document, entry, scene, variant),
      queryFn: async () =>
        unwrapForQuery(await api.bin.readUiView(document, entry, scene, variant)),
      staleTime: Infinity,
      retry: false,
    }),
  /** The scene bin open as `document`, drawn as a view of its own for the element `entry`. */
  sceneView: (document: BinDocumentId, entry: string) =>
    queryOptions<UiView, AppError>({
      queryKey: uiKeys.sceneView(document, entry),
      queryFn: async () => unwrapForQuery(await api.bin.readUiSceneView(document, entry)),
      staleTime: Infinity,
      retry: false,
    }),
  font: (document: BinDocumentId, entry: string) =>
    queryOptions<UiFont, AppError>({
      queryKey: uiKeys.font(document, entry),
      queryFn: async () => unwrapForQuery(await api.bin.readUiFont(document, entry)),
      staleTime: Infinity,
      retry: false,
    }),
  /** The game's text of each `TRAKey`, a key the game does not resolve absent. */
  strings: (keys: readonly string[]) =>
    queryOptions<Readonly<Record<string, string>>, AppError>({
      queryKey: uiKeys.strings(keys),
      queryFn: async () => unwrapForQuery(await api.lookupStringValues([...keys])),
      staleTime: Infinity,
      retry: false,
    }),
  fontFile: (asset: AssetRef) =>
    queryOptions<LoadedFont, Error>({
      queryKey: uiKeys.fontFile(asset),
      queryFn: () => loadFont(asset),
      staleTime: Infinity,
      gcTime: Infinity,
      retry: false,
    }),
  programs: (document: BinDocumentId | null) =>
    queryOptions<ProgramRead[], AppError>({
      queryKey: uiKeys.programs(document),
      queryFn: async () => unwrapForQuery(await api.bin.readUiPrograms(document, FRAME_SHADERS)),
      staleTime: Infinity,
      retry: false,
    }),
};
