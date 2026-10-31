import { m } from "@/i18n";

import { Badge } from "./Badge";

/** Marks a setting or an action whose behaviour is not settled yet. */
export function ExperimentalChip() {
  return (
    <Badge tone="warning" className="font-medium tracking-wide uppercase">
      {m.common_experimental_label()}
    </Badge>
  );
}
