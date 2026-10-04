import { CircleDashedIcon, PillIcon, TrashIcon } from "@phosphor-icons/react";
import { type ReactNode, useState } from "react";

import { Count, IconButton, Inline, Readout, Stack } from "@/components";
import { m } from "@/i18n";
import type { ColliderFile } from "@/modules/viewport";
import { twMerge } from "@/utils";

import { NAME_COLUMN } from "../../classes/components/ClassCells";
import {
  offsetFrom,
  pointAt,
  withCapsuleAt,
  withoutCapsule,
  withoutSphere,
  withSphereAt,
} from "../utils/colliders";
import type { WireChain } from "../utils/dynamicsModel";
import { Hint, usePhysicsScope } from "./PhysicsCells";

const AXES = ["X", "Y", "Z"] as const;

/**
 * A number of a shape as a field shows it. The file holds single floats, so a point on its
 * joint reads a few millionths off it, and a negative one of those would read as `-0`.
 */
function shown(value: number): number {
  return Math.round(value * 1000) / 1000 || 0;
}

export interface ColliderListProps {
  readonly chain: WireChain;
  /** The shapes of the chain's collider file, and none for a chain with no file. */
  readonly file: ColliderFile;
}

/**
 * The shapes a chain's joints collide with: spheres and capsules that ride the joints
 * they name.
 *
 * "The colliders" in docs/plans/pose-dynamics-preview.md. The shapes are the chain's
 * collider file and not rows of the document, so a line here is laid out as a field row
 * and saves the file.
 */
export function ColliderList({ chain, file }: ColliderListProps) {
  const { pose, colliders } = usePhysicsScope();
  const count = file.spheres.length + file.capsules.length;
  const save = colliders && ((next: ColliderFile) => colliders.commit(chain, next));

  return (
    <div
      data-ui="ColliderList"
      className="flex flex-col gap-1 border-t border-surface-700/40 pt-1.5"
    >
      <Inline gap={1.5}>
        <span className="text-meta font-medium text-surface-200 select-none">
          {m.workshop_bin_physics_colliders_title()}
        </span>
        {count > 0 && <Count>{count}</Count>}
      </Inline>
      {count === 0 && <Hint>{m.workshop_bin_physics_colliders_empty()}</Hint>}
      {file.spheres.map((sphere, at) => {
        const offset = offsetFrom(pose, sphere.joint, sphere.centre);

        return (
          <Shape
            /* A shape has no identity but its place in the file. */
            key={`sphere:${at}`}
            icon={<CircleDashedIcon aria-hidden className="size-3.5 shrink-0 text-surface-400" />}
            title={m.workshop_bin_physics_collider_sphere_label()}
            detail={sphere.joint}
            onRemove={save && (() => save(withoutSphere(file, at)))}
          >
            <Line label={m.workshop_bin_physics_collider_radius_label()}>
              <ShapeNumber
                label={m.workshop_bin_physics_collider_radius_label()}
                value={sphere.radius}
                min={0}
                onCommit={save && ((radius) => save(withSphereAt(file, at, { radius })))}
              />
            </Line>
            <Line label={m.workshop_bin_physics_collider_offset_label()}>
              {AXES.map((axis, component) => (
                <ShapeNumber
                  key={axis}
                  label={axis}
                  channel={component}
                  value={offset[component]}
                  onCommit={
                    save &&
                    ((value) => {
                      const moved = offset.map((each, i) => (i === component ? value : each));
                      const centre = pointAt(pose, sphere.joint, [moved[0], moved[1], moved[2]]);
                      save(withSphereAt(file, at, { centre }));
                    })
                  }
                />
              ))}
            </Line>
          </Shape>
        );
      })}
      {file.capsules.map((capsule, at) => {
        const radiusA = m.workshop_bin_physics_collider_end_radius_label({
          joint: capsule.jointA,
        });
        const radiusB = m.workshop_bin_physics_collider_end_radius_label({
          joint: capsule.jointB,
        });

        return (
          <Shape
            key={`capsule:${at}`}
            icon={<PillIcon aria-hidden className="size-3.5 shrink-0 text-surface-400" />}
            title={m.workshop_bin_physics_collider_capsule_label()}
            detail={`${capsule.jointA} - ${capsule.jointB}`}
            onRemove={save && (() => save(withoutCapsule(file, at)))}
          >
            <Line label={radiusA}>
              <ShapeNumber
                label={radiusA}
                value={capsule.radiusA}
                min={0}
                onCommit={save && ((value) => save(withCapsuleAt(file, at, { radiusA: value })))}
              />
            </Line>
            <Line label={radiusB}>
              <ShapeNumber
                label={radiusB}
                value={capsule.radiusB}
                min={0}
                onCommit={save && ((value) => save(withCapsuleAt(file, at, { radiusB: value })))}
              />
            </Line>
          </Shape>
        );
      })}
    </div>
  );
}

