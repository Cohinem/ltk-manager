import {
  CaretDownIcon,
  CaretUpIcon,
  EyeIcon,
  EyeSlashIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import { type ReactNode, type Ref, use } from "react";

import { Count, IconButton } from "@/components";
import { m } from "@/i18n";
import type { BinRow, PoseModifier } from "@/lib/tauri";

import { FoldCaret } from "../../shared/components/FoldCaret";
import { COLUMN_STYLE } from "../../vfx/inspector/components/EmitterInspector";
import { useDynamicsEdit } from "../hooks/useDynamicsEdit";
import { SkinChoiceContext } from "../state/skinChoice";
import { removeEdits } from "../utils/dynamicsEdits";
import type { PhysicsItem } from "../utils/physicsItems";
import { modifierKind } from "../utils/poseModifiers";
import { ChainFields } from "./ChainFields";
import { OrientationFields } from "./OrientationFields";
import { Fields, Hint, Marks, usePhysicsScope } from "./PhysicsCells";

export interface PhysicsHeadProps {
  readonly ref?: Ref<HTMLDivElement>;
  readonly item: PhysicsItem;
  /** Where the item stands in its list, from 0. */
  readonly index: number;
  /** How many items the list holds. */
  readonly count: number;
  /** The list is unfolded under the head. */
  readonly listed: boolean;
  readonly onToggle: () => void;
  /** Pick the item `by` places down the list. */
  readonly onStep: (by: number) => void;
  /** The item's own controls, before the steps. */
  readonly actions?: ReactNode;
}

/**
 * The picked modifier or socket as one row: the list folded to its pick.
 *
 * "The physics pane" in docs/ux/SKIN_EDITOR.md.
 */
export function PhysicsHead({
  ref,
  item,
  index,
  count,
  listed,
  onToggle,
  onStep,
  actions,
}: PhysicsHeadProps) {
  const choice = use(SkinChoiceContext);
  const send = useDynamicsEdit(usePhysicsScope().entry);
  const muted = choice?.muted.has(item.path) ?? false;
  const Eye = muted ? EyeSlashIcon : EyeIcon;

  return (
    <div
      ref={ref}
      data-ui="PhysicsHead"
      className="flex shrink-0 items-center gap-1.5 border-b border-surface-700/50 px-2 py-1 text-row select-none"
    >
      <span className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5" onClick={onToggle}>
        <FoldCaret
          open={listed}
          onToggle={onToggle}
          label={m.workshop_bin_physics_list_fold_action()}
          className="h-5"
        />
        <item.icon aria-hidden className="size-3.5 shrink-0 text-surface-400" />
        <span className="shrink-0 font-medium text-surface-100">{item.title}</span>
        <span className="min-w-0 flex-1 truncate font-mono text-code text-surface-400">
          {item.detail}
        </span>
      </span>
      {actions}
      <Count>{m.workshop_bin_physics_position_label({ index: index + 1, count })}</Count>
      <IconButton
        size="row"
        icon={<CaretUpIcon />}
        label={m.workshop_bin_physics_previous_action()}
        disabled={index <= 0}
        onClick={() => onStep(-1)}
      />
      <IconButton
        size="row"
        icon={<CaretDownIcon />}
        label={m.workshop_bin_physics_next_action()}
        disabled={index >= count - 1}
        onClick={() => onStep(1)}
      />
      {choice !== null && item.previewed && (
        <IconButton
          size="row"
          pressed={!muted}
          icon={<Eye />}
          label={m.workshop_bin_physics_preview_label()}
          onClick={() => choice.toggleMuted(item.path)}
        />
      )}
      {send !== null && (
        <IconButton
          size="row"
          icon={<TrashIcon />}
          label={m.workshop_bin_physics_remove_action()}
          onClick={() => send(removeEdits(item.path))}
        />
      )}
    </div>
  );
}

export interface PhysicsFieldsProps {
  /** The hash path of the item the fields are of. */
  readonly path: string;
  readonly children: ReactNode;
}

/** The fields of the picked item, which take the pane's whole body and scroll in it. */
export function PhysicsFields({ path, children }: PhysicsFieldsProps) {
  return (
    /* DS-SCROLLBAR */
    <div
      data-ui="PhysicsFields"
      className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto p-2 scrollbar-md"
      style={COLUMN_STYLE}
    >
      <Marks path={path} />
      {children}
    </div>
  );
}

export interface ModifierFieldsProps {
  /** The modifier's own row. */
  readonly row: BinRow;
  readonly modifier: PoseModifier;
}

/**
 * The fields of a pose modifier as its kind lays them out. A kind with no layout of its
 * own draws what it does and its plain fields.
 */
export function ModifierFields({ row, modifier }: ModifierFieldsProps) {
  if (modifier.kind === "dynamicsChain") {
    return <ChainFields row={row} chain={modifier} />;
  }
  if (modifier.kind === "jointOrientation") {
    return <OrientationFields row={row} orientation={modifier} />;
  }

  const hint = modifierKind(modifier.kind)?.hint ?? null;

  return (
    <>
      {hint !== null && <Hint>{hint()}</Hint>}
      <Fields row={row} />
    </>
  );
}
