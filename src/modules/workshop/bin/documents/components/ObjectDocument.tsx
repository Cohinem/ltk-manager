import {
  CaretRightIcon,
  CodeBlockIcon,
  CopyIcon,
  DotsThreeVerticalIcon,
  FileIcon,
  HashIcon,
  MagnifyingGlassIcon,
  PathIcon,
} from "@phosphor-icons/react";
import {
  type MouseEvent as ReactMouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Group, Panel } from "react-resizable-panels";

import {
  Button,
  IconButton,
  Menu,
  RetainedContent,
  SegmentedControl,
  Separator,
  Spinner,
} from "@/components";
import { useCopyToClipboard } from "@/hooks";
import { m } from "@/i18n";
import type { AssetRef, BinDocumentHandle, BinDocumentId, BinObjectHeader } from "@/lib/tauri";
import {
  DocumentToolbar,
  type EditorDocumentProps,
  Seam,
  useNarrowToolbar,
} from "@/modules/editor";

import type { ContentDocumentOf } from "../../../documents/utils/contentDocument";
/* The leaf rather than the objects browser barrel, which pulls the document that routes here. */
import { useSystemSteps } from "../../../objectsBrowser/hooks/useSystemSteps";
/* The leaf rather than the preview barrel, which pulls the document that routes here. */
import { BinPreview } from "../../../preview/components/BinPreview";
/* The leaf rather than the references barrel, which pulls the document that routes here. */
import {
  classReferences,
  objectReferences,
  useFindReferences,
} from "../../../references/api/useFindReferences";
import { CollapseAllButton } from "../../../shared/components/CollapseAllButton";
import { DocumentFrame } from "../../../shared/components/DocumentFrame";
import {
  clickIntent,
  useCurveAimRequest,
  useLendOpenBin,
  useOpenShellPane,
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
import { OtherDeclarations } from "../../links/components/OtherDeclarations";
import { useShowInFile } from "../../links/hooks/useShowInFile";
import {
  ShellHeaderContext,
  ShellHeaderSlot,
  useShellHeaderSlots,
} from "../../shell/state/shellHeader";
import type { ShellKind } from "../../shell/utils/shellPanes";
import { BinTree, type TreeReveal } from "../../tree/components/BinTree";
import { useBinDocument, useObjectRoots } from "../hooks/useBinDocument";
import { useBinTab } from "../hooks/useBinTab";
import { useCopyDeclaration, useRowDeclaration } from "../hooks/useDeclared";
import { ProjectSwitchContext } from "../state/projectSwitch";
import { BinEditState } from "./BinEditState";
import { DeclarationsOffNotice } from "./DeclarationsOffNotice";
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
  const narrow = useNarrowToolbar();
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
  const [chosen, setMode] = useState<Mode | null>(null);
  const mode: Mode = chosen ?? (layout ? "layout" : "properties");
  const [reveal, setReveal] = useState<TreeReveal | null>(null);
  const [collapseAllSignal, setCollapseAllSignal] = useState(0);
  const [frame, setFrame] = useState<LayoutFrame>("stack");
  const [target, setTarget] = useState<CurveTarget | null>(null);
  /* Apart from the target, so a follow that lets go of it leaves the dock open. */
  const [aimed, setAimed] = useState(false);
  /* A shell with a curve pane holds the curve there (ADR-0031), so the dock is what every
     other frame and Properties get, and no tab draws the surface twice. */
  const paned = frame === "shell" && layout !== undefined && shellHoldsCurve(layout);
  const openShellPane = useOpenShellPane(layout?.shell ?? "vfx");
  /* A reader who closed the curve pane gets it back by asking for a curve. */
  const aim = useCallback(
    (next: CurveTarget) => {
      setTarget(next);
      setAimed(true);
      if (paned) openShellPane("curve");
    },
    [paned, openShellPane],
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
          <span className="flex min-w-0 shrink-0 items-center gap-2 px-1 text-row text-surface-400 select-none">
            <span className="flex shrink-0 items-center gap-0.5">
              <SandboxOptions documentId={documentId} handle={handle} />
              <CaretRightIcon weight="bold" className="size-3 shrink-0 text-surface-500" />
            </span>
            <ClassCard classHash={object.classHash} name={object.class} />
            {!narrow && (
              <OtherDeclarations asset={asset} objectHash={object.entry} objectPath={objectPath} />
            )}
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
          {!narrow && (
            <Button
              variant="ghost"
              size="sm"
              left={<FileIcon className="size-4" />}
              onClick={showFile}
            >
              {m.workshop_bin_show_in_file_action()}
            </Button>
          )}
          <CollapseAllButton
            onCollapse={() => setCollapseAllSignal((count) => count + 1)}
            disabled={mode !== "properties"}
          />
          <BinEditState
            document={handle.document}
            asset={asset}
            readOnly={handle.readOnly}
            onReload={reopen}
          />
          {shelled && <ShellHeaderSlot name="panes" onElement={registerSlot} />}
          <HeaderMenu
            document={handle.document}
            object={object}
            onShowInFile={narrow ? showFile : undefined}
          />
        </DocumentToolbar>
        {shelled && (
          <ShellHeaderSlot
            name="toolbar"
            onElement={registerSlot}
            className="shrink-0 gap-2 border-b border-surface-700/50 px-2 py-1 empty:hidden"
          />
        )}
        {handle.readOnly === "declarationsOff" && (
          <DeclarationsOffNotice asset={asset} file={file} subject={objectPath} />
        )}
        <ShellHeaderContext value={slots}>
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
                        layout.shell !== undefined &&
                        EDITABLE_SHELLS.has(layout.shell) &&
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
        </ShellHeaderContext>
      </DocumentFrame>
    </ProjectSwitchContext>
  );
}

