import { ArrowSquareInIcon, ArrowSquareOutIcon, type Icon } from "@phosphor-icons/react";
import { use } from "react";

import { Tooltip } from "@/components";
import { m } from "@/i18n";

import type { DriverItem } from "../utils/graphItems";
import { NodeBody } from "./DriverBody";
import { GraphActionsContext } from "./graphActions";

/**
 * A driver drawn inside the socket it feeds: its value, edited in place, and the button that
 * pops it out to a node of its own.
 */
export function EmbeddedDriver({ item }: { item: DriverItem }) {
  const actions = use(GraphActionsContext);

  return (
    <span className="flex min-w-0 flex-1 items-center gap-1">
      <span className="flex min-w-0 flex-1 flex-col">
        <NodeBody node={item.node} leaves={item.leaves} />
      </span>
      <EmbedButton
        icon={ArrowSquareOutIcon}
        label={m.workshop_bin_graph_pop_out_action()}
        onPress={() => actions?.toggleEmbedded(item.id)}
      />
    </span>
  );
}

/** The header button of a popped-out driver, which embeds it back in its socket. */
export function EmbedBackButton({ id }: { id: string }) {
  const actions = use(GraphActionsContext);

  return (
    <EmbedButton
      icon={ArrowSquareInIcon}
      label={m.workshop_bin_graph_embed_action()}
      onPress={() => actions?.toggleEmbedded(id)}
    />
  );
}

function EmbedButton({
  icon: Glyph,
  label,
  onPress,
}: {
  icon: Icon;
  label: string;
  onPress: () => void;
}) {
  return (
    <Tooltip content={label}>
      <button
        type="button"
        aria-label={label}
        /* DS-VEIL, DS-RADIUS */
        className="nodrag flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded-sm text-surface-400 opacity-0 group-hover/node:opacity-100 hover:bg-surface-veil hover:text-surface-100 focus-visible:opacity-100"
        onClick={onPress}
      >
        <Glyph weight="bold" className="h-3.5 w-3.5" />
      </button>
    </Tooltip>
  );
}
