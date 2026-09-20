import type { ReactNode } from "react";

import { IconButton, Tooltip } from "@/components";

export interface ViewToggleProps {
  readonly label: string;
  readonly active: boolean;
  readonly icon: ReactNode;
  readonly onClick: () => void;
}

/** One of a preview's switches: an icon that reads as on through its accent fill, named on hover. */
export function ViewToggle({ label, active, icon, onClick }: ViewToggleProps) {
  return (
    <Tooltip content={label}>
      <IconButton
        variant="ghost"
        size="xs"
        compact
        aria-label={label}
        aria-pressed={active}
        /* DS-VEIL, DS-RADIUS */
        className={active ? "bg-accent-500/15 text-accent-300 hover:bg-accent-500/25" : undefined}
        icon={icon}
        onClick={onClick}
      />
    </Tooltip>
  );
}
