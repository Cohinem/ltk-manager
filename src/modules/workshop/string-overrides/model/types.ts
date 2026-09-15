export interface OverrideEntry {
  id: string;
  key: string;
  value: string;
}

export type OverrideEntryField = "key" | "value";

/**
 * Where the autosave stands. `pending` and `saving` both mean "on its way",
 * `blocked` waits on a validation error, and `failed` waits on a retry or on
 * the next edit.
 */
export type OverrideSaveState = "clean" | "pending" | "saving" | "blocked" | "failed";