/** Which way the tab draws its object: its class's layout, or the tree. */
type Mode = "layout" | "properties";

interface HeaderMenuProps {
  /** The open the object is read under. */
  document: BinDocumentId;
  object: BinObjectHeader;
  /** Show in file, where the toolbar is too narrow to carry it as a button of its own. */
  onShowInFile?: (event: ReactMouseEvent) => void;
}

/** The header's actions, which no row underneath carries. `DS-MENU-SCOPE`, `DS-GLYPH-ROLE`. */
function HeaderMenu({ document, object, onShowInFile }: HeaderMenuProps) {
  const copy = useCopyToClipboard();
  const spelled = useRowDeclaration(document, object.entry, "");
  const copyDeclaration = useCopyDeclaration();
  const findReferences = useFindReferences();
  const label = m.workshop_bin_object_actions_label();
  const objectClass = object.class;

  return (
    <Menu.Root>
      <Menu.Trigger
        render={<IconButton size="sm" icon={<DotsThreeVerticalIcon />} aria-label={label} />}
      />
      <Menu.Content align="end" sideOffset={4} className="w-56">
        {onShowInFile && (
          <>
            <Menu.Item icon={<FileIcon className="size-4" />} onClick={onShowInFile}>
              {m.workshop_bin_show_in_file_action()}
            </Menu.Item>
            <Menu.Separator />
          </>
        )}
        <Menu.Item
          icon={<MagnifyingGlassIcon className="size-4" />}
          onClick={() => findReferences(objectReferences(object.entry, object.name))}
        >
          {m.workshop_references_find_object_action()}
        </Menu.Item>
        <Menu.Item
          icon={<MagnifyingGlassIcon className="size-4" />}
          onClick={() => findReferences(classReferences(object.classHash, object.class))}
        >
          {m.workshop_references_find_class_action()}
        </Menu.Item>
        <Menu.Separator />
        <Menu.Item
          icon={<PathIcon className="size-4" />}
          onClick={() => void copy(object.name, m.workshop_bin_path_label())}
        >
          {m.workshop_bin_copy_path_action()}
        </Menu.Item>
        <Menu.Item
          icon={<CodeBlockIcon className="size-4" />}
          disabled={spelled?.declaration == null}
          title={
            spelled !== null && spelled.declaration === null
              ? m.workshop_bin_copy_declaration_refused_hint()
              : undefined
          }
          onClick={() => spelled !== null && copyDeclaration(spelled)}
        >
          {m.workshop_bin_copy_declaration_action()}
        </Menu.Item>
        <Menu.Item
          icon={<HashIcon className="size-4" />}
          onClick={() => void copy(object.entry, m.workshop_bin_hash_label())}
        >
          {m.workshop_bin_copy_hash_action()}
        </Menu.Item>
        {objectClass !== null && (
          <Menu.Item
            icon={<CopyIcon className="size-4" />}
            onClick={() => void copy(objectClass, m.workshop_bin_name_label())}
          >
            {m.workshop_bin_copy_class_name_action()}
          </Menu.Item>
        )}
        <Menu.Item
          icon={<HashIcon className="size-4" />}
          onClick={() => void copy(object.classHash, m.workshop_bin_hash_label())}
        >
          {m.workshop_bin_copy_class_hash_action()}
        </Menu.Item>
      </Menu.Content>
    </Menu.Root>
  );
}
