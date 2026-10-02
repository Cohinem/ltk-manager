import type { UiFile, UiVariantRecord } from "@/lib/tauri";

import { labelOf } from "./layers";
import type { ViewTree } from "./tree";

/** One override slot of a view, as the variants pane lists it. */
export interface VariantSlot {
  /** The controller field that links it, which a read names the variant by. */
  readonly slot: string;
  readonly path: string;
  /** Whether the chunk is on a layer or in an archive. */
  readonly shipped: boolean;
  /** Whether the Windows client ever lays it, which it never does for a mobile or tablet slot. */
  readonly onPc: boolean;
}

/** The slots and file names the Windows client never registers, per research section 11. */
const NOT_ON_PC = /mobile|tablet/i;

/** Every override slot the view's controller links, in the controller's field order. */
export function variantSlots(files: readonly UiFile[]): VariantSlot[] {
  return files
    .filter((file) => file.role === "override")
    .map((file) => ({
      slot: file.slot,
      path: file.path,
      shipped: file.asset !== null,
      onPc: !NOT_ON_PC.test(file.slot) && !NOT_ON_PC.test(fileName(file.path)),
    }));
}

/** The object a variant's records patch, with those records in file order. */
export interface VariantTarget {
  readonly object: string;
  /** The element's or scene's name, and the hash where the view holds neither. */
  readonly label: string;
  /** Whether the object is an element the canvas can select. */
  readonly element: boolean;
  readonly records: readonly UiVariantRecord[];
}

/** The records of the variant `tree` draws, under the object each patches, first record first. */
export function variantTargets(tree: ViewTree): VariantTarget[] {
  const records = tree.view.variant?.records ?? [];
  const grouped = new Map<string, UiVariantRecord[]>();
  for (const record of records) {
    const held = grouped.get(record.object);
    if (held === undefined) grouped.set(record.object, [record]);
    else held.push(record);
  }

  return [...grouped].map(([object, patched]) => {
    const element = tree.elements.get(object);
    const named = element ?? tree.scenes.get(object);
    return {
      object,
      label: named === undefined ? object : labelOf(named.label, named.path, object),
      element: element !== undefined,
      records: patched,
    };
  });
}

/** The elements whose own records the drawn variant applied. */
export function variantPatched(tree: ViewTree): ReadonlySet<string> {
  const records = tree.view.variant?.records ?? [];
  return new Set(
    records
      .filter((record) => record.skipped === null && tree.elements.has(record.object))
      .map((record) => record.object),
  );
}

function fileName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}
