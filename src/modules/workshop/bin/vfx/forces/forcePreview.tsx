import { createContext, use, useCallback, useMemo, useState, type ReactNode } from "react";

import type { FieldsModel, SystemModel } from "../engine/model/model";
import { FORCE_DEFINITIONS, type AuthoredForce, type ForceKind } from "./forceModel";

interface ForcePreview {
  readonly selected: string | null;
  readonly handle: string | null;
  readonly muted: ReadonlySet<string>;
  readonly solo: string | null;
  readonly select: (key: string | null, handle?: string) => void;
  readonly mute: (key: string) => void;
  readonly isolate: (key: string) => void;
  readonly clear: () => void;
  readonly project: (system: SystemModel) => SystemModel;
}

const EMPTY: ReadonlySet<string> = new Set();
const ForcePreviewContext = createContext<ForcePreview>({
  selected: null,
  handle: null,
  muted: EMPTY,
  solo: null,
  select: () => {},
  mute: () => {},
  isolate: () => {},
  clear: () => {},
  project: (system) => system,
});

/** Selection and mute/solo are local to one preview and never enter a declaration. */
export function useForcePreview() {
  return use(ForcePreviewContext);
}

export function useForcePreviewState() {
  const [selected, setSelected] = useState<string | null>(null);
  const [handle, setHandle] = useState<string | null>(null);
  const select = useCallback((key: string | null, property?: string) => {
    setSelected(key);
    setHandle(property ?? null);
  }, []);
  const [muted, setMuted] = useState<ReadonlySet<string>>(EMPTY);
  const [solo, setSolo] = useState<string | null>(null);
  const clear = useCallback(() => {
    select(null);
    setMuted(EMPTY);
    setSolo(null);
  }, [select]);
  const project = useCallback(
    (system: SystemModel) => projectForces(system, muted, solo),
    [muted, solo],
  );

  return useMemo<ForcePreview>(
    () => ({
      selected,
      handle,
      muted,
      solo,
      select,
      clear,
      project,
      mute: (key) =>
        setMuted((held) => {
          const next = new Set(held);
          if (next.has(key)) {
            next.delete(key);
          } else {
            next.add(key);
          }
          return next;
        }),
      isolate: (key) => setSolo((held) => (held === key ? null : key)),
    }),
    [selected, handle, muted, solo, select, clear, project],
  );
}

export function ForcePreviewProvider({
  value,
  children,
}: {
  value: ForcePreview;
  children: ReactNode;
}) {
  return <ForcePreviewContext value={value}>{children}</ForcePreviewContext>;
}

/** Zeroed contributions preserve the field lists and noise clock indices. */
export function projectForces(
  system: SystemModel,
  muted: ReadonlySet<string>,
  solo: string | null,
): SystemModel {
  if (muted.size === 0 && solo === null) {
    return system;
  }

  return {
    ...system,
    emitters: system.emitters.map((emitter) => {
      if (emitter.fields === null) {
        return emitter;
      }
      const active = (kind: ForceKind, index: number) => {
        const key = `${emitter.index}:${kind}:${index}`;
        return !muted.has(key) && (solo === null || solo === key);
      };
      const zero = { constant: [0], keys: [], tables: [] };
      const zero3 = { constant: [0, 0, 0], keys: [], tables: [] };
      const fields: FieldsModel = {
        acceleration: emitter.fields.acceleration.map((value, index) =>
          active("acceleration", index) ? value : { ...value, acceleration: zero3 },
        ),
        attraction: emitter.fields.attraction.map((value, index) =>
          active("attraction", index) ? value : { ...value, acceleration: zero },
        ),
        noise: emitter.fields.noise.map((value, index) =>
          active("noise", index) ? value : { ...value, velocityDelta: zero },
        ),
        drag: emitter.fields.drag.map((value, index) =>
          active("drag", index) ? value : { ...value, strength: zero },
        ),
        orbital: emitter.fields.orbital.map((value, index) =>
          active("orbital", index) ? value : { ...value, direction: zero3 },
        ),
      };
      return { ...emitter, fields };
    }),
  };
}

/** A topology change invalidates index-based preview selections. */
export function forceTopology(system: SystemModel | null): string {
  return (
    `${system?.entry ?? ""}:` +
    (system?.emitters
      .map(
        (emitter) =>
          `${emitter.simple}:${emitter.listIndex}:${FORCE_DEFINITIONS.map(({ kind }) => emitter.fields?.[kind].length ?? 0).join(",")}`,
      )
      .join(";") ?? "")
  );
}

/** A single constant changed for a drag preview, leaving curves and sibling forces intact. */
export function previewForceValue(
  system: SystemModel,
  force: AuthoredForce,
  name: string,
  value: readonly number[],
): SystemModel {
  const key = name === "Position" ? "position" : name;

  return {
    ...system,
    emitters: system.emitters.map((emitter) => {
      if (emitter.index !== force.emitter || emitter.fields === null) {
        return emitter;
      }
      const list = emitter.fields[force.definition.kind];
      const next = list.map((item, index) => {
        if (index !== force.index || !(key in item)) {
          return item;
        }
        const curve = (item as unknown as Record<string, unknown>)[key];
        if (typeof curve !== "object" || curve === null || !("constant" in curve)) {
          return item;
        }
        return { ...item, [key]: { ...curve, constant: [...value] } };
      });
      return { ...emitter, fields: { ...emitter.fields, [force.definition.kind]: next } };
    }),
  };
}
