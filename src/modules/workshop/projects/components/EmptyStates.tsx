import { open } from "@tauri-apps/plugin-dialog";
import { Download, Hammer, Plus } from "lucide-react";

import { Button, EmptyState } from "@/components";
import { m } from "@/i18n";

import { useImportFromModpkg } from "../../imports/api/useImportFromModpkg";
import { useNewProjectDialog } from "../../state";

export function NoProjectsState() {
  const openNewProjectDialog = useNewProjectDialog((s) => s.open);
  const importFromModpkg = useImportFromModpkg();

  async function handleImport() {
    const file = await open({
      multiple: false,
      filters: [{ name: m.workshop_projects_modpkg_filter_label(), extensions: ["modpkg"] }],
    });
    if (file) {
      importFromModpkg.mutate(file, {
        onError: (err) => console.error("Failed to import modpkg:", err),
      });
    }
  }

  return (
    <EmptyState
      icon={<Hammer className="size-16" />}
      title={m.workshop_projects_empty_title()}
      description={m.workshop_projects_empty_description()}
      action={
        <>
          <Button variant="outline" onClick={handleImport} left={<Download className="size-4" />}>
            {m.workshop_projects_import_action()}
          </Button>
          <Button
            variant="filled"
            onClick={openNewProjectDialog}
            left={<Plus className="size-4" />}
          >
            {m.workshop_projects_new_action()}
          </Button>
        </>
      }
    />
  );
}

export function NoSearchResultsState() {
  return (
    <EmptyState
      title={m.workshop_projects_no_results_title()}
      description={m.workshop_projects_no_results_description()}
    />
  );
}
