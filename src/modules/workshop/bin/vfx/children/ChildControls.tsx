import {
  ArrowDownIcon,
  ArrowSquareOutIcon,
  ArrowUpIcon,
  TrashIcon,
  WarningIcon,
} from "@phosphor-icons/react";
import { use, useMemo } from "react";

import { IconButton, Readout, SegmentedControl, Tooltip } from "@/components";
import { m } from "@/i18n";
import type { VfxChildTargets } from "@/lib/tauri";

import { useLinkOpen } from "../../links/hooks/useLinkTargets";
import { JointPicker } from "../../skin/components/JointPicker";
import { LinePicker } from "../drivers/components/LinePicker";
import { VfxRunContext } from "../playback/state/run";
import { anySolo, underChild } from "../rendering/utils/definitions";
import type { SystemStart } from "../templates/SystemTemplatePicker";
import { useVfxTemplates } from "../templates/templateQueries";
import { templateLabel } from "../templates/templateText";
import {
  type AuthoredChild,
  type AuthoredChildSet,
  type SpawnMode,
  systemLeaf,
} from "./childModel";
import { type ChildActions, useHostJoints } from "./useChildren";

/** One entry of the Add child picker: a system to link, an effect key, or a system to create. */
type AddItem =
  | { readonly kind: "link"; readonly entry: string; readonly text: string }
  | { readonly kind: "key"; readonly key: string; readonly text: string }
  | {
      readonly kind: "new";
      readonly id: string;
      readonly start: SystemStart;
      readonly text: string;
    };

interface ChildAddPickerProps {
  actions: ChildActions;
  targets: VfxChildTargets | undefined;
  /** The emitter's system, which a child cannot link without a cycle. */
  holder: string;
}

/**
 * The one-line picker that adds a child: a system of the bin by link, an effect key of its
 * resolvers, or a new system from Blank or a system template.
 */
export function ChildAddPicker({ actions, targets, holder }: ChildAddPickerProps) {
  const templates = useVfxTemplates("system");
  const items = useMemo<AddItem[]>(() => {
    const starts: SystemStart[] = [
      { kind: "blank" },
      ...templates.map((template) => ({ kind: "template" as const, template })),
    ];

    return [
      ...(targets?.systems ?? [])
        .filter((system) => system.entry !== holder)
        .map((system) => ({
          kind: "link" as const,
          entry: system.entry,
          text: m.workshop_bin_child_add_link_label({
            name: systemLeaf(system.name ?? system.entry),
          }),
        })),
      ...(targets?.effectKeys ?? []).map((each) => ({
        kind: "key" as const,
        key: each.key,
        text: m.workshop_bin_child_add_key_label({ name: each.name ?? each.key }),
      })),
      ...starts.map((start) => ({
        kind: "new" as const,
        id: start.kind === "blank" ? "blank" : start.template.id,
        start,
        text: m.workshop_bin_child_add_new_label({
          name:
            start.kind === "blank"
              ? m.workshop_bin_new_object_blank_label()
              : templateLabel(start.template),
        }),
      })),
    ];
  }, [targets, templates, holder]);

  const pick = (item: AddItem) => {
    if (item.kind === "link") void actions.add?.({ naming: "link", entry: item.entry });
    if (item.kind === "key") void actions.add?.({ naming: "key", key: item.key });
    if (item.kind === "new") void actions.create?.(item.start);
  };

  return (
    <LinePicker
      label={m.workshop_bin_child_add_action()}
      items={items}
      itemKey={itemKey}
      itemText={itemText}
      onPick={pick}
      disabled={actions.add === null}
    />
  );
}

function itemKey(item: AddItem): string {
  if (item.kind === "link") return `link:${item.entry}`;
  if (item.kind === "key") return `key:${item.key}`;
  return `new:${item.id}`;
}

function itemText(item: AddItem): string {
  return item.text;
}

/** The switch between one child picked by the probability and every child at its own bone. */
export function SpawnModeSwitch({
  set,
  actions,
}: {
  set: AuthoredChildSet;
  actions: ChildActions;
}) {
  const setMode = actions.setMode;
  const options = [
    { value: "pick" as const, label: m.workshop_bin_child_mode_pick_label() },
    { value: "bones" as const, label: m.workshop_bin_child_mode_bones_label() },
  ];

  return (
    <SegmentedControl<SpawnMode>
      size="sm"
      aria-label={m.workshop_bin_child_mode_label()}
      options={options}
      value={set.mode}
      onChange={(mode) => {
        if (mode !== set.mode) void setMode?.(mode);
      }}
    />
  );
}

