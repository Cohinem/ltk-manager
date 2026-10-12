import {
  ArrowDownIcon,
  ArrowSquareOutIcon,
  ArrowUpIcon,
  TrashIcon,
  WarningIcon,
} from "@phosphor-icons/react";
import { use } from "react";

import { IconButton, InputDefaultContext, Readout, Tooltip } from "@/components";
import { m } from "@/i18n";

import { useLinkOpen } from "../../links/hooks/useLinkTargets";
import { VfxRunContext } from "../playback/state/run";
import { anySolo, underChild } from "../rendering/utils/definitions";
import { type AuthoredChild, type AuthoredChildSet, systemLeaf } from "./childModel";
import type { ChildActions } from "./useChildren";

/**
 * A child's entry of `boneToSpawnAt`, as a text field that is empty for a child with no bone.
 * Clearing the last bone of a set removes the list.
 */
export function BoneField({ child, actions }: { child: AuthoredChild; actions: ChildActions }) {
  const label = m.workshop_bin_child_bone_label();
  const bone = child.bone ?? "";
  const commit = (text: string) => {
    const next = text.trim();
    if (next !== bone) void actions.setBone?.(child.index, next);
  };

  return (
    <InputDefaultContext value={bone === ""}>
      <Readout
        key={bone}
        value={bone}
        placeholder={label}
        aria-label={label}
        className="w-full"
        onCommit={actions.setBone === null ? undefined : commit}
      />
    </InputDefaultContext>
  );
}

/** The marks beside a child's name: it is unresolved, or the child index selects it. */
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
        <span className="shrink-0 rounded-sm bg-accent-500/20 px-1 text-meta text-accent-200">
          {m.workshop_bin_child_picked_label()}
        </span>
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
