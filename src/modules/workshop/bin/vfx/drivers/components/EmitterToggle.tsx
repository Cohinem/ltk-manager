import { EyeIcon, EyeSlashIcon } from "@phosphor-icons/react";
import { use } from "react";

import { Tooltip } from "@/components";
import { m } from "@/i18n";

import { nameHash } from "../../../shared/utils/binHash";
import { LeafEditContext } from "../../../tree/hooks/useLeafEdit";
import { holderRow } from "../utils/holderRow";
import { GraphActionsContext } from "./graphActions";

const DISABLED = nameHash("disabled");

/**
 * An emitter's `disabled` flag as a button on its node's header, written as the inspector's
 * own edit, so it is one undo step. A view that edits nothing draws none.
 */
export function EmitterToggle({ wire, disabled }: { wire: string; disabled: boolean }) {
  const actions = use(GraphActionsContext);
  const editProperty = use(LeafEditContext)?.editProperty;
  if (actions === null || actions.entry === "" || editProperty === undefined) return null;

  const label = disabled
    ? m.workshop_bin_graph_enable_action()
    : m.workshop_bin_graph_disable_action();
  const toggle = () =>
    void editProperty(holderRow(actions.entry, wire), DISABLED, [
      { type: "setLeaf", path: "", value: { type: "bool", value: !disabled } },
    ]);

  return (
    <Tooltip content={label}>
      <button
        type="button"
        aria-label={label}
        aria-pressed={!disabled}
        /* DS-VEIL, DS-RADIUS */
        className="nodrag flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-sm text-surface-300 hover:bg-surface-veil hover:text-surface-100"
        onClick={toggle}
      >
        {disabled && <EyeSlashIcon weight="bold" className="h-3.5 w-3.5" />}
        {!disabled && <EyeIcon weight="bold" className="h-3.5 w-3.5" />}
      </button>
    </Tooltip>
  );
}
