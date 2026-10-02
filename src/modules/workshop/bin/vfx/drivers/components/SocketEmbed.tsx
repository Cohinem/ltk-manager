import { ArrowSquareInIcon, ArrowSquareOutIcon, type Icon } from "@phosphor-icons/react";
import { use } from "react";

import { IconButton } from "@/components";
import { m } from "@/i18n";
import { twMerge } from "@/utils";

import type { DriverItem } from "../utils/graphItems";
import { NodeBody } from "./DriverBody";
import { GraphActionsContext } from "./graphActions";
import { EMBED_TONE, hueStyle } from "./NodeFrame";

/**
 * A driver drawn inside the socket it feeds: its value, edited in place, and the button that
 * pops it out to a node of its own.
 */
export function EmbeddedDriver({ item }: { item: DriverItem }) {
  return (
    <span
      className={twMerge("flex min-w-0 flex-1 items-center gap-1 pl-1", EMBED_TONE)}
      style={hueStyle(item)}
    >
      <span className="flex min-w-0 flex-1 flex-col">
        <NodeBody node={item.node} leaves={item.leaves} />
      </span>
      <PopOutButton id={item.id} />
    </span>
  );
}

/** The button beside an embedded item, which pops it out to a node of its own. */
export function PopOutButton({ id }: { id: string }) {
  const actions = use(GraphActionsContext);

  return (
    <EmbedButton
      icon={ArrowSquareOutIcon}
      label={m.workshop_bin_graph_pop_out_action()}
      onPress={() => actions?.toggleEmbedded(id)}
    />
  );
}

/** The header button of a popped-out item, which embeds it back in its socket. */
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
    <IconButton
      size="row"
      label={label}
      icon={<Glyph />}
      className="nodrag shrink-0 text-surface-500 hover:text-surface-100"
      onClick={onPress}
    />
  );
}
