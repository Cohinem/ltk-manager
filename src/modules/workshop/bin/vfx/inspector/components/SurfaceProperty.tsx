import { useQuery } from "@tanstack/react-query";
import { type ReactNode, use, useMemo } from "react";

import { Button, InputDefaultContext, Tooltip } from "@/components";
import { m } from "@/i18n";
import type { BinRow } from "@/lib/tauri";
import { viewportQueries } from "@/modules/viewport";
import { twMerge } from "@/utils";

import { ClassCard } from "../../../classes/components/ClassCard";
import { FieldRow } from "../../../classes/components/ClassCells";
import { FieldLabelsContext } from "../../../classes/state/fieldLabels";
import { useBinRead } from "../../../documents/hooks/useBinRead";
import { nameHash } from "../../../shared/utils/binHash";
import { LeafEditContext } from "../../../tree/hooks/useLeafEdit";
import { RowDocumentContext } from "../../../tree/state/rowFold";
import { useHeldRows } from "../../../tree/state/rowRegistry";
import { childCount, fieldHash, rowKey } from "../../../tree/utils/binRows";
import { useHostSkin } from "../../preview/components/VfxHost";
import { useEmitterModel } from "../state/emitterModel";
import {
  addNameEdits,
  GENERATOR_CLASSES,
  MESH_SURFACE,
  nameEdits,
  partEdits,
  removeNameEdits,
  SKELETON_SURFACE,
  type SourceClass,
  SURFACE,
  SURFACE_CLASS,
  SURFACE_CLASSES,
} from "../utils/emissionSource";
import { type DefaultField, defaultField } from "../utils/emitterGroups";
import { ClassSelect } from "./ClassSelect";
import { NameChips } from "./NameChips";
import { absentRow, type FieldSlot, type SpecialField, StructFields } from "./StructFields";

const NO_ROWS: readonly BinRow[] = [];
const NO_NAMES: readonly string[] = [];

const DEFINITION_CLASS = nameHash(SURFACE_CLASS);

/** A chunk path that is only a 16-digit hash, which cannot be written to a string field. */
const UNNAMED_CHUNK = /^[\da-f]{16}$/i;

const SURFACE_PART: DefaultField = {
  hash: SURFACE.surface,
  name: "EmissionSurface",
  declared: null,
};
const GENERATOR_PART: DefaultField = {
  hash: SURFACE.generator,
  name: "ParticleSpawnDataGenerator",
  declared: null,
};

/** The child rows of `row` in the file. Empty when `row` is undefined. */
function useChildren(row: BinRow | undefined): readonly BinRow[] {
  const document = use(RowDocumentContext);
  const key = row === undefined ? "" : rowKey(row);
  const requests = useMemo(
    () => (row === undefined || document === null ? [] : [{ key, rows: childCount(row) }]),
    [row, document, key],
  );

  return useBinRead(document ?? 0, requests).get(key)?.rows ?? NO_ROWS;
}

/**
 * The editor of an emitter's `emissionSurfaceDefinition`.
 *
 * It draws a class picker for each of the two parts and the fields of each held class. A part
 * that is absent from the file shows Not set, and its first pick writes the definition and the
 * part in one edit. Any other row of the definition is drawn after the parts. A surface saved
 * before patch 15.22 has such rows. "The emission source" in docs/ux/BIN_EDITOR.md.
 */
export function SurfaceProperty({
  field,
  holder,
  authored,
  width,
  owner,
}: {
  field: DefaultField;
  /** The emitter's row. */
  holder: BinRow;
  /** The definition's row in the file. Undefined when the emitter has none. */
  authored?: BinRow;
  width: string;
  owner: string | null;
}) {
  const document = use(RowDocumentContext);
  const editProperty = use(LeafEditContext)?.editProperty;
  const held = authored?.value.type === "struct" ? authored : undefined;
  const children = useChildren(held);
  useHeldRows(children);

  const definition = authored ?? absentRow(holder, field, { type: "null" });
  const surface = children.find((child) => fieldHash(child.path) === SURFACE.surface);
  const generator = children.find((child) => fieldHash(child.path) === SURFACE.generator);
  const others = children.filter((child) => child !== surface && child !== generator);
  const pickOf = (part: string) =>
    editProperty === undefined
      ? null
      : (classHash: string | null) =>
          void editProperty(holder, field.hash, partEdits(part, classHash));

  return (
    <>
      <InputDefaultContext value={held === undefined}>
        <RowDocumentContext value={null}>
          <FieldRow
            row={definition}
            tableLayout
            width={width}
            owner={owner}
            valueSlot={<DefinitionValue held={held?.value.type === "struct" ? held.value : null} />}
          />
        </RowDocumentContext>
      </InputDefaultContext>
      <PartRow
        part={SURFACE_PART}
        classes={SURFACE_CLASSES}
        unsetDescription={m.workshop_bin_vfx_surface_unset_description()}
        definition={definition}
        child={surface}
        width={width}
        onPick={pickOf(SURFACE.surface)}
        action={
          held !== undefined &&
          surface !== undefined && <HostButton definition={held} surface={surface} />
        }
      />
      {document !== null && surface?.value.type === "struct" && (
        <StructFields
          document={document}
          row={surface}
          classHash={surface.value.classHash}
          width={width}
          depth={2}
          special={surfaceField}
        />
      )}
      <PartRow
        part={GENERATOR_PART}
        classes={GENERATOR_CLASSES}
        unsetDescription={m.workshop_bin_vfx_generator_unset_description()}
        definition={definition}
        child={generator}
        width={width}
        onPick={pickOf(SURFACE.generator)}
      />
      {document !== null && generator?.value.type === "struct" && (
        <StructFields
          document={document}
          row={generator}
          classHash={generator.value.classHash}
          width={width}
          depth={2}
        />
      )}
      {others.map((child) => (
        <FieldRow
          key={rowKey(child)}
          row={child}
          tableLayout
          width={width}
          depth={1}
          owner={DEFINITION_CLASS}
        />
      ))}
    </>
  );
}

