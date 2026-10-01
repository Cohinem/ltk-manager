import { m } from "@/i18n";
import type { WadSource } from "@/lib/tauri";

/** The copy of a browser where the game's and the League client's differ. */
export interface SourceCopy {
  /** The root crumb of the explorer bar. */
  root: string;
  /** The search scope that reads the whole index. */
  whole: string;
  /** The tree's accessible name. */
  filesTree: string;
  /** The archive list's document title. */
  wadsLabel: string;
  wadsAction: string;
  rebuildAction: string;
  emptyDescription: string;
  noMatchDescription: string;
}

/** The copy a browser of `source` reads. */
export function sourceCopy(source: WadSource): SourceCopy {
  if (source === "lcu") {
    return {
      root: m.workshop_lcu_source_label(),
      whole: m.workshop_explorer_scope_lcu_label(),
      filesTree: m.workshop_lcu_files_tree_label(),
      wadsLabel: m.workshop_lcu_wads_label(),
      wadsAction: m.workshop_lcu_wads_action(),
      rebuildAction: m.workshop_lcu_rebuild_action(),
      emptyDescription: m.workshop_lcu_empty_description(),
      noMatchDescription: m.workshop_lcu_no_match_description(),
    };
  }

  return {
    root: m.workshop_game_source_label(),
    whole: m.workshop_explorer_scope_game_label(),
    filesTree: m.workshop_game_files_tree_label(),
    wadsLabel: m.workshop_game_wads_label(),
    wadsAction: m.workshop_game_wads_action(),
    rebuildAction: m.workshop_game_rebuild_action(),
    emptyDescription: m.workshop_game_empty_description(),
    noMatchDescription: m.workshop_game_no_match_description(),
  };
}
