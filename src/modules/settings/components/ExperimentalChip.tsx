import { Badge } from "@/components";

/** Marks a setting whose behaviour is not settled yet. */
export function ExperimentalChip() {
  return (
    <Badge tone="warning" className="font-medium tracking-wide uppercase">
      Experimental
    </Badge>
  );
}
