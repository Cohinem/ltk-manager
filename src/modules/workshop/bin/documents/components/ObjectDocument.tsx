import { CaretRightIcon } from "@phosphor-icons/react";
import {
  type MouseEvent as ReactMouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Group, Panel } from "react-resizable-panels";

import { RetainedContent, SegmentedControl, Separator, Spinner } from "@/components";
import { m } from "@/i18n";
import type { AssetRef, BinDocumentHandle, BinObjectHeader } from "@/lib/tauri";
import { DocumentToolbar, type EditorDocumentProps, Seam } from "@/modules/editor";

import type { ContentDocumentOf } from "../../../documents/utils/contentDocument";
/* The leaf rather than the objects browser barrel, which pulls the document that routes here. */
import { useSystemSteps } from "../../../objectsBrowser/hooks/useSystemSteps";
/* The leaf rather than the preview barrel, which pulls the document that routes here. */
import { BinPreview } from "../../../preview/components/BinPreview";
import { DocumentFrame } from "../../../shared/components/DocumentFrame";
import {
  clickIntent,
  useCurveAimRequest,
  useLendOpenBin,
  useFloatingShellPanes,
  useFloatShellPane,
  useOpenShellPane,
  useOpenShellPanes,
  useRowRevealRequest,
  useSettleCurveAim,
  useSettleRowReveal,
} from "../../../state";
import { ClassCard } from "../../classes/components/ClassCard";
import { ClassView } from "../../classes/components/ClassView";
import { useClassSchema } from "../../classes/hooks/useClassSchema";
import { classLayout, type LayoutFrame, shellHoldsCurve } from "../../classes/utils/classLayouts";
import { CurveSurface } from "../../curves/components/CurveSurface";
import { type CurveDock, CurveDockContext, type CurveTarget } from "../../curves/state/curveTarget";
import { useShowInFile } from "../../links/hooks/useShowInFile";
import { ObjectMenubar } from "../../menus/components/ClassMenubar";
import { type ObjectMenu, ObjectMenuContext, type ObjectMode } from "../../menus/state/objectMenu";
import { createPaneCommandHub, PaneCommandsContext } from "../../menus/state/paneCommands";
import {
  ShellHeaderContext,
  ShellHeaderSlot,
  useShellHeaderSlots,
} from "../../shell/state/shellHeader";
import type { ShellKind } from "../../shell/utils/shellPanes";
import { BinTree, type TreeReveal } from "../../tree/components/BinTree";
import { useBinDocument, useObjectRoots } from "../hooks/useBinDocument";
import { useBinTab } from "../hooks/useBinTab";
import { ProjectSwitchContext } from "../state/projectSwitch";
import { BinEditState } from "./BinEditState";
import { DuplicateObjectDialog } from "./DuplicateObjectDialog";
import { SandboxOptions, useProjectSwitch } from "./SandboxOptions";

/** The shells whose layout takes edits in place. The map's is a reader's view alone. */
const EDITABLE_SHELLS: ReadonlySet<ShellKind> = new Set([
  "vfx",
  "skin",
  "material",
  "atlas",
  "element",
]);

/**
 * One declaration of an object as a document of its own (ADR-0028).
 *
 * The rows are the object's properties from depth zero, over the tree the file tab
 * holds for the same asset. The header is the object, and no row repeats it.
 */
export function ObjectDocument({
  document,
  active,
}: EditorDocumentProps<ContentDocumentOf<"object">>) {
  const { id, asset, objectHash, objectPath, file } = document;
  const { state, reopen } = useBinDocument(asset, objectHash, "lingering");

  if (state.status === "failed") {
    return (
      <>
        <DocumentToolbar active={active}>{null}</DocumentToolbar>
        <BinPreview asset={asset} name={file} error={state.error} />
      </>
    );
  }

  if (state.status === "opening" || state.handle.object === null) {
    return (
      <div
        data-ui="ObjectDocument"
        className="flex min-h-0 flex-1 items-center justify-center bg-surface-950"
      >
        <Spinner />
      </div>
    );
  }

  return (
    <OpenObject
      documentId={id}
      asset={asset}
      objectPath={objectPath}
      file={file}
      handle={state.handle}
      object={state.handle.object}
      active={active}
      reopen={reopen}
    />
  );
}

interface OpenObjectProps {
  /** The editor's id for the tab, which a curve request names. */
  documentId: string;
  asset: AssetRef;
  objectPath: string;
  file: string;
  handle: BinDocumentHandle;
  object: BinObjectHeader;
  active: boolean;
  reopen: () => void;
}

