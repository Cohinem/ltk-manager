import { PlusIcon } from "@phosphor-icons/react";

import { m } from "@/i18n";

import type { StructItem } from "../utils/graphItems";
import { Line } from "./FieldLines";
import { useNodeStructure } from "./nodeStructure";

/** The button under a list node's items that appends one, per `listAppend`. */
export function AddItemLine({ item }: { item: StructItem }) {
  const append = useNodeStructure().append(item);

  return (
    <Line>
      <button
        type="button"
        disabled={append === null}
        onClick={append ?? undefined}
        /* DS-HOVER, DS-RADIUS */
        className="ml-1 flex h-6 min-w-0 items-center gap-1.5 rounded-sm px-1 text-surface-400 hover:bg-surface-veil hover:text-surface-200 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <PlusIcon weight="bold" className="h-3 w-3 shrink-0" />
        {m.workshop_bin_add_item_action()}
      </button>
    </Line>
  );
}
