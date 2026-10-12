import { GitBranchIcon, ShootingStarIcon, SparkleIcon } from "@phosphor-icons/react";
import { Handle, type NodeProps, Position } from "@xyflow/react";
import { type ReactNode, use, useMemo } from "react";

import { Button, Tooltip } from "@/components";
import { m } from "@/i18n";
import { twMerge } from "@/utils";

import { useClassSchema } from "../../../classes/hooks/useClassSchema";
import { nameHash } from "../../../shared/utils/binHash";
import { LeafEditContext } from "../../../tree/hooks/useLeafEdit";
import {
  BoneField,
  ChildMarks,
  ChildRowActions,
  OpenChildButton,
  useChildPresence,
} from "../../children/ChildControls";
import {
  CHILD_FIELD,
  type ChildEmitter,
  CHILD_SET_CLASS,
  systemLeaf,
} from "../../children/childModel";
import type { ChildActions } from "../../children/useChildren";
import type { SystemModel } from "../../engine/model/model";
import { childPath } from "../../engine/simulation/children";
import { useEmitters } from "../../inspector/state/emitterChoice";
import { useVfxRun, VfxRunContext } from "../../playback/state/run";
import { VfxSystem as VfxSystemDraw } from "../../rendering/components/VfxSystem";
import { useVfxMeshes } from "../../rendering/hooks/useVfxMeshes";
import { useVfxTextures } from "../../rendering/hooks/useVfxTextures";
import { drawnUnder } from "../../rendering/utils/definitions";
import { definitionBounds } from "../../rendering/utils/systemBounds";
import { useBackdropColor } from "../state/previewBackdrop";
import type { ChildrenItem, ChildSystemItem } from "../utils/graphItems";
import { holderRow } from "../utils/holderRow";
import { itemSubtitle, itemTitle } from "../utils/nodeText";
import { outputTop } from "../utils/outputSocket";
import { embeddedLists, embeddedValues } from "../utils/socketEmbed";
import { CHILD_LINE_LABEL, ChildAddLine, useGraphChildActions } from "./ChildLines";
import { MasterLine } from "./EmitterNodes";
import { FramedCamera, framingOf, PREVIEW_MIP_WIDTH, ViewGuard } from "./EmitterPreview";
import { RunToggles } from "./EmitterRunToggles";
import { FIELD_PAD, FieldBody, Line, NoteLine, useRowsAt } from "./FieldLines";
import { FollowFraming } from "./FollowFraming";
import { GraphActionsContext } from "./graphActions";
import {
  type ChildrenFlowNode,
  type ChildSystemFlowNode,
  NodeHeader,
  Output,
  SOCKET,
  socketFill,
} from "./GraphNodes";
import { NodeFrame } from "./NodeFrame";
import { NODE_BOX } from "./NodePreviews";
import { PreviewView } from "./PreviewView";

const SET_CLASS = nameHash(CHILD_SET_CLASS);

/** The value side of a Children node's own line. */
const LINE_VALUE = "flex min-w-0 flex-1 items-center gap-1 border-l border-surface-700/40 pl-2";

/**
 * An emitter's child set: the set's own fields, a line per child with the socket its system
 * node feeds and its bone, and the picker that adds one. "Child systems" in
 * docs/ux/VFX_GRAPH.md.
 */
export function ChildrenNodeView({ data, selected }: NodeProps<ChildrenFlowNode>) {
  const { item, width, height, nameWidth } = data.placed;

  return (
    <NodeFrame width={width} height={height} selected={selected} item={item}>
      <NodeHeader
        icon={GitBranchIcon}
        iconTone="text-bin-class-text"
        title={itemTitle(item)}
        subtitle={itemSubtitle(item)}
        id={item.id}
        wire={item.wire}
        inputs={item.ports.length}
        extra={item.set.starved && <StarvedMark />}
      />
      <div className={FIELD_PAD}>
        <ChildrenBody item={item} nameWidth={nameWidth} />
      </div>
      <Output kind={null} top={outputTop(item)} />
    </NodeFrame>
  );
}

/** The header mark of a bone set with fewer bones than children. */
function StarvedMark() {
  return (
    <Tooltip content={m.workshop_bin_child_starved_hint()}>
      {/* DS-TEXT */}
      <span className="shrink-0 rounded-sm bg-warning/15 px-1 text-meta text-warning-text">
        {m.workshop_bin_child_starved_label()}
      </span>
    </Tooltip>
  );
}