function OpenObject({
  documentId,
  asset,
  objectPath,
  file,
  handle,
  object,
  active,
  reopen,
}: OpenObjectProps) {
  const showInFile = useShowInFile();
  const objectName = useCallback(() => object.name, [object.name]);
  const schema = useClassSchema(object.classHash).data;
  const bases = useMemo(() => schema?.bases.map((base) => base.hash) ?? [], [schema]);
  const layout = classLayout(object.classHash, bases);
  const roots = useObjectRoots(handle);
  useBinTab(documentId, handle.document, asset, handle.readOnly === null);
  const steps = useSystemSteps({
    enabled: layout?.shell === "vfx",
    documentId,
    objectHash: object.entry,
    objectPath,
    active,
  });
  useLendOpenBin(documentId, handle.document, object.entry);
  const toProject = useProjectSwitch(documentId, handle);

  /* The layout's own until the reader picks one, since a layout found through the class's
     bases arrives with its schema. */
  const [chosen, setMode] = useState<ObjectMode | null>(null);
  const mode: ObjectMode = chosen ?? (layout ? "layout" : "properties");
  const [reveal, setReveal] = useState<TreeReveal | null>(null);
  const [collapseAllSignal, setCollapseAllSignal] = useState(0);
  const [frame, setFrame] = useState<LayoutFrame>("stack");
  const [target, setTarget] = useState<CurveTarget | null>(null);
  /* Apart from the target, so a follow that lets go of it leaves the dock open. */
  const [aimed, setAimed] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  /* A shell with a curve pane holds the curve there (ADR-0031), so the dock is what every
     other frame and Properties get, and no tab draws the surface twice. */
  const paned = frame === "shell" && layout !== undefined && shellHoldsCurve(layout);
  const openShellPane = useOpenShellPane(layout?.shell ?? "vfx");
  const openPanes = useOpenShellPanes(layout?.shell ?? "vfx");
  const paneOpen = paned && openPanes.has("curve");
  const paneFloats = useFloatingShellPanes(layout?.shell ?? "vfx").includes("curve");
  const floatShellPane = useFloatShellPane(layout?.shell ?? "vfx");
  /* An open curve pane comes to the front, and a closed one floats, per "A pane floats" in
     docs/ux/BIN_EDITOR.md. */
  const aim = useCallback(
    (next: CurveTarget, quiet = false) => {
      setTarget(next);
      setAimed(true);
      if (paneOpen) openShellPane("curve");
      else if (paned && !paneFloats && !quiet) floatShellPane("curve");
    },
    [paned, paneOpen, paneFloats, openShellPane, floatShellPane],
  );
  const dock = useMemo<CurveDock>(
    () => ({ target, aim, clear: () => setTarget(null) }),
    [target, aim],
  );

  /* An answered request is settled, so a later open of the same object starts untargeted. */
  const request = useCurveAimRequest(documentId);
  const settleAim = useSettleCurveAim();
  useEffect(() => {
    if (request === null) return;
    settleAim(request.token);
    aim({ row: request.row, chain: request.chain });
  }, [request, settleAim, aim]);

  /* A row is revealed in Properties, the one mode that draws every row. */
  const revealRequest = useRowRevealRequest(documentId);
  const settleReveal = useSettleRowReveal();
  useEffect(() => {
    if (revealRequest === null) return;
    settleReveal(revealRequest.token);
    setMode("properties");
    setReveal({ key: revealRequest.key, token: revealRequest.token });
  }, [revealRequest, settleReveal]);

  const showFile = useCallback(
    (event: ReactMouseEvent) => showInFile(asset, object.entry, file, clickIntent(event)),
    [asset, file, object.entry, showInFile],
  );

  const showInProperties = useCallback((key: string) => {
    setMode("properties");
    setReveal({ key, token: Date.now() });
  }, []);

  const docked = aimed && (mode === "properties" || !paned);

  /* The crumb and the Panes menu share this row with the header, "The shell" in
     docs/ux/BIN_EDITOR.md. The slots stand only while a shell is what the tab draws. */
  const [slots, registerSlot] = useShellHeaderSlots();
  const shelled = frame === "shell" && mode === "layout";

  const [paneCommands] = useState(createPaneCommandHub);
  /* The layout mounts on its first show and draws its own bar from then on, so a tab that a reveal
     opened in Properties takes the shared one until then. */
  const layoutMounted = useRef(false);
  if (layout !== undefined && mode === "layout") layoutMounted.current = true;
  const layoutTitle = layout?.title() ?? null;
  const shell = layout?.shell;
  const readOnly = handle.readOnly;
  const menu = useMemo<ObjectMenu>(
    () => ({
      documentId,
      document: handle.document,
      asset,
      object,
      file,
      readOnly,
      mode,
      onMode: setMode,
      layoutTitle,
      shell,
      shelled,
      keyScope: steps.root,
      onShowInFile: showFile,
      onDuplicate: readOnly === null ? () => setDuplicating(true) : undefined,
      onCollapseAll:
        mode === "properties" ? () => setCollapseAllSignal((count) => count + 1) : undefined,
      onReload: reopen,
    }),
    [
      documentId,
      handle.document,
      asset,
      object,
      file,
      readOnly,
      mode,
      layoutTitle,
      shell,
      shelled,
      steps.root,
      showFile,
      reopen,
    ],
  );

  return (
    <ProjectSwitchContext value={toProject}>
      <DocumentFrame
        ref={steps.root}
        data-ui="ObjectDocument"
        /* Focusable, so a click anywhere in the tab is where the timeline's step keys land. */
        tabIndex={-1}
        className="outline-none"
        onKeyDown={steps.onKeyDown}
      >
        <DocumentToolbar active={active}>
          <ShellHeaderSlot name="menubar" onElement={registerSlot} className="min-w-0 flex-3" />
          <span className="flex min-w-0 shrink-0 items-center gap-2 px-1 text-row text-surface-400 select-none">
            <span className="flex shrink-0 items-center gap-0.5">
              <SandboxOptions documentId={documentId} handle={handle} />
              <CaretRightIcon weight="bold" className="size-3 shrink-0 text-surface-500" />
            </span>
            <ClassCard classHash={object.classHash} name={object.class} />
          </span>
          {shelled && (
            <>
              <Separator orientation="vertical" className="mx-0 h-4 bg-surface-veil-strong" />
              <ShellHeaderSlot name="crumb" onElement={registerSlot} className="min-w-0 flex-1" />
            </>
          )}
          {layout && (
            <SegmentedControl
              size="sm"
              aria-label={m.workshop_bin_view_mode_label()}
              value={mode}
              onChange={setMode}
              options={[
                { value: "layout", label: layout.title() },
                {
                  value: "properties",
                  label: m.workshop_bin_mode_properties_label(),
                },
              ]}
            />
          )}
          <BinEditState
            document={handle.document}
            asset={asset}
            readOnly={handle.readOnly}
            onReload={reopen}
          />
          {shelled && <ShellHeaderSlot name="panes" onElement={registerSlot} />}
        </DocumentToolbar>
        <DuplicateObjectDialog
          open={duplicating}
          onClose={() => setDuplicating(false)}
          document={handle.document}
          asset={asset}
          file={file}
          object={object}
        />
        {shelled && (
          <ShellHeaderSlot
            name="toolbar"
            onElement={registerSlot}
            className="shrink-0 gap-2 border-b border-surface-700/50 px-2 py-1 empty:hidden"
          />
        )}
        <ShellHeaderContext value={slots}>
          <ObjectMenuContext value={menu}>
            <PaneCommandsContext value={paneCommands}>
              {!layoutMounted.current && <ObjectMenubar />}
              <CurveDockContext value={dock}>
                <Group id="object" orientation="vertical" className="flex min-h-0 flex-1 flex-col">
                  <Panel id="view" minSize={160} className="flex min-h-0 w-full flex-col">
                    {layout && (
                      <RetainedContent
                        active={mode === "layout"}
                        defer
                        className="flex min-h-0 flex-1 flex-col"
                      >
                        <ClassView
                          document={handle.document}
                          asset={asset}
                          editable={
                            (layout.editable === true ||
                              (layout.shell !== undefined && EDITABLE_SHELLS.has(layout.shell))) &&
                            handle.readOnly === null
                          }
                          roots={roots}
                          classHash={object.classHash}
                          layout={layout}
                          objectName={objectName}
                          onNotOpen={reopen}
                          onShowInProperties={showInProperties}
                          onFrame={setFrame}
                        />
                      </RetainedContent>
                    )}
                    <RetainedContent
                      active={mode === "properties"}
                      defer
                      className="flex min-h-0 flex-1 flex-col"
                    >
                      <BinTree
                        document={handle.document}
                        asset={asset}
                        roots={roots}
                        rootOwner={object.classHash}
                        label={object.name}
                        reveal={reveal}
                        objectName={objectName}
                        onNotOpen={reopen}
                        editable={handle.readOnly === null}
                        rootEntry={object.entry}
                        collapseAllSignal={collapseAllSignal}
                      />
                    </RetainedContent>
                  </Panel>
                  {docked && (
                    <>
                      <Seam orientation="vertical" variant="divider" />
                      <Panel
                        id="curve"
                        defaultSize={220}
                        minSize={140}
                        maxSize="60%"
                        /* DS-GROUND: a band over the page, as every other pane of the tab is. */
                        className="flex min-h-0 w-full flex-col bg-surface-900 p-2"
                      >
                        <CurveSurface document={handle.document} />
                      </Panel>
                    </>
                  )}
                </Group>
              </CurveDockContext>
            </PaneCommandsContext>
          </ObjectMenuContext>
        </ShellHeaderContext>
      </DocumentFrame>
    </ProjectSwitchContext>
  );
}
