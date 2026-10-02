import { queryOptions, skipToken } from "@tanstack/react-query";

import {
  api,
  type AppError,
  type AssetRef,
  type BinDocumentId,
  type DeclaredObjects,
  type MaterialProgram,
  type SandboxRef,
  type ProgramRead,
  type UiFont,
  type UiFontCatalog,
  type UiLoadout,
  type UiCharacter,
  type UiShader,
  type UiSpellTooltip,
  type UiView,
  type ViewVariant,
} from "@/lib/tauri";
import { queryFnWithArgs, unwrapForQuery } from "@/utils/query";

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
  /** Every view read, which a change to what finds a view's files reads again. */
  views: ["ui-view"] as const,
  view: (
    document: BinDocumentId,
    entry: string,
    scene: BinDocumentId | null,
    variant: ViewVariant | null,
  ) =>
    [
      ...uiKeys.views,
      document,
      entry,
      scene,
      variant?.slot ?? null,
      variant?.document ?? null,
    ] as const,
  sceneView: (document: BinDocumentId, entry: string) =>
    ["ui-scene-view", document, entry] as const,
  font: (document: BinDocumentId, entry: string) => ["ui-font", document, entry] as const,
  /* Under the font reads, so an edit that lands reads the catalog again. */
  fontCatalog: (document: BinDocumentId | null) => ["ui-font", "catalog", document] as const,
  programs: (document: BinDocumentId | null) => ["ui-programs", document] as const,
  strings: (keys: readonly string[]) => ["ui-strings", ...keys] as const,
  fontFile: (asset: AssetRef) => ["ui-font-file", assetKey(asset)] as const,
  declared: (sandbox: SandboxRef, hash: string) =>
    ["ui-declared", sandboxKey(sandbox), hash] as const,
  loadout: (document: BinDocumentId, sandbox: SandboxRef) =>
    ["ui-loadout", document, sandboxKey(sandbox)] as const,
  tooltips: (
    document: BinDocumentId,
    sandbox: SandboxRef,
    character: string,
    level: number,
    rank: number,
  ) =>
    ["ui-tooltips", document, sandboxKey(sandbox), character.toLowerCase(), level, rank] as const,
  characters: (document: BinDocumentId, sandbox: SandboxRef) =>
    ["ui-characters", document, sandboxKey(sandbox)] as const,
  materials: (
    documents: readonly BinDocumentId[],
    entries: readonly string[],
    sandbox: SandboxRef,
  ) => ["ui-materials", sandboxKey(sandbox), ...documents, "|", ...entries] as const,
};

/** Warm the object index and wait while it builds, since a read through it answers nothing then. */
async function untilIndexed(sandbox: SandboxRef): Promise<void> {
  await api.objects.warm();
  for (;;) {
    const status = await api.objects.declared(sandbox, []);
    if (!status.ok || status.value.index.status !== "building") return;
    await new Promise((resolve) => setTimeout(resolve, BUILDING_POLL_MS));
  }
}

export const uiQueries = {
  /**
   * The sample loadout a preview fills a controller's elements with, read once the object index,
   * which reaches the champion, item and rune bins, is built.
   */
  loadout: (document: BinDocumentId, sandbox: SandboxRef) =>
    queryOptions<UiLoadout, AppError>({
      queryKey: uiKeys.loadout(document, sandbox),
      queryFn: async () => {
        await untilIndexed(sandbox);
        return unwrapForQuery(await api.bin.readUiLoadout(document));
      },
      staleTime: Infinity,
      retry: false,
    }),
  /** Every character with its name and icon, read once the object index is built. */
  characters: (document: BinDocumentId, sandbox: SandboxRef) =>
    queryOptions<UiCharacter[], AppError>({
      queryKey: uiKeys.characters(document, sandbox),
      queryFn: async () => {
        await untilIndexed(sandbox);
        return unwrapForQuery(await api.bin.readUiCharacters(document));
      },
      staleTime: Infinity,
      retry: false,
    }),
  /**
   * The tooltips of a character's passive and abilities at `level`, each spell at `rank`, read
   * once the object index is built.
   */
  tooltips: (
    document: BinDocumentId,
    sandbox: SandboxRef,
    character: string,
    level: number,
    rank: number,
  ) =>
    queryOptions<UiSpellTooltip[], AppError>({
      queryKey: uiKeys.tooltips(document, sandbox, character, level, rank),
      queryFn: async () => {
        await untilIndexed(sandbox);
        return unwrapForQuery(await api.bin.readUiTooltips(document, character, level, rank));
      },
      staleTime: Infinity,
      retry: false,
    }),
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
      queryFn: queryFnWithArgs(api.bin.readUiView, document, entry, scene, variant),
      staleTime: Infinity,
      retry: false,
    }),
  /** The scene bin open as `document`, drawn as a view of its own for the element `entry`. */
  sceneView: (document: BinDocumentId, entry: string) =>
    queryOptions<UiView, AppError>({
      queryKey: uiKeys.sceneView(document, entry),
      queryFn: queryFnWithArgs(api.bin.readUiSceneView, document, entry),
      staleTime: Infinity,
      retry: false,
    }),
  font: (document: BinDocumentId, entry: string) =>
    queryOptions<UiFont, AppError>({
      queryKey: uiKeys.font(document, entry),
      queryFn: queryFnWithArgs(api.bin.readUiFont, document, entry),
      staleTime: Infinity,
      retry: false,
    }),
  /**
   * The programs of the icon materials `entries`, one for one, each read out of the first of the
   * open `documents` declaring it or out of the game chunk the object index names, which is built
   * first.
   */
  materials: (
    documents: readonly BinDocumentId[],
    entries: readonly string[],
    sandbox: SandboxRef,
  ) =>
    queryOptions<(MaterialProgram | null)[], AppError>({
      queryKey: uiKeys.materials(documents, entries, sandbox),
      queryFn:
        entries.length === 0 || documents.length === 0
          ? skipToken
          : async () => {
              await untilIndexed(sandbox);
              return unwrapForQuery(await api.bin.readUiMaterialPrograms(documents, entries));
            },
      staleTime: Infinity,
      retry: false,
    }),
  /** The fonts and faces a text in the open `document` can draw with, none while none is open. */
  fontCatalog: (document: BinDocumentId | null) =>
    queryOptions<UiFontCatalog, AppError>({
      queryKey: uiKeys.fontCatalog(document),
      queryFn: document === null ? skipToken : queryFnWithArgs(api.bin.readUiFontCatalog, document),
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
      queryFn: queryFnWithArgs(api.bin.readUiPrograms, document, FRAME_SHADERS),
      staleTime: Infinity,
      retry: false,
    }),
};
