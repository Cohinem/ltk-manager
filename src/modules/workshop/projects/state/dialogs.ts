import type { WorkshopProject } from "@/lib/tauri";
import { createDialogStore } from "@/stores/createDialogStore";

export const useDeleteProjectDialog = createDialogStore<WorkshopProject>();

export const useRenameProjectDialog = createDialogStore<WorkshopProject>();

export const useNewProjectDialog = createDialogStore();

export const useBulkDeleteDialog = createDialogStore<WorkshopProject[]>();
