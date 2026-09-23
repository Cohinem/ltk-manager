import type { WorkshopProject } from "@/lib/tauri";
import { createDialogStore } from "@/stores/createDialogStore";

export const usePackDialog = createDialogStore<WorkshopProject>();

export const useBulkPackDialog = createDialogStore<WorkshopProject[]>();
