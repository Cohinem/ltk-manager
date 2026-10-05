import { CaretDownIcon, PlusIcon, TrashIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { use, useState } from "react";

import { Button, IconButton, Inline, InputDefaultContext, Menu } from "@/components";
import { m } from "@/i18n";
import type { BinRow } from "@/lib/tauri";
import type { Pose } from "@/modules/viewport";

import { FieldRow } from "../../classes/components/ClassCells";
import { binQueries } from "../../documents/hooks/useBinDocument";
import { nameHash } from "../../shared/utils/binHash";
import { absentRow, type FieldSlot } from "../../vfx/inspector/components/StructFields";
import { defaultField } from "../../vfx/inspector/utils/emitterGroups";
import { useDynamicsEdit } from "../hooks/useDynamicsEdit";
import { useItems } from "../hooks/useDynamicsRows";
import { SkinChoiceContext } from "../state/skinChoice";
import {
  addOrientationJointEdits,
  orientationSourceEdits,
  removeEdits,
  under,
} from "../utils/dynamicsEdits";
import { FIELD } from "../utils/dynamicsFields";
import { jointLabel, type WireOrientation } from "../utils/dynamicsModel";
import { ORIENTATION_SOURCES } from "../utils/poseModifiers";
import { Fields, Hint, usePhysicsScope, ValueSlot } from "./PhysicsCells";

export interface OrientationFieldsProps {
  /** The orientation's own row. */
  readonly row: BinRow;
  readonly orientation: WireOrientation;
}

/**
 * A joint orientation: the joints it turns, the source it turns them to, and its own fields.
 *
 * "The physics pane" in docs/ux/SKIN_EDITOR.md.
 */
export function OrientationFields({ row, orientation }: OrientationFieldsProps) {
  const special = (slot: FieldSlot) => {
    if (slot.field.hash === FIELD.orientationJoints) {
      return <Joints slot={slot} path={orientation.path} />;
    }
    if (slot.field.hash === FIELD.orientationSource) {
      return <Source slot={slot} path={orientation.path} />;
    }

    return undefined;
  };

  return (
    <>
      <Hint>{m.workshop_bin_physics_orientation_hint()}</Hint>
      <Fields row={row} special={special} />
    </>
  );
}

interface FieldProps {
  readonly slot: FieldSlot;
  /** The hash path of the orientation. */
  readonly path: string;
}

/** The joints turned, each by name over a remove, and the selected joint to add. */
function Joints({ slot, path }: FieldProps) {
  const { field, child, holder, owner, width, depth } = slot;
  const { document, pose } = usePhysicsScope();
  const send = useDynamicsEdit(holder.entry);
  const rows = useItems(document, child);
  const selected = use(SkinChoiceContext)?.joint ?? null;
  const row =
    child ??
    absentRow(holder, defaultField(field), { type: "container", len: 0, itemKind: "hash" });
  const held = new Set(rows.map((each) => (each.value.type === "hash" ? each.value.hash : "")));
  const offered = selected !== null && !held.has(nameHash(selected)) ? selected : null;

  return (
    <>
      <InputDefaultContext value={child === undefined}>
        <FieldRow
          row={row}
          tableLayout
          width={width}
          depth={depth}
          owner={owner}
          valueSlot={
            <ValueSlot sans>
              {send !== null && offered !== null && (
                <Button
                  size="sm"
                  variant="ghost"
                  left={<PlusIcon />}
                  onClick={() =>
                    send(
                      addOrientationJointEdits(
                        path,
                        offered,
                        rows.map((each) => each.path),
                      ),
                    )
                  }
                >
                  {m.workshop_bin_physics_orientation_add_joint_action({ joint: offered })}
                </Button>
              )}
              {offered === null && rows.length === 0 && (
                <span className="text-meta text-surface-400">
                  {m.workshop_bin_physics_orientation_joints_empty()}
                </span>
              )}
            </ValueSlot>
          }
        />
      </InputDefaultContext>
      {rows.map((each) => (
        <div key={each.path} data-ui="OrientationFields:joint" className="pl-6">
          <Inline gap={1.5} justify="between">
            <span className="min-w-0 truncate font-mono text-code text-surface-200 select-text">
              {jointOf(pose, each)}
            </span>
            {send !== null && (
              <IconButton
                size="row"
                icon={<TrashIcon />}
                label={m.workshop_bin_physics_remove_action()}
                onClick={() => send(removeEdits(each.path))}
              />
            )}
          </Inline>
        </div>
      ))}
    </>
  );
}

/** The joint a row of the list names, by the name the skeleton gives it. */
function jointOf(pose: Pose, row: BinRow): string {
  if (row.value.type !== "hash") return "-";

  const { hash, name } = row.value;
  return jointLabel(pose, { hash, name: name ?? hash }) ?? hash;
}

/**
 * The source: its class, picked from the classes the field takes, over the class's own
 * fields. The classes are asked for when the menu opens.
 */
function Source({ slot, path }: FieldProps) {
  const { field, child, holder, owner, width, depth } = slot;
  const { document } = usePhysicsScope();
  const send = useDynamicsEdit(holder.entry);
  const [asked, setAsked] = useState(false);
  const classes = useQuery({
    ...binQueries.itemClasses(document, holder.entry, under(path, field.hash)),
    enabled: asked,
  });
  const set = child?.value.type === "struct" ? child.value : null;
  const row = child ?? absentRow(holder, defaultField(field), { type: "null" });
  const offered =
    classes.data !== undefined && classes.data.length > 0
      ? classes.data.map((each) => ({ hash: each.hash, name: each.name ?? each.hash }))
      : ORIENTATION_SOURCES.map((name) => ({ hash: name, name }));

  return (
    <>
      <InputDefaultContext value={set === null}>
        <FieldRow
          row={row}
          tableLayout
          width={width}
          depth={depth}
          owner={owner}
          valueSlot={
            <ValueSlot sans>
              <Menu.Root onOpenChange={(open) => open && setAsked(true)}>
                <Menu.Trigger
                  disabled={send === null}
                  render={
                    <Button size="sm" variant="ghost" right={<CaretDownIcon />}>
                      {set?.class ??
                        set?.classHash ??
                        m.workshop_bin_physics_orientation_source_empty()}
                    </Button>
                  }
                />
                <Menu.Content
                  align="start"
                  data-ui="OrientationFields:source"
                  className="max-h-80 overflow-y-auto"
                >
                  {offered.map((each) => (
                    <Menu.Item
                      key={each.hash}
                      onClick={() => send?.(orientationSourceEdits(path, each.hash))}
                    >
                      {each.name}
                    </Menu.Item>
                  ))}
                  {set !== null && (
                    <>
                      <Menu.Separator />
                      <Menu.Item
                        variant="danger"
                        icon={<TrashIcon />}
                        onClick={() => send?.(orientationSourceEdits(path, null))}
                      >
                        {m.workshop_bin_physics_orientation_source_clear_action()}
                      </Menu.Item>
                    </>
                  )}
                </Menu.Content>
              </Menu.Root>
            </ValueSlot>
          }
        />
      </InputDefaultContext>
      {child !== undefined && set !== null && <Fields row={child} depth={depth + 1} />}
    </>
  );
}
