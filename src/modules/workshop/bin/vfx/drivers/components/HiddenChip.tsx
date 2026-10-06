import { Tooltip } from "@/components";
import { m } from "@/i18n";

const CHIP = "shrink-0 rounded-sm bg-surface-veil px-1 text-meta text-surface-300";

/**
 * The number of inputs a folded node hides, beside its title.
 *
 * A `narrow` header, a folded emitter's, draws the count alone and names it in a hint, since
 * the full label would leave the title no room.
 */
export function HiddenChip({ count, narrow }: { count: number; narrow: boolean }) {
  const label = m.workshop_bin_graph_hidden_label({ count });
  if (!narrow) return <span className={CHIP}>{label}</span>;

  return (
    <Tooltip content={label}>
      <span className={CHIP}>{m.workshop_bin_graph_hidden_count_label({ count })}</span>
    </Tooltip>
  );
}
