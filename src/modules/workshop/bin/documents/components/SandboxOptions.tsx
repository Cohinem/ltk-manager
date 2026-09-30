import { CaretDownIcon, CheckIcon, LockSimpleIcon } from "@phosphor-icons/react";
import { queryOptions, skipToken, useQuery } from "@tanstack/react-query";
import { type ReactNode, useMemo } from "react";

import { HoverCard, LeagueIcon, Popover } from "@/components";
import { m, readOnlyDescription } from "@/i18n";
import {
  api,
  type AssetRef,
  type BinDocumentHandle,
  type DeclaredState,
  type SandboxRef,
} from "@/lib/tauri";

import {
  type ContentDocumentOf,
  inSandbox,
  layerTitle,
  objectDocument,
  previewDocument,
} from "../../../documents/utils/contentDocument";
import { LayerGlyph } from "../../../layers/components/LayerGlyph";
import { useOptionalProjectContext } from "../../../projects/state/ProjectContext";
import { sandboxKeys } from "../../../sandbox/api/keys";
import { useRouteSandbox } from "../../../sandbox/state/SandboxContext";
import { GAME_SANDBOX } from "../../../sandbox/utils/sandboxRef";
import {
  useEditorDocument,
  useReplaceDocument,
  useSelectedLayerName,
  useSelectedModule,
  useSelectLayer,
  useSetUseDeclarations,
} from "../../../state";
import { entryChunkPath } from "../../links/hooks/useLinkTargets";
import { useDeclareInto, useDeclaredState } from "../hooks/useDeclared";
import type { ProjectSwitch } from "../state/projectSwitch";
import { choiceLabel } from "../utils/declaredModule";
import { DeclaredModuleList, ModuleOption, OPTION_CLASSES } from "./DeclaredModuleList";

/** An asset tab, the kind of tab that can switch sandboxes. */
type AssetTab = ContentDocumentOf<"preview"> | ContentDocumentOf<"object">;

interface SandboxOptionsProps {
  /** The editor's id for the tab, which a switch replaces. */
  documentId: string;
  handle: BinDocumentHandle;
}

/* The crumb segment's box, so the options line up with the crumb after them. DS-VEIL */
const TRIGGER =
  "flex h-7 min-w-0 shrink-0 cursor-pointer items-center gap-1 rounded-md px-2 font-medium text-surface-400 transition-colors hover:bg-surface-veil hover:text-surface-100 data-[popup-open]:bg-surface-veil";

/**
 * The `Sandbox (<name>)` button that leads a bin tab's header, and its options. ADR-0056.
 *
 * - The project and the game. Picking one switches the tab in place. The game is disabled
 *   for a file the install has no copy of.
 * - For a declared document, the project's declarations switch, the layer edits declare
 *   into, and the module new keys join.
 *
 * "The sandbox" in docs/ux/BIN_EDITOR.md.
 */
export function SandboxOptions({ documentId, handle }: SandboxOptionsProps) {
  /* The sandbox the document is held in, which is the game's for a loose file. */
  const { sandbox } = handle;
  const project = useOptionalProjectContext();
  const declared = useDeclaredState(handle.document);
  const locked = handle.readOnly !== null;
  const name =
    sandbox.kind === "game" || project === null
      ? m.workshop_bin_sandbox_game_label()
      : project.displayName;

  return (
    <span className="flex shrink-0 items-center">
      {declared !== null && <DeclareIntoChoice document={handle.document} declared={declared} />}
      <Popover.Root>
        <HoverCard
          label={m.workshop_bin_sandbox_label()}
          className="w-72"
          content={<SandboxCard handle={handle} declared={declared} />}
        >
          <Popover.Trigger
            render={
              <button type="button" className={TRIGGER} aria-label={m.workshop_bin_sandbox_label()}>
                <TriggerGlyph handle={handle} declared={declared} locked={locked} />
                <span className="min-w-0 truncate">
                  {m.workshop_bin_sandbox_current_label({ name })}
                </span>
                <CaretDownIcon weight="bold" className="h-3 w-3 shrink-0" />
              </button>
            }
          />
        </HoverCard>
        <Popover.Portal>
          <Popover.Positioner align="start" sideOffset={4}>
            <Popover.Popup
              data-ui="SandboxOptions"
              className="flex max-h-[28rem] w-64 flex-col gap-0.5 overflow-y-auto p-1 scrollbar-md select-none"
            >
              <SandboxChoice documentId={documentId} handle={handle} />
              {declared !== null && (
                <DeclaredChoices handle={handle} declared={declared} locked={locked} />
              )}
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
    </span>
  );
}

