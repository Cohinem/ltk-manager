import type { VfxObject } from "@/lib/tauri";

import type { SystemStart } from "../templates/SystemTemplatePicker";

/** The sections of the Add child picker, in the order it lists them. */
export type AddGroupId = "link" | "new";

/** One entry of the Add child picker: a system to link, or a start of a new one. */
export type AddItem =
  | {
      readonly kind: "link";
      readonly id: string;
      /** The system's entry, `0x` and eight hex digits. */
      readonly entry: string;
      /** The system's path, or its entry where no table names it. */
      readonly path: string;
    }
  | {
      readonly kind: "new";
      readonly id: string;
      readonly start: SystemStart;
      readonly label: string;
    };

/** One section of the picker. */
export interface AddGroup {
  readonly value: AddGroupId;
  readonly items: readonly AddItem[];
}

/** A start of a new system as the picker names it. */
export interface NamedStart {
  readonly start: SystemStart;
  readonly label: string;
}

const GROUP_ORDER: readonly AddGroupId[] = ["link", "new"];

/**
 * Every entry the picker offers an emitter of the system `holder`: each system a child can
 * link, and each start of a new system.
 *
 * `holder` is left out, because a system that links itself is a cycle.
 */
export function addItems(
  systems: readonly VfxObject[] | null | undefined,
  starts: readonly NamedStart[],
  holder: string,
): AddItem[] {
  const links = (systems ?? [])
    .filter((system) => system.entry !== holder)
    .map((system): AddItem => ({
      kind: "link",
      id: `link:${system.entry}`,
      entry: system.entry,
      path: system.name ?? system.entry,
    }));
  const fresh = starts.map((each, index): AddItem => ({
    kind: "new",
    id: `new:${index}`,
    ...each,
  }));

  return [...links, ...fresh];
}

/**
 * `items` as the picker's sections, narrowed to the entries that contain every word of
 * `query`. A section with no entry is left out.
 */
export function addGroups(items: readonly AddItem[], query: string): AddGroup[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const matched = items.filter((item) => {
    const text = (item.kind === "link" ? item.path : item.label).toLowerCase();
    return words.every((word) => text.includes(word));
  });

  return GROUP_ORDER.flatMap((value) => {
    const own = matched.filter((item) => item.kind === value);
    return own.length === 0 ? [] : [{ value, items: own }];
  });
}