/** The value cell of the definition's row: its class card, or Not set when it is absent. */
function DefinitionValue({ held }: { held: { classHash: string; class: string | null } | null }) {
  if (held === null) {
    return (
      <span className="font-sans text-meta text-surface-400 italic">
        {m.workshop_bin_inspector_default_unset_label()}
      </span>
    );
  }

  return <ClassCard classHash={held.classHash} name={held.class} />;
}

interface PartRowProps {
  part: DefaultField;
  classes: readonly SourceClass[];
  unsetDescription: string;
  /** The definition's row. It is a placeholder row when the file has no definition. */
  definition: BinRow;
  /** The part's row in the file. Undefined when the part is absent. */
  child: BinRow | undefined;
  width: string;
  onPick: ((classHash: string | null) => void) | null;
  action?: ReactNode;
}

/** The row of one part of the definition, with a picker over the classes it can hold. */
function PartRow({
  part,
  classes,
  unsetDescription,
  definition,
  child,
  width,
  onPick,
  action,
}: PartRowProps) {
  const labels = use(FieldLabelsContext);
  const row = child ?? absentRow(definition, part, { type: "null" });
  const held = child?.value.type === "struct" ? child.value : null;

  return (
    <InputDefaultContext value={child === undefined}>
      <RowDocumentContext value={null}>
        <FieldRow
          row={row}
          tableLayout
          width={width}
          depth={1}
          owner={DEFINITION_CLASS}
          valueSlot={
            <ClassSelect
              held={held}
              classes={classes}
              label={labels?.(part.hash, part.name) ?? part.name}
              unsetDescription={unsetDescription}
              onPick={onPick}
            />
          }
          valueAction={action}
        />
      </RowDocumentContext>
    </InputDefaultContext>
  );
}

/**
 * A button that writes the host skin's mesh and skeleton paths to a surface in one edit.
 *
 * It is shown when a host is chosen and the surface does not already name those files.
 */
function HostButton({ definition, surface }: { definition: BinRow; surface: BinRow }) {
  const editProperty = use(LeafEditContext)?.editProperty;
  const host = useHostSkin();
  const emitter = useEmitterModel();
  if (editProperty === undefined || host.model === undefined) return null;
  if (surface.value.type !== "struct") return null;

  const skinned = surface.value.classHash === MESH_SURFACE.hash;
  if (!skinned && surface.value.classHash !== SKELETON_SURFACE.hash) return null;

  const held = emitter?.emissionSurface ?? null;
  const wanted: (readonly [string, string, string | undefined])[] = [];
  if (skinned && host.model.mesh !== null) {
    wanted.push([SURFACE.mesh, host.model.mesh.path, held?.mesh?.path]);
  }
  if (host.model.skeleton !== null) {
    wanted.push([SURFACE.skeleton, host.model.skeleton.path, held?.skeleton?.path]);
  }

  const names = wanted.filter(([, path]) => !UNNAMED_CHUNK.test(path));
  const named = names.every(([, path, now]) => now?.toLowerCase() === path.toLowerCase());
  if (names.length === 0 || named) return null;

  return (
    <Tooltip content={m.workshop_bin_vfx_surface_use_host_hint({ name: host.name ?? "" })}>
      <Button
        variant="ghost"
        size="xs"
        onClick={(event) => {
          event.stopPropagation();
          void editProperty(
            definition,
            SURFACE.surface,
            nameEdits(names.map(([hash, path]) => [hash, path] as const)),
          );
        }}
      >
        {m.workshop_bin_vfx_surface_use_host_action()}
      </Button>
    </Tooltip>
  );
}