function ChildrenBody({ item, nameWidth }: { item: ChildrenItem; nameWidth?: number }) {
  const { actions, targets, entry } = useGraphChildActions(item.emitterPath, item.set);
  const rows = useRowsAt(item.wire, item.set.fields);
  const { data: schema } = useClassSchema(SET_CLASS);
  const setRow = useMemo(() => holderRow(entry, item.wire), [entry, item.wire]);
  const embedded = useMemo(() => embeddedValues(item), [item]);
  const lists = useMemo(() => embeddedLists(item), [item]);
  const shown = useMemo(() => (rows === null ? [] : [...rows.values()]), [rows]);

  return (
    <FieldBody wire={item.wire} rows={shown} nameWidth={nameWidth}>
      {item.fields.map((field) => (
        <SetLine
          key={field.hash}
          unread={field.hash === CHILD_FIELD.probability && !item.set.probabilityRead}
        >
          <MasterLine
            field={field}
            row={rows?.get(`${item.wire}.${field.hash.slice(2)}`)}
            holder={setRow}
            schema={schema?.fields}
            owner={SET_CLASS}
            embedded={embedded}
            lists={lists}
            nameWidth={nameWidth}
          />
        </SetLine>
      ))}
      {item.systems.map((system) => (
        <ChildLine key={system.id} system={system} actions={actions} />
      ))}
      <ChildAddLine actions={actions} targets={targets} entry={entry} />
    </FieldBody>
  );
}

/**
 * One of the set's own fields. A field the set does not read is drawn dimmed and takes no edit:
 * `childrenProbability` of a set that writes a bone, or of one with a single child.
 */
function SetLine({ unread, children }: { unread: boolean; children: ReactNode }) {
  if (!unread) return children;

  return (
    <div aria-disabled className="opacity-50">
      <LeafEditContext value={null}>{children}</LeafEditContext>
    </div>
  );
}

/** One child of a Children node: its socket, its place and system, its bone and its actions. */
function ChildLine({ system, actions }: { system: ChildSystemItem; actions: ChildActions }) {
  const { child, set } = system;

  return (
    <Line>
      <Handle
        type="target"
        position={Position.Left}
        id={system.id}
        isConnectable={false}
        isConnectableStart={false}
        isConnectableEnd={false}
        className={twMerge(SOCKET, socketFill(null))}
      />
      <span className={twMerge(CHILD_LINE_LABEL, "text-surface-200")}>
        <span className="text-surface-500">[{child.index}]</span> {systemLeaf(child.label)}
      </span>
      <div className={LINE_VALUE}>
        <ChildMarks set={set} child={child} />
        <span className="min-w-0 flex-1">
          <BoneField child={child} actions={actions} />
        </span>
        <ChildRowActions child={child} count={set.children.length} actions={actions} />
      </div>
    </Line>
  );
}

/**
 * One child system of a set: its name, the run's live instances of it, and its emitters. It
 * opens folded to its header and preview. A child the resolver did not reach draws its link
 * or key under a warning mark and no preview.
 */
export function ChildSystemNodeView({ data, selected }: NodeProps<ChildSystemFlowNode>) {
  const { item, width, height } = data.placed;
  const folded = use(GraphActionsContext)?.collapsed.has(item.id) ?? false;
  const run = use(VfxRunContext);
  const parent = run?.system?.emitters.find(
    (each) => each.simple === item.parent.simple && each.listIndex === item.parent.listIndex,
  );
  const path = parent === undefined ? null : childPath("", parent.index, item.child.index);
  const presence = useChildPresence(parent?.index ?? null, path);
  const resolved = item.child.system !== null;
  const model = parent?.childSet?.children[item.child.index] ?? null;

  return (
    <NodeFrame
      width={width}
      height={height}
      selected={selected}
      item={item}
      plate={resolved ? "above" : "inside"}
      dim={presence?.hidden === true}
    >
      <NodeHeader
        icon={ShootingStarIcon}
        iconTone="text-accent-400"
        title={itemTitle(item)}
        subtitle={itemSubtitle(item)}
        id={item.id}
        wire={item.wire}
        folds
        narrow
        extra={
          <>
            <ChildMarks set={item.set} child={item.child} />
            {run !== null && presence !== null && path !== null && resolved && (
              <RunToggles
                muted={presence.muted}
                soloed={presence.soloed}
                onMute={() => run.toggleChildMuted(path)}
                onSolo={() => run.toggleChildSoloed(path)}
              />
            )}
            <OpenChildButton child={item.child} />
          </>
        }
      />
      {resolved && <ChildPreview path={path} />}
      {!folded && (
        <div className={twMerge(FIELD_PAD, "nodrag flex flex-col")}>
          {item.child.emitters.length === 0 && (
            <NoteLine label={m.workshop_bin_child_emitters_empty()} />
          )}
          {item.child.emitters.map((emitter) => (
            <EmitterLine
              key={`${emitter.simple}:${emitter.listIndex}`}
              item={item}
              emitter={emitter}
              path={path}
              model={model}
            />
          ))}
        </div>
      )}
      <Output kind={null} top={outputTop(item)} />
    </NodeFrame>
  );
}

