import Mark from "@/assets/icons/MinionIcon.svg?react";

interface MinionIconProps {
  className?: string;
}

/**
 * A melee minion in its own three-tone teal, drawn as a candidate app mark.
 *
 * A mark keeps its palette instead of inheriting `currentColor`: DS-INVARIANT.
 */
export function MinionIcon({ className }: MinionIconProps) {
  return <Mark className={className} />;
}