/** The surface fields that have their own control in place of the generic row. */
const surfaceField: SpecialField = (slot) => {
  if (slot.field.hash === SURFACE.submeshes) return <SubmeshList slot={slot} />;
  if (slot.field.hash === SURFACE.joints) return <JointList slot={slot} />;
  if (slot.field.hash === SURFACE.animation) {
    return slot.child === undefined ? null : <UnreadField slot={slot} child={slot.child} />;
  }

  return undefined;
};

/** The `Submeshes` row, with chips that offer the submesh names of the surface's mesh. */
function SubmeshList({ slot }: { slot: FieldSlot }) {
  const asset = useEmitterModel()?.emissionSurface?.mesh?.asset ?? null;
  const mesh = useQuery(viewportQueries.mesh(asset));
  const offered = useMemo(
    () => mesh.data?.ranges.map((range) => range.name) ?? NO_NAMES,
    [mesh.data],
  );

  return (
    <NameList
      slot={slot}
      offered={offered}
      addLabel={m.workshop_bin_vfx_surface_submesh_add_label()}
      emptyLabel={m.workshop_bin_vfx_surface_submeshes_empty()}
      unmatchedHint={m.workshop_bin_vfx_surface_submesh_unmatched_hint()}
    />
  );
}

/**
 * The `JointMask` row, with chips that offer the skeleton's joints that have a parent.
 *
 * A root joint is not offered, because a listed joint is the child end of its bone.
 */
function JointList({ slot }: { slot: FieldSlot }) {
  const asset = useEmitterModel()?.emissionSurface?.skeleton?.asset ?? null;
  const skeleton = useQuery(viewportQueries.skeleton(asset));
  const offered = useMemo(
    () =>
      skeleton.data?.joints.filter((joint) => joint.parent >= 0).map((joint) => joint.name) ??
      NO_NAMES,
    [skeleton.data],
  );

  return (
    <NameList
      slot={slot}
      offered={offered}
      addLabel={m.workshop_bin_vfx_surface_joint_add_label()}
      emptyLabel={m.workshop_bin_vfx_surface_joints_empty()}
      unmatchedHint={m.workshop_bin_vfx_surface_joint_unmatched_hint()}
    />
  );
}

interface NameListProps {
  slot: FieldSlot;
  offered: readonly string[];
  addLabel: string;
  emptyLabel: string;
  unmatchedHint: string;
}

/** The row of a hash list drawn as chips. Each add and each removal is one edit. */
function NameList({ slot, offered, addLabel, emptyLabel, unmatchedHint }: NameListProps) {
  const { field, child, holder, owner, width, depth } = slot;
  const editProperty = use(LeafEditContext)?.editProperty;
  const items = useChildren(child);
  const held = items.flatMap((item) =>
    item.value.type === "hash" ? [{ hash: item.value.hash, name: item.value.name }] : [],
  );
  const count = child === undefined ? 0 : childCount(child);
  const row =
    child ??
    absentRow(holder, defaultField(field), { type: "container", len: 0, itemKind: "hash" });

  return (
    <InputDefaultContext value={child === undefined}>
      <RowDocumentContext value={null}>
        <FieldRow
          row={row}
          tableLayout
          width={width}
          depth={depth}
          owner={owner}
          valueSlot={
            <NameChips
              addLabel={addLabel}
              held={held}
              offered={offered}
              emptyLabel={emptyLabel}
              unmatchedHint={unmatchedHint}
              onAdd={
                editProperty === undefined
                  ? null
                  : (name) => void editProperty(holder, field.hash, addNameEdits(count, name))
              }
              onRemove={
                editProperty === undefined || held.length !== count
                  ? null
                  : (index) => void editProperty(holder, field.hash, removeNameEdits(index))
              }
            />
          }
        />
      </RowDocumentContext>
    </InputDefaultContext>
  );
}

/** The row of a field that a complex emitter does not read, with a line that says so. */
function UnreadField({ slot, child }: { slot: FieldSlot; child: BinRow }) {
  return (
    <>
      <FieldRow row={child} tableLayout width={slot.width} depth={slot.depth} owner={slot.owner} />
      <div data-ui="SurfaceProperty:unread" className="flex px-1.5">
        <span aria-hidden className={twMerge("shrink-0", slot.width)} />
        <p className="border-l border-surface-700/40 pl-2 font-sans text-meta text-surface-400 select-none">
          {m.workshop_bin_vfx_surface_animation_hint()}
        </p>
      </div>
    </>
  );
}
