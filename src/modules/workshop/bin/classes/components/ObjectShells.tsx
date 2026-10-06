import { type ReactNode, useMemo } from "react";

import type { BinDocumentId } from "@/lib/tauri";

import {
  AtlasEditScope,
  CanvasToolbar,
  ElementInspector,
  ComponentsPane,
  FontControls,
  LayersPane,
  SpritesPane,
  VariantsPane,
} from "../../atlas";
import { type ShellPaneContent, ShellPaneTree } from "../../shell/components/ShellPaneTree";
import { ShellHeaderPortal } from "../../shell/state/shellHeader";
import type { ClassLayout } from "../utils/classLayouts";
import { ObjectPath, SectionColumn, type ShellFrameProps, ShellHeader } from "./ClassFrames";

export interface ObjectShellProps extends ShellFrameProps {
  /** The object the header names. */
  entry: string | null;
}

interface PreviewShellProps extends ObjectShellProps {
  kind: "material" | "font" | "element";
}

/**
 * The panes of a material, a font or a UI element: the object drawn, and its sections
 * (ADR-0047). A material draws on its character or a preview shape, a font draws its sample
 * under the screen and sample controls, and an element draws alone under the canvas toolbar.
 */
export function PreviewShell({ kind, placed, pages, view, entry, preview }: PreviewShellProps) {
  const content = useMemo<ShellPaneContent<"material" | "font" | "element">>(
    () => ({
      preview: previewPane(kind, preview),
      inspector: {
        body: inspectorPane(
          kind,
          <SectionColumn placed={placed} pages={pages} view={view} />,
          view,
        ),
      },
    }),
    [kind, placed, pages, view, preview],
  );

  return (
    <div data-ui="ClassView:shell" className="flex min-h-0 flex-1 flex-col gap-2">
      <ShellHeader
        kind={kind}
        crumb={entry !== null && <ObjectPath path={view.objectName(entry)} />}
      />
      {kind === "element" && <CanvasToolbarRow />}
      <ShellPaneTree kind={kind} content={content} />
    </div>
  );
}

/**
 * The panes of a UI view under the canvas toolbar: the canvas, the kinds of element to add, the
 * layers tree and the selected element's fields, or the controller's own sections while none is
 * selected, per "Panes" in docs/plans/atlas-ui-editor.md.
 */
export function AtlasShell({ placed, pages, view, entry, preview }: ObjectShellProps) {
  const content = useMemo<ShellPaneContent<"atlas">>(
    () => ({
      preview: { body: preview },
      components: { body: <ComponentsPane document={view.document} entry={view.entry} /> },
      layers: { body: <LayersPane document={view.document} entry={view.entry} /> },
      variants: { body: <VariantsPane document={view.document} entry={view.entry} /> },
      sprites: { body: <SpritesPane document={view.document} entry={view.entry} /> },
      inspector: {
        body: (
          <ElementInspector
            document={view.document}
            entry={view.entry}
            objectName={view.objectName}
            fallback={<SectionColumn placed={placed} pages={pages} view={view} />}
          />
        ),
      },
    }),
    [placed, pages, view, preview],
  );

  return (
    <div data-ui="ClassView:shell" className="flex min-h-0 flex-1 flex-col gap-2">
      <ShellHeader
        kind="atlas"
        crumb={entry !== null && <ObjectPath path={view.objectName(entry)} />}
      />
      <CanvasToolbarRow />
      <ShellPaneTree kind="atlas" content={content} />
    </div>
  );
}

/**
 * The Atlas edit scope of a UI view's or a UI element's layout, around both its panes and the
 * preview the layout hosts beside them, so the canvas and the inspector edit the same bin.
 */
export function ShellEditScope({
  shell,
  document,
  entry,
  children,
}: {
  shell: ClassLayout["shell"];
  document: BinDocumentId;
  entry: string;
  children: ReactNode;
}) {
  if (shell === "atlas") {
    return (
      <AtlasEditScope document={document} entry={entry} source="controller">
        {children}
      </AtlasEditScope>
    );
  }
  if (shell === "element") {
    return (
      <AtlasEditScope document={document} entry={entry} source="scene">
        {children}
      </AtlasEditScope>
    );
  }
  return children;
}

/** The inspector of a preview shell: an element's own inspector, or the layout's sections. */
function inspectorPane(
  kind: PreviewShellProps["kind"],
  sections: ReactNode,
  view: ShellFrameProps["view"],
) {
  if (kind !== "element") return sections;

  return (
    <ElementInspector
      document={view.document}
      entry={view.entry}
      source="scene"
      objectName={view.objectName}
      fallback={sections}
    />
  );
}

/** The preview pane of a preview shell, under the controls a font draws with. */
function previewPane(kind: PreviewShellProps["kind"], preview: ReactNode) {
  if (kind === "font") {
    return { body: preview, actions: <FontControls />, actionsWidth: "rest" as const };
  }
  return { body: preview };
}

/** The canvas toolbar, in the tab's second header row, and on a row of the shell's own without it. */
function CanvasToolbarRow() {
  return (
    <ShellHeaderPortal
      slot="toolbar"
      fallback={
        <div className="flex shrink-0 items-center px-1">
          <CanvasToolbar />
        </div>
      }
    >
      <CanvasToolbar />
    </ShellHeaderPortal>
  );
}