/**
 * The bone a child of a bone set spawns at: a picker over the host character's joints, and a
 * text field for a run with no host.
 */
export function BoneField({ child, actions }: { child: AuthoredChild; actions: ChildActions }) {
  const joints = useHostJoints();
  const label = m.workshop_bin_child_bone_label();
  const bone = child.bone ?? "";
  const commit = (next: string) => {
    if (next !== bone) void actions.setBone?.(child.index, next);
  };

  if (joints.length > 0) {
    return (
      <JointPicker
        label={label}
        placeholder={label}
        joints={joints}
        value={bone === "" ? null : bone}
        onPick={commit}
        disabled={actions.setBone === null}
      />
    );
  }

  return (
    <Readout
      key={bone}
      value={bone}
      placeholder={label}
      aria-label={label}
      className="w-full"
      onCommit={actions.setBone === null ? undefined : (text) => commit(text.trim())}
    />
  );
}

/** The marks beside a child's name: it is unresolved, or the probability picks it. */
export function ChildMarks({ set, child }: { set: AuthoredChildSet; child: AuthoredChild }) {
  return (
    <>
      {child.system === null && (
        <Tooltip content={m.workshop_bin_child_unresolved_hint()}>
          {/* DS-TEXT */}
          <span className="flex shrink-0 items-center gap-1 rounded-sm bg-warning/15 px-1 text-meta text-warning-text">
            <WarningIcon weight="bold" className="size-3" />
            {m.workshop_bin_child_unresolved_label()}
          </span>
        </Tooltip>
      )}
      {set.picked === child.index && (
        <Tooltip content={m.workshop_bin_child_picked_hint()}>
          <span className="shrink-0 rounded-sm bg-accent-500/20 px-1 text-meta text-accent-200">
            {m.workshop_bin_child_picked_label()}
          </span>
        </Tooltip>
      )}
    </>
  );
}

/** Open a child's system in its own tab, and nothing for a child the resolver did not reach. */
export function OpenChildButton({ child }: { child: AuthoredChild }) {
  const { wantOpen } = useLinkOpen();
  const entry = child.system?.entry ?? null;
  if (entry === null) return null;

  return (
    <IconButton
      size="xs"
      className="nodrag shrink-0"
      icon={<ArrowSquareOutIcon />}
      label={m.workshop_bin_child_open_action({ name: systemLeaf(child.label) })}
      onClick={() => wantOpen(entry, "default")}
    />
  );
}

/** Move up, Move down and Remove for one child of a set of `count`. */
export function ChildRowActions({
  child,
  count,
  actions,
}: {
  child: AuthoredChild;
  count: number;
  actions: ChildActions;
}) {
  const { move, remove } = actions;
  if (move === null || remove === null) return null;

  return (
    <>
      <IconButton
        size="xs"
        className="nodrag shrink-0"
        icon={<ArrowUpIcon />}
        label={m.workshop_bin_child_move_up_action()}
        disabled={child.index === 0}
        onClick={() => void move(child.index, child.index - 1)}
      />
      <IconButton
        size="xs"
        className="nodrag shrink-0"
        icon={<ArrowDownIcon />}
        label={m.workshop_bin_child_move_down_action()}
        disabled={child.index === count - 1}
        onClick={() => void move(child.index, child.index + 1)}
      />
      <IconButton
        size="xs"
        className="nodrag shrink-0"
        icon={<TrashIcon />}
        label={m.workshop_bin_child_remove_action()}
        onClick={() => void remove(child.index)}
      />
    </>
  );
}

/** A child definition's state in the run: whether the preview leaves it out. */
export interface ChildPresence {
  readonly muted: boolean;
  readonly soloed: boolean;
  /** Muted, under a muted emitter or child, or left out by a solo elsewhere. */
  readonly hidden: boolean;
}

/** The run's state of the child at `path` under the emitter at pool index `root`. */
export function useChildPresence(root: number | null, path: string | null): ChildPresence | null {
  const run = use(VfxRunContext);
  if (run === null || root === null || path === null) return null;

  const muted = run.mutedChildren.has(path);
  const soloed = run.soloedChildren.has(path);
  const out = run.muted.has(root) || underChild(run.mutedChildren, path);
  const alone = run.soloed.has(root) || underChild(run.soloedChildren, path);
  return { muted, soloed, hidden: out || (anySolo(run) && !alone) };
}
