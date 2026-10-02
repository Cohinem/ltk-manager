import { useQuery } from "@tanstack/react-query";

import { EmptyState, MarkdownView, Spinner } from "@/components";
import { m } from "@/i18n";
import type { InstalledMod, ModDocument } from "@/lib/tauri";
import { modQueries } from "@/modules/library/api";

import { DocumentBody } from "./DocumentBody";

interface ReadmeTabProps {
  mod: InstalledMod;
}

/**
 * One installed mod's readme, as its author wrote it.
 *
 * The renderer is the project editor's, with the same refusals: no raw HTML, no
 * inline script and no image resolving, which matter more over a file a stranger
 * wrote than over a creator's own.
 */
export function ReadmeTab({ mod }: ReadmeTabProps) {
  return <Readme modId={mod.id} />;
}

function Readme({ modId }: { modId: string }) {
  const { data, isPending, error } = useQuery(modQueries.readme(modId));

  if (isPending) {
    return (
      <DocumentBody>
        <Spinner />
      </DocumentBody>
    );
  }

  if (error) {
    return (
      <DocumentBody>
        <EmptyState
          size="sm"
          title={m.library_readme_unreadable_title()}
          description={m.library_readme_unreadable_description()}
        />
      </DocumentBody>
    );
  }

  return <Document document={data} />;
}

/**
 * A readme, or which of the two silences this mod is keeping.
 *
 * An absent readme and an archive that would not open are different facts, and
 * the second says the mod may not work at all.
 */
function Document({ document }: { document: ModDocument }) {
  if (document.state === "absent") {
    return (
      <DocumentBody>
        <EmptyState
          size="sm"
          title={m.library_readme_absent_title()}
          description={m.library_readme_absent_description()}
        />
      </DocumentBody>
    );
  }

  if (document.state === "unreadable") {
    return (
      <DocumentBody>
        <EmptyState
          size="sm"
          title={m.library_readme_unreadable_title()}
          description={m.library_readme_unreadable_description()}
        />
        <p className="mt-2 max-w-full truncate text-center text-meta text-surface-500 select-text">
          {document.reason}
        </p>
      </DocumentBody>
    );
  }

  return (
    <div data-ui="ReadmeTab:document" className="min-h-0 flex-1 overflow-y-auto p-3 scrollbar-md">
      {/* A mod directory is not a project, so a relative image has nothing to
          point at and degrades to its alt text. */}
      <MarkdownView text={document.text} root={null} />
    </div>
  );
}
