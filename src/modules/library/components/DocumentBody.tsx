import type { ReactNode } from "react";

import { EmptyState } from "@/components";
import { m } from "@/i18n";
import type { InstalledMod } from "@/lib/tauri";

/** A documents tab's state in the middle of the panel, in place of its content. */
export function DocumentBody({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center p-6">{children}</div>
  );
}

export interface DocumentGateProps {
  /** The mod the panel was opened about, or none yet. */
  mod: InstalledMod | null;
  /** Whether the mod the panel held has been uninstalled under it. */
  missing: boolean;
  /** What the tab says while no mod is open. */
  emptyTitle: string;
  emptyDescription: string;
  children: (mod: InstalledMod) => ReactNode;
}

/** A documents tab's content once a mod is open, and what it says while none is. */
export function DocumentGate({
  mod,
  missing,
  emptyTitle,
  emptyDescription,
  children,
}: DocumentGateProps) {
  if (missing) {
    return (
      <DocumentBody>
        <EmptyState
          size="sm"
          title={m.library_documents_removed_title()}
          description={m.library_documents_removed_description()}
        />
      </DocumentBody>
    );
  }

  if (!mod) {
    return (
      <DocumentBody>
        <EmptyState size="sm" title={emptyTitle} description={emptyDescription} />
      </DocumentBody>
    );
  }

  return children(mod);
}
