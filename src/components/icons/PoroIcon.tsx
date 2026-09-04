import Mark from "@/assets/icons/PoroIcon.svg?react";

interface PoroIconProps {
  className?: string;
}

/**
 * A poro in its own three-tone pink, drawn as a candidate app mark.
 *
 * A mark keeps its palette instead of inheriting `currentColor`: DS-INVARIANT.
 */
export function PoroIcon({ className }: PoroIconProps) {
  return <Mark className={className} />;
}
