import Mark from "@/assets/icons/ScuttleIcon.svg?react";

interface ScuttleIconProps {
  className?: string;
}

/**
 * A scuttle crab in its own three-tone green, drawn as a candidate app mark.
 *
 * A mark keeps its palette instead of inheriting `currentColor`: DS-INVARIANT.
 */
export function ScuttleIcon({ className }: ScuttleIconProps) {
  return <Mark className={className} />;
}
