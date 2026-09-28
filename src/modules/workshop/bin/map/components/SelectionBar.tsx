import { CrosshairIcon, EyeIcon, EyeSlashIcon, XIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";

import { IconButton, Tooltip } from "@/components";
import { m } from "@/i18n";
import type { MapChunk } from "@/lib/tauri";

import { useMapScene } from "../state/mapScene";
import { itemId } from "../utils/mapOutline";

/**
 * What the outliner offers for the placeables the reader selected here or in the viewport:
 * their count, and a button to frame, hide, show or let go of them all.
 */
export function SelectionBar({ chunks }: { chunks: readonly MapChunk[] }) {
  const { selected, select, setHidden, focusOn } = useMapScene();
  if (selected.size === 0) return null;

  const ids = [...selected];
  const frame = () => {
    const middle = centroid(chunks, selected);
    if (middle !== null) focusOn({ id: `selection:${ids.join(",")}`, position: middle });
  };

  return (
    <div
      data-ui="SelectionBar"
      className="mx-1.5 mb-1 flex shrink-0 items-center gap-0.5 rounded-md bg-accent-500/10 py-0.5 pr-0.5 pl-2"
    >
      <span className="min-w-0 flex-1 truncate text-meta text-accent-300">
        {m.workshop_bin_map_selection_count_label({ count: selected.size })}
      </span>
      <BarButton label={m.workshop_bin_map_selection_frame_action()} onClick={frame}>
        <CrosshairIcon weight="bold" className="h-3.5 w-3.5" />
      </BarButton>
      <BarButton
        label={m.workshop_bin_map_selection_hide_action()}
        onClick={() => setHidden(ids, true)}
      >
        <EyeSlashIcon weight="bold" className="h-3.5 w-3.5" />
      </BarButton>
      <BarButton
        label={m.workshop_bin_map_selection_show_action()}
        onClick={() => setHidden(ids, false)}
      >
        <EyeIcon weight="bold" className="h-3.5 w-3.5" />
      </BarButton>
      <BarButton
        label={m.workshop_bin_map_selection_clear_action()}
        onClick={() => select([], "replace")}
      >
        <XIcon weight="bold" className="h-3.5 w-3.5" />
      </BarButton>
    </div>
  );
}

function BarButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip content={label}>
      <IconButton
        variant="ghost"
        size="xs"
        compact
        aria-label={label}
        icon={children}
        onClick={onClick}
      />
    </Tooltip>
  );
}

/** The middle of the selected placeables' places in the map's space, and null for none found. */
function centroid(
  chunks: readonly MapChunk[],
  selected: ReadonlySet<string>,
): [number, number, number] | null {
  const sum = [0, 0, 0];
  let count = 0;
  for (const chunk of chunks) {
    for (const item of chunk.items) {
      if (!selected.has(itemId(chunk.entry, item.key))) continue;

      item.position.forEach((value, axis) => {
        sum[axis] = (sum[axis] ?? 0) + (value ?? 0);
      });
      count += 1;
    }
  }
  if (count === 0) return null;
  return [(sum[0] ?? 0) / count, (sum[1] ?? 0) / count, (sum[2] ?? 0) / count];
}
