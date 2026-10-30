import type { BankEdit, ContainerKind, NodeProperty, ObjectProperties } from "@/lib/tauri";

/** What a picked row stands for: an object of the bank and the object that holds it. */
export interface NodeTarget {
  readonly object: number;
  /**
   * The container that lists the object, the Play action that plays it, or the event that runs
   * the action. Null for an event.
   */
  readonly parent: number | null;
  /** What `parent` is, which a wrap reads, or null for an event. */
  readonly parentKind: "event" | "action" | "container" | null;
  readonly kind: "event" | "action" | "sound" | "container";
  /** The objects above it, from the event down, which a target under another target skips. */
  readonly ancestors: readonly number[];
}

/** The properties that each kind of target takes, as `NodeProperty::SOUND` and the rest list them. */
const TAKES: Record<NodeTarget["kind"], ReadonlySet<NodeProperty>> = {
  sound: new Set(["volume", "makeUpGain", "pitch", "lpf", "hpf", "delay", "loopCount"]),
  container: new Set(["volume", "makeUpGain", "pitch", "lpf", "hpf", "delay"]),
  action: new Set(["delay"]),
  event: new Set(),
};

/** The properties that a knob edit of several targets changes by the same amount. */
const RELATIVE: ReadonlySet<NodeProperty> = new Set(["volume", "makeUpGain", "pitch"]);

/** Returns `targets` without the ones that another target holds, and each object once. */
export function outermost(targets: readonly NodeTarget[]): NodeTarget[] {
  const picked = new Set(targets.map((target) => target.object));
  const seen = new Set<string>();
  return targets.filter((target) => {
    if (target.ancestors.some((ancestor) => picked.has(ancestor))) return false;

    const key = `${target.object}:${target.parent ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Returns the one edit that deletes every one of `targets`, or null if none takes a delete. */
export function deleteEdit(targets: readonly NodeTarget[]): BankEdit | null {
  const edits: BankEdit[] = outermost(targets).map((target) => ({
    kind: "delete",
    object: target.object,
    parent: target.parent,
  }));
  return batched(edits);
}

/**
 * Returns the one edit that duplicates every one of `targets` beside itself, or null if none
 * takes a duplicate. An event takes a name, so it is copied through its own entry.
 */
export function duplicateEdit(targets: readonly NodeTarget[]): BankEdit | null {
  const edits: BankEdit[] = outermost(targets).flatMap((target): BankEdit[] =>
    target.kind === "event" || target.parent === null
      ? []
      : [{ kind: "duplicate", object: target.object, parent: target.parent }],
  );
  return batched(edits);
}

/**
 * Returns the one edit that wraps `targets` in new containers of `container`: one container for
 * the targets of each parent, in the place of the first of them.
 *
 * A node that a Play action plays is wrapped alone. Events and actions take no wrap.
 */
export function wrapEdit(
  targets: readonly NodeTarget[],
  container: ContainerKind,
): BankEdit | null {
  const groups = new Map<number, number[]>();
  const edits: BankEdit[] = [];
  for (const target of outermost(targets)) {
    if (target.kind === "event" || target.kind === "action" || target.parent === null) continue;

    const kind = target.parentKind;
    if (kind === "action") {
      edits.push({ kind: "wrap", objects: [target.object], parent: target.parent, container });
      continue;
    }
    if (kind === "container") {
      groups.set(target.parent, [...(groups.get(target.parent) ?? []), target.object]);
    }
  }

  for (const [parent, objects] of groups) {
    edits.push({ kind: "wrap", objects, parent, container });
  }
  return batched(edits);
}

/**
 * Returns the one edit that moves each cut sound and container of `cut` into `container`, which
 * holds `above` over it, or null if no cut node takes the move.
 *
 * Events and actions take no move, and a node below another cut node moves with it. The
 * container itself and a node above it are left out, because the move would hold a container
 * inside itself.
 */
export function pasteEdit(
  cut: readonly NodeTarget[],
  container: number,
  above: readonly number[] = [],
): BankEdit | null {
  const edits: BankEdit[] = outermost(cut).flatMap((target): BankEdit[] => {
    const node = target.kind === "sound" || target.kind === "container";
    if (!node || target.object === container || above.includes(target.object)) return [];

    return [{ kind: "addChild", container, child: target.object }];
  });
  return batched(edits);
}

/** Returns `true` if every one of `targets` takes `property`. */
export function takesProperty(targets: readonly NodeTarget[], property: NodeProperty): boolean {
  return targets.length > 0 && targets.every((target) => TAKES[target.kind].has(property));
}

/**
 * Returns the one edit that sets `property` of every one of `targets` after the edited object
 * `object` went from `before` to `after`.
 *
 * Volume, make-up gain and pitch move by the change of `object`, and every other property takes
 * the value `after`. A target that does not take the property is left out. A value read from
 * `properties` is the property's current value, and a target without one starts at `before`.
 */
export function propertyEdit(
  targets: readonly NodeTarget[],
  property: NodeProperty,
  object: number,
  before: number,
  after: number,
  properties: ReadonlyMap<number, ObjectProperties>,
): BankEdit | null {
  const change = after - before;
  const seen = new Set<number>();
  const edits: BankEdit[] = [];
  for (const target of targets) {
    if (!TAKES[target.kind].has(property) || seen.has(target.object)) continue;
    seen.add(target.object);

    const current =
      properties.get(target.object)?.values.find((each) => each.property === property)?.value ??
      before;
    const value =
      target.object === object ? after : RELATIVE.has(property) ? current + change : after;
    edits.push({ kind: "property", object: target.object, property, value });
  }
  return batched(edits);
}

/** Returns the one edit of `edits`: the edit itself, a batch of several, or null for none. */
function batched(edits: BankEdit[]): BankEdit | null {
  if (edits.length === 0) return null;
  if (edits.length === 1) return edits[0] ?? null;

  return { kind: "batch", edits };
}
