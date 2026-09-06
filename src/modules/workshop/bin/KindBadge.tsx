import { Tooltip } from "@/components";
import type { WorkshopFileKind } from "@/lib/tauri";

import { describeFileKind } from "../utils/fileKindIcon";

/** The kind of a `file` link's target, as the tree rows draw one. */
export function KindBadge({ fileKind }: { fileKind: WorkshopFileKind }) {
  const descriptor = describeFileKind(fileKind);
  const Icon = descriptor.icon;
  return (
    <Tooltip content={descriptor.label}>
      <span
        role="img"
        aria-label={descriptor.label}
        className="flex shrink-0"
        style={{ color: `var(${descriptor.tintToken})` }}
      >
        <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
      </span>
    </Tooltip>
  );
}
