import { ArrowSquareOutIcon } from "@phosphor-icons/react";
import type { MouseEvent, ReactNode } from "react";

import { IconButton, Tooltip } from "@/components";
import { m } from "@/i18n";
import type { AssetRef, BinDocumentId, UiFile } from "@/lib/tauri";

import { objectDocument } from "../../../documents/utils/contentDocument";
import { clickIntent, useOpenDocumentAs } from "../../../state";
import { useBinDocument } from "../../documents/hooks/useBinDocument";
import { nameHash } from "../../shared/utils/binHash";
import { BinTree } from "../../tree/components/BinTree";
import { Notice } from "../../vfx/preview/components/Notice";
import type { LayoutSettings, PixelRect } from "../engine/layout/solve";
import { labelOf } from "../engine/model/layers";
import type { ViewTree } from "../engine/model/tree";
import type { ViewElement } from "../engine/model/view";
import { useAtlasLayout } from "../hooks/useAtlasLayout";
import type { ViewSource } from "../hooks/useAtlasSources";
import { useAtlasEdit } from "../state/atlasEdit";
import { useSectionOpen, useViewPreview, viewKey } from "../state/atlasPreview";
import { ElementSections } from "./ElementSections";
import { ReadOnlyNote } from "./ReadOnlyNote";
import { SectionHeading } from "./sectionParts";

/** The most rows the element's tree shows before it scrolls. */
const TREE_ROWS = 40;

const FIELDS_SECTION = "fields";

export interface ElementInspectorProps {
  readonly document: BinDocumentId;
  /** The view controller object, or the element an element's shell draws. */
  readonly entry: string;
  readonly source?: ViewSource;
  /** The name of the object an entry hash addresses. */
  readonly objectName: (entry: string) => string;
  /** What the pane shows while no element is selected. */
  readonly fallback: ReactNode;
}

/**
 * The inspector of a view: the primary selection's fields, under its class, layer and rect on the
 * chosen screen, with an action that opens its object. `ElementSections` draws them as an author
 * reads them, and the tree under it draws every field the scene bin writes. Both edit where the
 * shell's scene bin takes edits.
 *
 * With no selection it shows `fallback`, the controller's own sections, and an element's shell
 * shows its own element.
 */
export function ElementInspector({
  document,
  entry,
  source = "controller",
  objectName,
  fallback,
}: ElementInspectorProps) {
  const { view, tree, settings, solved } = useAtlasLayout(document, entry, source);
  const { selected } = useViewPreview(viewKey(document, entry));

  const shown = selected ?? (source === "scene" ? entry : null);
  const element = shown === null ? undefined : tree?.elements.get(shown);
  const base = view?.files.find((file) => file.role === "base");
  if (element === undefined || base === undefined || tree === null) return fallback;
  if (base.asset === null) return <Notice text={m.workshop_bin_atlas_element_error()} />;

  return (
    <ElementFields
      key={element.key}
      element={element}
      tree={tree}
      settings={settings}
      solved={solved}
      view={viewKey(document, entry)}
      file={base}
      asset={base.asset}
      objectName={objectName}
    />
  );
}

interface ElementFieldsProps {
  readonly element: ViewElement;
  readonly tree: ViewTree;
  readonly settings: LayoutSettings;
  readonly solved: ReadonlyMap<string, PixelRect> | null;
  /** The view's preview key. */
  readonly view: string;
  readonly file: UiFile;
  readonly asset: AssetRef;
  readonly objectName: (entry: string) => string;
}

function ElementFields({
  element,
  tree,
  settings,
  solved,
  view,
  file,
  asset,
  objectName,
}: ElementFieldsProps) {
  const { state, reopen } = useBinDocument(asset, element.key, "lingering");
  const open = useOpenDocumentAs();
  const edit = useAtlasEdit();
  const fieldsOpen = useSectionOpen(FIELDS_SECTION);
  /* The tree reads the base scene bin, which a drawn variant's edits do not reach. */
  const overVariant = tree.view.variant !== null;
  const editable = edit?.editable === true && !overVariant;
  const readOnly = edit !== null && edit.scene !== null && !edit.editable;
  const path = element.path ?? element.label;
  const rect = solved?.get(element.key) ?? null;

  const openElement = (event: MouseEvent) => {
    open(objectDocument(asset, element.key, path, file.path, element.class), clickIntent(event));
  };

  return (
    <section data-ui="ElementInspector" className="flex min-h-0 flex-col gap-2">
      <header className="flex flex-col gap-0.5 px-1">
        <div className="flex min-w-0 items-center gap-2">
          <span
            title={path}
            className="min-w-0 truncate font-mono text-row text-surface-100 select-text"
          >
            {labelOf(element.label, element.path, element.key)}
          </span>
          <span className="min-w-0 shrink truncate text-meta text-surface-400">
            {element.class}
          </span>
          <Tooltip content={m.workshop_bin_open_object_action()}>
            <IconButton
              variant="ghost"
              size="xs"
              compact
              className="ml-auto"
              aria-label={m.workshop_bin_open_object_action()}
              icon={<ArrowSquareOutIcon weight="bold" className="h-3.5 w-3.5" />}
              onClick={openElement}
            />
          </Tooltip>
        </div>
        {rect !== null && (
          <span className="min-w-0 truncate font-mono text-meta text-surface-400 tabular-nums select-text">
            {m.workshop_bin_atlas_rect_label({ x: rect.x, y: rect.y, w: rect.w, h: rect.h })}
          </span>
        )}
        {readOnly && <ReadOnlyNote reason={edit.readOnly} className="text-meta" />}
      </header>
      <ElementSections
        element={element}
        tree={tree}
        settings={settings}
        solved={solved}
        view={view}
      />
      <div className="px-1">
        <SectionHeading id={FIELDS_SECTION} title={m.workshop_bin_atlas_fields_label()} />
      </div>
      {fieldsOpen && overVariant && (
        <p className="px-1 text-meta text-surface-400 select-none">
          {m.workshop_bin_atlas_fields_base_hint()}
        </p>
      )}
      {fieldsOpen && (
        <Fields
          state={state}
          element={element}
          editable={editable}
          objectName={objectName}
          onNotOpen={reopen}
        />
      )}
    </section>
  );
}

function Fields({
  state,
  element,
  editable,
  objectName,
  onNotOpen,
}: {
  state: ReturnType<typeof useBinDocument>["state"];
  element: ViewElement;
  editable: boolean;
  objectName: (entry: string) => string;
  onNotOpen: () => void;
}) {
  if (state.status === "opening") return <Notice text={m.workshop_bin_atlas_element_pending()} />;
  if (state.status === "failed") return <Notice text={m.workshop_bin_atlas_element_error()} />;

  return (
    /* DS-GROUND, DS-RADIUS */
    <div className="flex flex-col rounded-md border border-surface-700/50 bg-surface-900">
      <BinTree
        document={state.handle.document}
        asset={state.handle.asset}
        roots={state.handle.rows}
        rootOwner={classHashOf(element.class)}
        label={element.label}
        maxRows={TREE_ROWS}
        editable={editable && state.handle.readOnly === null}
        objectName={objectName}
        onNotOpen={onNotOpen}
      />
    </div>
  );
}

/** The class the view names, by its hash: a name hashes, and an unnamed hash is itself. */
function classHashOf(name: string): string {
  return name.startsWith("0x") ? name : nameHash(name);
}
