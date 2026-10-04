import { WarningIcon } from "@phosphor-icons/react";
import { createContext, type MouseEvent, type ReactNode, use } from "react";

import { Stack } from "@/components";
import { m } from "@/i18n";
import type { BinDocumentId, BinRow, SkinModel } from "@/lib/tauri";
import type { ChainParameter, ColliderFile, Pose } from "@/modules/viewport";
import { twMerge } from "@/utils";

import { NAME_COLUMN } from "../../classes/components/ClassCells";
import { type SpecialField, StructFields } from "../../vfx/inspector/components/StructFields";
import type { ColliderEdit } from "../hooks/useColliders";
import type { DynamicsDiagnostic, DynamicsDiagnosticCode } from "../utils/dynamicsDiagnostics";
import { dynamicsFields } from "../utils/dynamicsLabels";

const DIAGNOSTIC: Record<DynamicsDiagnosticCode, () => string> = {
  treeRootMissing: m.workshop_bin_physics_diagnostic_tree_root_missing_hint,
  treeOverlap: m.workshop_bin_physics_diagnostic_tree_overlap_hint,
  treeNoLength: m.workshop_bin_physics_diagnostic_tree_no_length_hint,
  curveClamped: m.workshop_bin_physics_diagnostic_curve_clamped_hint,
  rodUnread: m.workshop_bin_physics_diagnostic_rod_unread_hint,
  stretchUnread: m.workshop_bin_physics_diagnostic_stretch_unread_hint,
  linksAlone: m.workshop_bin_physics_diagnostic_links_alone_hint,
  socketNamedJoint: m.workshop_bin_physics_diagnostic_socket_named_joint_hint,
  socketDuplicate: m.workshop_bin_physics_diagnostic_socket_duplicate_hint,
  socketParentMissing: m.workshop_bin_physics_diagnostic_socket_parent_missing_hint,
  springJointMissing: m.workshop_bin_physics_diagnostic_spring_joint_missing_hint,
};

/** What the fields of the Physics pane read beside their own rows. */
export interface PhysicsScope {
  readonly document: BinDocumentId;
  /** The skin object, `0x` and eight hex digits. */
  readonly entry: string;
  readonly skin: SkinModel;
  /** The skeleton in its bind pose, which a field names a joint from. */
  readonly pose: Pose;
  /** The shapes of each chain's collider file, by the chain's hash path. */
  readonly shapes: ReadonlyMap<string, ColliderFile>;
  /** The writes of the shapes, and null where the view is read-only. */
  readonly colliders: ColliderEdit | null;
  /** Every diagnostic of the skin, which an item or a row looks its own up in by path. */
  readonly diagnostics: readonly DynamicsDiagnostic[];
}

export const PhysicsScopeContext = createContext<PhysicsScope | null>(null);

export function usePhysicsScope(): PhysicsScope {
  const scope = use(PhysicsScopeContext);
  if (scope === null) throw new Error("A field of the Physics pane drew outside its PhysicsPane");

  return scope;
}

/** Whether the struct at `path`, or one under it, holds a diagnostic. */
export function useMarked(path: string): boolean {
  return usePhysicsScope().diagnostics.some(
    (each) => each.path === path || each.path.startsWith(`${path}.`),
  );
}

/** The diagnostics of the struct at `path`, each a line over its fields or under its row. */
export function Marks({ path, parameter }: { path: string; parameter?: ChainParameter }) {
  const found = usePhysicsScope().diagnostics.filter(
    (each) => each.path === path && each.parameter === parameter,
  );
  if (found.length === 0) return null;

  return (
    <Stack gap={0.5}>
      {found.map((each) => (
        <span key={each.code} className="flex items-start gap-1 text-meta text-warning-text">
          <WarningIcon aria-hidden className="mt-0.5 size-3 shrink-0" />
          {DIAGNOSTIC[each.code]()}
        </span>
      ))}
    </Stack>
  );
}

interface HintProps {
  readonly className?: string;
  readonly children: ReactNode;
}

export function Hint({ className, children }: HintProps) {
  return <p className={twMerge("text-meta text-surface-400 select-none", className)}>{children}</p>;
}

function stop(event: MouseEvent) {
  event.stopPropagation();
}

/**
 * The value of a field row drawn by hand, whose controls take the click the row would
 * unfold on. `sans` draws names in the interface's face, where the row is mono.
 */
export function ValueSlot({ sans = false, children }: { sans?: boolean; children: ReactNode }) {
  return (
    <span
      className={twMerge("flex min-w-0 flex-1 items-center gap-2", sans && "font-sans")}
      onClick={stop}
    >
      {children}
    </span>
  );
}

/**
 * Every field of the struct `row` as the inspector draws a field: its name, which opens the
 * field card, and its value in the box its kind is edited in.
 *
 * "The physics pane" in docs/ux/SKIN_EDITOR.md.
 */
export function Fields({
  row,
  depth = 0,
  special,
}: {
  row: BinRow;
  depth?: number;
  special?: SpecialField;
}) {
  const { document } = usePhysicsScope();
  if (row.value.type !== "struct") return null;

  return (
    <div data-ui="Fields" className="font-mono text-mono-row">
      <StructFields
        document={document}
        row={row}
        classHash={row.value.classHash}
        width={NAME_COLUMN}
        depth={depth}
        arrange={dynamicsFields}
        special={special}
      />
    </div>
  );
}