interface EmitterLineProps {
  item: ChildSystemItem;
  emitter: ChildEmitter;
  /** The child's path in the run, and null outside a run. */
  path: string | null;
  /** The child system as the run reads it, and null outside a run. */
  model: SystemModel | null;
}

/**
 * One emitter of a child system. A click selects it into the inspector under the child
 * banner, as its timeline lane does.
 */
function EmitterLine({ item, emitter, path, model }: EmitterLineProps) {
  const entry = use(GraphActionsContext)?.entry ?? "";
  const { cards, chooseChild } = useEmitters();
  const chosen = model?.emitters.find(
    (each) => each.simple === emitter.simple && each.listIndex === emitter.listIndex,
  );
  const select = () => {
    if (path === null || model === null || chosen === undefined) return;

    const parent = `${entry}:${item.emitterPath}`;
    chooseChild({
      path,
      parent: cards.some((card) => card.key === parent) ? parent : null,
      system: model,
      emitter: chosen,
    });
  };

  return (
    <Line className="gap-1 px-1">
      <Button
        variant="ghost"
        size="xs"
        className="min-w-0 flex-1 justify-start"
        disabled={chosen === undefined}
        left={<SparkleIcon weight="duotone" className="size-3.5 shrink-0 text-accent-400" />}
        onClick={select}
      >
        <span className="min-w-0 truncate">{emitter.name}</span>
        <span className="shrink-0 text-surface-500">[{emitter.listIndex}]</span>
      </Button>
      {emitter.children > 0 && (
        <Tooltip content={m.workshop_bin_child_grandchildren_hint({ count: emitter.children })}>
          <span className="shrink-0 rounded-sm bg-surface-veil px-1 text-meta text-surface-300">
            +{emitter.children}
          </span>
        </Tooltip>
      )}
    </Line>
  );
}

/**
 * A child system node's picture: every live instance of the child in the run, and of the
 * children under it, drawn by the viewport's renderer at the run's time. Nothing draws while
 * no particle of the parent has spawned one.
 */
function ChildPreview({ path }: { path: string | null }) {
  const system = use(VfxRunContext)?.system ?? null;

  return (
    <div className={NODE_BOX}>
      <PreviewView className="size-full">
        {system !== null && path !== null && <ChildScene system={system} path={path} />}
      </PreviewView>
    </div>
  );
}

function ChildScene({ system, path }: { system: SystemModel; path: string }) {
  const { driver, rig, document } = useVfxRun();
  const backdrop = useBackdropColor();
  const drawn = useMemo(() => drawnUnder(system, path), [system, path]);
  const textures = useVfxTextures(drawn, undefined, PREVIEW_MIP_WIDTH);
  const meshes = useVfxMeshes(drawn);
  const framing = useMemo(
    () => framingOf(definitionBounds(system, drawn, rig.rig)),
    [system, drawn, rig.rig],
  );

  return (
    <>
      <color attach="background" args={[backdrop]} />
      <ViewGuard />
      {framing !== null && <FramedCamera framing={framing} />}
      {framing !== null && <FollowFraming drawn={drawn} meshes={meshes} framing={framing} />}
      {drawn.length > 0 && (
        <VfxSystemDraw
          drawn={drawn}
          driver={driver}
          textures={textures}
          meshes={meshes}
          document={document}
          drawOnly
        />
      )}
    </>
  );
}
