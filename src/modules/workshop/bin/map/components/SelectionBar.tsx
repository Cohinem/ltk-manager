import { CrosshairIcon, EyeIcon, EyeSlashIcon, XIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";

import { IconButton } from "@/components";
import { m } from "@/i18n";

import { useMapScene } from "../state/mapScene";

/**
 * What the outliner offers for the meshes and placeables selected here or in the viewport:
 * their count, and a button to frame, hide, show or let go of them all.
 */
export function SelectionBar({ onFrame }: { onFrame: (() => void) | null }) {
  const { selected, select, setHidden } = useMapScene();
  if (selected.size === 0) return null;

  const ids = [...selected];

  return (
    <div
      data-ui="SelectionBar"
      className="mx-1.5 mb-1 flex shrink-0 items-center gap-0.5 rounded-md bg-accent-500/10 py-0.5 pr-0.5 pl-2"
    >
      <span className="min-w-0 flex-1 truncate text-meta text-accent-300">
        {m.workshop_bin_map_selection_count_label({ count: selected.size })}
      </span>
      <BarButton label={m.workshop_bin_map_selection_frame_action()} onClick={() => onFrame?.()}>
        <CrosshairIcon weight="bold" className="size-3.5" />
      </BarButton>
      <BarButton
        label={m.workshop_bin_map_selection_hide_action()}
        onClick={() => setHidden(ids, true)}
      >
        <EyeSlashIcon weight="bold" className="size-3.5" />
      </BarButton>
      <BarButton
        label={m.workshop_bin_map_selection_show_action()}
        onClick={() => setHidden(ids, false)}
      >
        <EyeIcon weight="bold" className="size-3.5" />
      </BarButton>
      <BarButton
        label={m.workshop_bin_map_selection_clear_action()}
        onClick={() => select([], "replace")}
      >
        <XIcon weight="bold" className="size-3.5" />
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
  return <IconButton icon={children} onClick={onClick} label={label} />;
}