interface ShapeProps {
  readonly icon: ReactNode;
  readonly title: string;
  /** The joints the shape rides. */
  readonly detail: string;
  readonly onRemove: (() => void) | null;
  readonly children: ReactNode;
}

function Shape({ icon, title, detail, onRemove, children }: ShapeProps) {
  return (
    <Stack gap={0.5} data-ui="ColliderList:shape">
      <Inline gap={1.5} justify="between">
        <Inline as="span" gap={1.5} fill>
          {icon}
          <span className="shrink-0 text-meta text-surface-400 select-none">{title}</span>
          <span className="min-w-0 truncate font-mono text-code text-surface-200 select-text">
            {detail}
          </span>
        </Inline>
        {onRemove !== null && (
          <IconButton
            size="row"
            icon={<TrashIcon />}
            label={m.workshop_bin_physics_remove_action()}
            onClick={onRemove}
          />
        )}
      </Inline>
      {children}
    </Stack>
  );
}

/** One line of a shape, in the name column and the value column a field row is laid out in. */
function Line({ label, children }: { label: string; children: ReactNode }) {
  return (
    /* DS-VEIL */
    <div className="flex min-h-6 items-center px-1.5 font-mono text-mono-row hover:bg-surface-veil-soft">
      <span className={twMerge("flex min-w-0 shrink-0 items-center pl-4", NAME_COLUMN)}>
        <span className="truncate font-sans font-medium text-surface-200 select-none">{label}</span>
      </span>
      <div className="flex min-h-6 min-w-0 flex-1 items-center gap-1.5 border-l border-surface-700/40 pl-2">
        {children}
      </div>
    </div>
  );
}

interface ShapeNumberProps {
  readonly label: string;
  readonly value: number;
  /** The axis the number is, for one component of an offset. */
  readonly channel?: number;
  readonly min?: number;
  /** Save the number, and null where the view is read-only. */
  readonly onCommit: ((value: number) => void) | null;
}

/** One number of a shape, in the box a field row's number is edited in. */
function ShapeNumber({ label, value, channel, min, onCommit }: ShapeNumberProps) {
  /* The value a refused text was typed over, so the mark leaves when the value changes. */
  const [refusedOver, setRefusedOver] = useState<number | null>(null);
  const commit = (text: string) => {
    const typed = Number(text);
    const taken =
      text.trim() !== "" && Number.isFinite(typed) && (min === undefined || typed >= min);

    setRefusedOver(taken ? null : value);
    if (taken) onCommit?.(typed);
  };

  return (
    <Readout
      value={String(shown(value))}
      label={channel === undefined ? undefined : label}
      channel={channel}
      aria-label={label}
      className={
        channel === undefined
          ? "w-[var(--bin-scalar-width,8rem)]"
          : "w-[var(--bin-component-width,6rem)]"
      }
      step={0.5}
      invalid={refusedOver === value}
      onCommit={onCommit === null ? undefined : commit}
    />
  );
}
