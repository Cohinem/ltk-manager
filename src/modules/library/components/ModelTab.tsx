import { useQuery } from "@tanstack/react-query";

import { EmptyState, Spinner } from "@/components";
import { errorSummary, m } from "@/i18n";
import type { InstalledMod } from "@/lib/tauri";
import { modQueries } from "@/modules/library/api";
import { ShippedSkinViewer } from "@/modules/workshop";

import { DocumentBody } from "./DocumentBody";

/** The champion skin that one installed mod ships, in a viewport. */
export default function ModelTab({ mod }: { mod: InstalledMod }) {
  const { data, isPending, error } = useQuery(modQueries.skin(mod.id));

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
          title={m.library_model_failed_title()}
          description={errorSummary(error)}
        />
      </DocumentBody>
    );
  }

  if (data === null) {
    return (
      <DocumentBody>
        <EmptyState
          size="sm"
          title={m.library_model_none_title()}
          description={m.library_model_none_description()}
        />
      </DocumentBody>
    );
  }

  return <ShippedSkinViewer skin={data} />;
}
