import {
  AnchorIcon,
  BoneIcon,
  CompassIcon,
  PathIcon,
  ProhibitIcon,
  PushPinIcon,
  SpiralIcon,
  WaveSineIcon,
} from "@phosphor-icons/react";
import {
  type KeyboardEvent,
  type ReactNode,
  use,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { Fill, IconButton, SearchField, Tooltip } from "@/components";
import { m } from "@/i18n";
import type { SkinModel } from "@/lib/tauri";
import type { Pose } from "@/modules/viewport";
import { usePreviewArmature, useSetPreviewDisplay } from "@/stores";
import { twMerge } from "@/utils";

import type { ViewContext } from "../../classes/components/ClassCells";
import { FoldCaret } from "../../shared/components/FoldCaret";
import { Notice } from "../../shared/preview/Notice";
import { useDynamicsEdit } from "../hooks/useDynamicsEdit";
import { useSkinBind } from "../hooks/useSkinBind";
import { SkinChoiceContext } from "../state/skinChoice";
import { type JointRoles, jointRoles } from "../utils/dynamicsModel";
import { jointSlot } from "../utils/skinScene";
import { JointActions } from "./JointActions";

/** How far one level of the outline is indented, in pixels. */
const INDENT_PX = 12;

export interface SkeletonPaneProps {
  readonly view: ViewContext;
  /** The skin object, `0x` and eight hex digits, and null where the view holds no row. */
  readonly entry: string | null;
}

/**
 * The joints of a skin's skeleton as an outline, each marked with what it is to the
 * skin's pose modifiers and sockets, and the place physics and sockets are added from.
 *
 * "The skeleton pane" in docs/ux/SKIN_EDITOR.md. The selected joint is the skin choice's,
 * so the viewport marks the same one.
 */
export function SkeletonPane({ view, entry }: SkeletonPaneProps) {
  if (entry === null) return <Notice text={m.workshop_bin_mesh_preview_missing_empty()} />;

  return <Outline view={view} entry={entry} />;
}

function Outline({ view, entry }: { view: ViewContext; entry: string }) {
  const bind = useSkinBind(view.document, entry);
  const [filter, setFilter] = useState("");
  const [folded, setFolded] = useState<ReadonlySet<number>>(() => new Set());
  const choice = use(SkinChoiceContext);
  const editable = useDynamicsEdit(entry) !== null;
  const armature = usePreviewArmature();
  const setDisplay = useSetPreviewDisplay();

  const filtering = filter.trim() !== "";
  const rows = useMemo(
    () => (bind.skin === null ? [] : outlineRows(bind.skin, bind.pose)),
    [bind.skin, bind.pose],
  );
  const shown = useMemo(() => {
    const wanted = filter.trim().toLowerCase();
    if (wanted !== "") return rows.filter((row) => row.name.toLowerCase().includes(wanted));

    return rows.filter((row) => !row.above.some((slot) => folded.has(slot)));
  }, [rows, filter, folded]);

  /* A joint picked in the viewport can sit under a folded one, which opens for it once,
     so a fold the reader makes over the selected joint afterwards stays. */
  const picked = choice?.joint ?? null;
  const unfoldedFor = useRef<string | null>(null);
  useEffect(() => {
    if (picked === unfoldedFor.current) return;

    const row = rows.find((each) => each.kind === "joint" && sameName(picked, each.name));
    if (picked !== null && row === undefined) return;

    unfoldedFor.current = picked;
    if (row === undefined) return;

    setFolded((held) => {
      if (!row.above.some((slot) => held.has(slot))) return held;

      return new Set([...held].filter((slot) => !row.above.includes(slot)));
    });
  }, [picked, rows]);

  /* The joint selected before this one, which a capsule from the selected joint ends on. */
  const [trail, setTrail] = useState<Trail>({ joint: null, before: null });
  if (picked !== trail.joint) setTrail({ joint: picked, before: trail.joint ?? trail.before });

  if (bind.skin === null) return <Notice text={bind.notice} />;

  const model = bind.skin;
  const bound = bind.pose;
  const selected = picked === null ? -1 : bound.jointNamed(picked);
  const before = trail.before === null ? -1 : bound.jointNamed(trail.before);
  const joints = shown.filter((row) => row.kind === "joint");
  const toggle = (slot: number) =>
    setFolded((held) => {
      const next = new Set(held);
      if (!next.delete(slot)) next.add(slot);

      return next;
    });
  const select = (row: OutlineRow | undefined) => {
    if (row !== undefined) choice?.setJoint(row.name);
  };
  const onKeyDown = (event: KeyboardEvent, row: OutlineRow) => {
    /* A key pressed on a row's own button is the button's. */
    if (event.target !== event.currentTarget) return;

    const at = joints.indexOf(row);
    const open = !folded.has(row.slot);
    const moves: Record<string, (() => void) | undefined> = {
      ArrowDown: () => select(joints[at + 1]),
      ArrowUp: () => select(joints[at - 1]),
      Home: () => select(joints[0]),
      End: () => select(joints.at(-1)),
      ArrowRight: () => row.parent && !open && toggle(row.slot),
      ArrowLeft: () => row.parent && open && toggle(row.slot),
      Enter: () => select(row),
      " ": () => select(row),
    };
    const move = moves[event.key];
    if (move === undefined) return;

    event.preventDefault();
    move();
  };

  return (
    <div data-ui="SkeletonPane" className="flex min-h-0 flex-1 flex-col select-none">
      <div className="flex shrink-0 items-center gap-1 border-b border-surface-700/50 px-2 py-1.5">
        <Fill>
          <SearchField
            value={filter}
            onChange={setFilter}
            label={m.workshop_bin_skeleton_filter_placeholder()}
            clearLabel={m.workshop_bin_skeleton_filter_clear_action()}
          />
        </Fill>
        <IconButton
          pressed={armature}
          icon={<BoneIcon />}
          label={m.workshop_bin_skeleton_armature_label()}
          onClick={() => setDisplay({ previewArmature: !armature })}
        />
      </div>
      <div
        data-ui="SkeletonPane:rows"
        role="tree"
        aria-label={m.workshop_bin_pane_skeleton_label()}
        className="flex min-h-0 flex-1 flex-col overflow-auto py-1 scrollbar-md"
      >
        {shown.map((row) => {
          const isSelected = row.kind === "joint" && row.slot === selected;
          /* The tree is one tab stop: the selected joint, and the first where none is. */
          const tabStop = isSelected || (selected < 0 && row === joints[0]);

          return (
            <Row
              key={row.key}
              row={row}
              depth={filtering ? 0 : row.above.length}
              open={!folded.has(row.slot)}
              foldable={row.parent && !filtering}
              selected={isSelected}
              tabStop={tabStop}
              onToggle={() => toggle(row.slot)}
              onSelect={() => choice?.setJoint(isSelected ? null : row.name)}
              onKeyDown={(event) => onKeyDown(event, row)}
              actions={
                editable &&
                row.kind === "joint" &&
                row.roles !== null && (
                  <JointActions
                    document={view.document}
                    entry={entry}
                    skin={model}
                    pose={bound}
                    slot={row.slot}
                    roles={row.roles}
                    selected={selected}
                    before={before}
                  />
                )
              }
            />
          );
        })}
      </div>
    </div>
  );
}

/** The selected joint and the one selected before it, by name. */
interface Trail {
  readonly joint: string | null;
  readonly before: string | null;
}

/** One row of the outline: a joint, or a socket listed under the joint it rides. */
interface OutlineRow {
  readonly key: string;
  readonly kind: "joint" | "socket";
  readonly name: string;
  /** The joint's slot, and its parent joint's for a socket. */
  readonly slot: number;
  /** The joints above it, root first, which fold it away. */
  readonly above: readonly number[];
  readonly parent: boolean;
  readonly roles: JointRoles | null;
}

/** The joints parents first, each socket after the joint it rides, world sockets last. */
function outlineRows(skin: SkinModel, pose: Pose): OutlineRow[] {
  const { joints } = pose.skeleton;
  const roles = jointRoles(skin, pose);
  const children: number[][] = joints.map(() => []);
  const roots: number[] = [];
  pose.parents.forEach((parent, slot) => {
    if (parent >= 0) {
      children[parent].push(slot);
    } else {
      roots.push(slot);
    }
  });

  const riding = new Map<number, string[]>();
  const loose: string[] = [];
  for (const socket of skin.sockets) {
    const slot = socket.kind === "singleJoint" ? jointSlot(pose, socket.parent) : -1;
    if (slot < 0) {
      loose.push(socket.name);
    } else {
      riding.set(slot, [...(riding.get(slot) ?? []), socket.name]);
    }
  }

  const rows: OutlineRow[] = [];
  const walk = (slot: number, above: readonly number[]) => {
    const sockets = riding.get(slot) ?? [];
    rows.push({
      key: `joint:${slot}`,
      kind: "joint",
      name: joints[slot].name,
      slot,
      above,
      parent: children[slot].length + sockets.length > 0,
      roles: roles[slot],
    });

    const under = [...above, slot];
    sockets.forEach((name, at) => {
      rows.push({
        key: `socket:${slot}:${at}`,
        kind: "socket",
        name,
        slot,
        above: under,
        parent: false,
        roles: null,
      });
    });

    for (const child of children[slot]) {
      walk(child, under);
    }
  };
  for (const root of roots) {
    walk(root, []);
  }

  loose.forEach((name, at) => {
    rows.push({
      key: `socket:loose:${at}`,
      kind: "socket",
      name,
      slot: -1,
      above: [],
      parent: false,
      roles: null,
    });
  });

  return rows;
}

function sameName(a: string | null, b: string): boolean {
  return a !== null && a.toLowerCase() === b.toLowerCase();
}

interface RowProps {
  readonly row: OutlineRow;
  readonly depth: number;
  readonly open: boolean;
  /** The row draws a caret, which a filtered outline has no folds for. */
  readonly foldable: boolean;
  readonly selected: boolean;
  /** The row is the tree's tab stop. */
  readonly tabStop: boolean;
  readonly onToggle: () => void;
  readonly onSelect: () => void;
  readonly onKeyDown: (event: KeyboardEvent) => void;
  readonly actions: ReactNode;
}

function Row({
  row,
  depth,
  open,
  foldable,
  selected,
  tabStop,
  onToggle,
  onSelect,
  onKeyDown,
  actions,
}: RowProps) {
  const joint = row.kind === "joint";
  const Glyph = joint ? BoneIcon : AnchorIcon;
  const root = useRef<HTMLDivElement>(null);

  /* The selection moves with the arrow keys, and the focus follows it down the tree. */
  useEffect(() => {
    const element = root.current;
    if (!selected || element === null) return;

    element.scrollIntoView?.({ block: "nearest" });
    if (element.parentElement?.contains(document.activeElement)) element.focus();
  }, [selected]);

  return (
    <div
      ref={root}
      role="treeitem"
      aria-level={depth + 1}
      aria-selected={joint ? selected : undefined}
      aria-expanded={foldable ? open : undefined}
      tabIndex={joint ? (tabStop ? 0 : -1) : undefined}
      data-ui={`SkeletonPane:${row.kind}`}
      /* DS-RADIUS, DS-VEIL */
      className={twMerge(
        "group mx-1 flex h-5 shrink-0 items-center gap-1 rounded-sm pr-1 text-row outline-none",
        joint && "cursor-pointer hover:bg-surface-veil",
        "focus-visible:ring-1 focus-visible:ring-accent-500",
        selected && "bg-accent-500/15 hover:bg-accent-500/25",
      )}
      style={{ paddingLeft: depth * INDENT_PX }}
      onClick={joint ? onSelect : undefined}
      onKeyDown={joint ? onKeyDown : undefined}
    >
      {foldable && (
        <FoldCaret
          open={open}
          onToggle={onToggle}
          label={m.workshop_bin_skeleton_children_action()}
          className="h-5"
        />
      )}
      {!foldable && <span aria-hidden className="w-4 shrink-0" />}
      <Glyph
        aria-hidden
        className={twMerge("size-3.5 shrink-0 text-surface-400", selected && "text-accent-300")}
      />
      <span
        className={twMerge(
          "min-w-0 flex-1 truncate select-text",
          joint ? "text-surface-200" : "text-surface-300",
        )}
      >
        {row.name}
      </span>
      {row.roles !== null && <Badges roles={row.roles} />}
      {actions}
    </div>
  );
}

/** What a joint is to the dynamics, each as a glyph named on hover. */
function Badges({ roles }: { roles: JointRoles }) {
  return (
    <span className="flex shrink-0 items-center gap-1 text-surface-400">
      {roles.treeRoot && (
        <Badge label={m.workshop_bin_skeleton_role_root_label()}>
          <PushPinIcon className="size-3.5 text-accent-300" />
        </Badge>
      )}
      {roles.simulated && (
        <Badge label={m.workshop_bin_skeleton_role_simulated_label()}>
          <WaveSineIcon className="size-3.5 text-accent-300" />
        </Badge>
      )}
      {roles.excluded && (
        <Badge label={m.workshop_bin_skeleton_role_excluded_label()}>
          <ProhibitIcon className="size-3.5" />
        </Badge>
      )}
      {roles.spring && (
        <Badge label={m.workshop_bin_skeleton_role_spring_label()}>
          <SpiralIcon className="size-3.5 text-accent-300" />
        </Badge>
      )}
      {roles.conform && (
        <Badge label={m.workshop_bin_skeleton_role_conform_label()}>
          <PathIcon className="size-3.5 text-accent-300" />
        </Badge>
      )}
      {roles.orientation && (
        <Badge label={m.workshop_bin_skeleton_role_orientation_label()}>
          <CompassIcon className="size-3.5 text-accent-300" />
        </Badge>
      )}
      {roles.sockets > 0 && (
        <Badge label={m.workshop_bin_skeleton_role_socket_label()}>
          <AnchorIcon className="size-3.5" />
        </Badge>
      )}
    </span>
  );
}

function Badge({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Tooltip content={label}>
      <span role="img" aria-label={label} className="flex shrink-0">
        {children}
      </span>
    </Tooltip>
  );
}