/** Sends the project's selected layer and module to the backend while the tab is open. */
function DeclareIntoChoice({
  document,
  declared,
}: {
  document: BinDocumentHandle["document"];
  declared: DeclaredState;
}) {
  useDeclareInto(document, declared, useSelectedLayerName(), useSelectedModule());
  return null;
}

/** The League icon in the game sandbox, the target layer's glyph otherwise, a lock when read-only. */
function TriggerGlyph({
  handle,
  declared,
  locked,
}: {
  handle: BinDocumentHandle;
  declared: DeclaredState | null;
  locked: boolean;
}) {
  if (locked) return <LockSimpleIcon className="h-3.5 w-3.5 shrink-0" />;
  if (handle.sandbox.kind === "game") return <LeagueIcon className="h-3.5 w-3.5 shrink-0" />;

  const layer = declared?.layer ?? (handle.asset.kind === "layer" ? handle.asset.layer : null);
  if (layer === null) return null;
  /* DS-KIND-HUE */
  return <LayerGlyph layerName={layer} />;
}

/** The hover card text: what a sandbox is, and where this tab's edits go. */
function SandboxCard({
  handle,
  declared,
}: {
  handle: BinDocumentHandle;
  declared: DeclaredState | null;
}) {
  const project = useOptionalProjectContext();
  const title = (layer: string) => (project === null ? layer : layerTitle(project, layer));

  return (
    <span className="flex flex-col gap-1.5">
      <span className="font-medium text-surface-100">{m.workshop_bin_sandbox_label()}</span>
      <span>{m.workshop_bin_sandbox_description()}</span>
      {handle.readOnly !== null && <span>{readOnlyDescription(handle.readOnly)}</span>}
      {handle.readOnly === null && declared !== null && (
        <span>
          {m.workshop_bin_sandbox_declares_hint({
            layer: title(declared.layer),
            module: choiceLabel(declared.module, declared.modules),
          })}
        </span>
      )}
      {handle.readOnly === null && declared === null && handle.asset.kind === "layer" && (
        <span>{m.workshop_bin_sandbox_writes_hint({ layer: title(handle.asset.layer) })}</span>
      )}
    </span>
  );
}

/** The project and game options, which switch the tab in place. */
function SandboxChoice({ documentId, handle }: { documentId: string; handle: BinDocumentHandle }) {
  const { sandbox } = handle;
  const route = useRouteSandbox();
  const project = useOptionalProjectContext();
  const tab = useEditorDocument(documentId);
  const replace = useReplaceDocument();
  const asset = tab !== null && isAssetTab(tab) ? tab : null;
  const copy = useGameCopy(asset?.asset.kind === "gameChunk" ? asset.asset : handle.asset);

  function switchTo(target: SandboxRef) {
    if (asset === null) return;
    const next = switched(asset, target, route, copy);
    if (next !== null) replace(documentId, next);
  }

  return (
    <>
      <SectionLabel>{m.workshop_bin_sandbox_label()}</SectionLabel>
      {project !== null && (
        <ModuleOption
          chosen={sandbox.kind !== "game"}
          disabled={asset === null}
          onChoose={() => switchTo(route)}
        >
          {project.displayName}
        </ModuleOption>
      )}
      <ModuleOption
        chosen={sandbox.kind === "game"}
        disabled={asset === null || copy.asset === null}
        hint={copy.asset === null ? m.workshop_bin_sandbox_game_missing_hint() : undefined}
        onChoose={() => switchTo(GAME_SANDBOX)}
      >
        {m.workshop_bin_sandbox_game_label()}
      </ModuleOption>
    </>
  );
}

/** The declarations switch, the layer edits declare into, and the module new keys join. */
function DeclaredChoices({
  handle,
  declared,
  locked,
}: {
  handle: BinDocumentHandle;
  declared: DeclaredState;
  locked: boolean;
}) {
  const project = useOptionalProjectContext();
  const selectLayer = useSelectLayer();
  const setUseDeclarations = useSetUseDeclarations();
  const declaring = handle.readOnly === null;
  /* With declarations off, only the switch that turns them on stays enabled. */
  const gated = locked && handle.readOnly !== "declarationsOff";

  return (
    <>
      <div className="-mx-1 my-1 border-t border-surface-700" />
      <button
        type="button"
        role="menuitemcheckbox"
        aria-checked={declaring}
        disabled={gated}
        onClick={() => setUseDeclarations(!declaring)}
        className={OPTION_CLASSES}
      >
        <span className="min-w-0 flex-1 truncate">
          {m.workshop_bin_declarations_toggle_label()}
        </span>
        {declaring && <CheckIcon weight="bold" className="h-3.5 w-3.5 shrink-0 text-accent-400" />}
      </button>
      <SectionLabel>{m.workshop_bin_declares_into_label()}</SectionLabel>
      {declared.layers.map((layer) => (
        <ModuleOption
          key={layer}
          chosen={declared.layer === layer}
          disabled={gated}
          onChoose={() => selectLayer(layer)}
        >
          <span className="flex min-w-0 items-center gap-1.5">
            {/* DS-KIND-HUE */}
            <LayerGlyph layerName={layer} />
            <span className="min-w-0 truncate">
              {project === null ? layer : layerTitle(project, layer)}
            </span>
          </span>
        </ModuleOption>
      ))}
      <SectionLabel>{m.workshop_bin_declares_module_label()}</SectionLabel>
      <DeclaredModuleList document={handle.document} declared={declared} locked={locked} />
    </>
  );
}

/**
 * Moving the tab `documentId` from the game sandbox into the open project, the switch the
 * sandbox options make. Null where no project is open or the tab is not in the game sandbox.
 */
export function useProjectSwitch(
  documentId: string,
  handle: BinDocumentHandle,
): ProjectSwitch | null {
  const route = useRouteSandbox();
  const project = useOptionalProjectContext();
  const tab = useEditorDocument(documentId);
  const replace = useReplaceDocument();
  const asset = tab !== null && isAssetTab(tab) ? tab : null;
  const copy = useGameCopy(asset?.asset.kind === "gameChunk" ? asset.asset : handle.asset);
  const name = project?.displayName ?? null;
  const inGame = handle.sandbox.kind === "game";

  return useMemo(() => {
    if (name === null || asset === null || !inGame || route.kind === "game") return null;

    return {
      project: name,
      open: () => {
        const next = switched(asset, route, route, copy);
        if (next !== null) replace(documentId, next);
      },
    };
  }, [name, asset, inGame, route, copy, replace, documentId]);
}

function SectionLabel({ children }: { children: ReactNode }) {
  return <span className="px-2 pt-1.5 pb-0.5 text-meta text-surface-400">{children}</span>;
}

function isAssetTab(document: { kind: string }): document is AssetTab {
  return document.kind === "preview" || document.kind === "object";
}

/** The install's copy of the file a tab reads. */
interface GameCopy {
  readonly asset: AssetRef | null;
  /** The copy's chunk path, the title of a tab switched to it. Null for a game chunk. */
  readonly path: string | null;
}

/** The install's file at the chunk path `path`, or null when the install has none. */
const gameCopyQuery = (path: string | null) =>
  queryOptions({
    queryKey: sandboxKeys.gameCopy(path),
    queryFn:
      path === null
        ? skipToken
        : async () => {
            const answer = await api.objects.locateGameFiles([path]);
            if (!answer.ok) throw answer.error;
            return answer.value[path] ?? null;
          },
    staleTime: Infinity,
    retry: false,
  });

/**
 * The install's copy of `asset`. A game chunk is its own copy. For a layer file, it is the
 * install's chunk at the file's path inside the archive directory, if the install has one.
 */
function useGameCopy(asset: AssetRef): GameCopy {
  const path = asset.kind === "layer" ? (entryChunkPath(asset.path)?.toLowerCase() ?? null) : null;
  const located = useQuery(gameCopyQuery(path)).data;

  if (asset.kind === "gameChunk") return { asset, path: null };
  if (located == null) return { asset: null, path };

  return {
    asset: { kind: "gameChunk", wad: located.wad, pathHash: located.pathHash },
    path,
  };
}

/**
 * The tab `tab` becomes in `target`, or null when it cannot switch. A game chunk keeps its
 * asset. A layer file switched to the game becomes the install's copy of its path.
 */
function switched(
  tab: AssetTab,
  target: SandboxRef,
  route: SandboxRef,
  copy: GameCopy,
): AssetTab | null {
  if (target.kind !== "game" || tab.asset.kind === "gameChunk") {
    return inSandbox(tab, target, route);
  }
  if (copy.asset === null) return null;

  if (tab.kind === "object") {
    return objectDocument(
      copy.asset,
      tab.objectHash,
      tab.objectPath,
      copy.path ?? tab.file,
      tab.objectClass ?? null,
      target,
    );
  }
  return previewDocument(copy.asset, copy.path ?? undefined, target);
}
