import { use } from "react";

import { m } from "@/i18n";

import { useFloatingShellPanes, useOpenShellPane, useOpenShellPanes } from "../../../state";
import { useObjectCommands } from "../../menus/hooks/useObjectMenus";
import { ObjectMenuContext } from "../../menus/state/objectMenu";
import { SHELL_PANE_TITLE, type ShellPaneId } from "../../shell/utils/shellPanes";
import type { Lookup } from "../utils/offerItems";
import { SKIN_FIT_COMMAND } from "../utils/skinCommands";

/** What the commands of a skin need to apply. Each reason is null where the commands apply. */
export interface SkinGate {
  readonly preview: string | null;
  /** The reason for a pane that only the shell draws. */
  readonly pane: (pane: ShellPaneId) => string | null;
  /** The reason for the inspector's sections, which the narrow stack draws too. */
  readonly sections: string | null;
  /** The reason of a document that takes no edit. */
  readonly edit: string | undefined;
  /** Returns `run` with `pane` brought to the front first, so a focus lands where it is seen. */
  readonly front: (pane: ShellPaneId) => (run: () => void) => () => void;
}

/** Returns why the commands of the enclosing skin tab do not apply now. */
export function useSkinGate(lookup: Lookup): SkinGate {
  const menu = use(ObjectMenuContext);
  const open = useOpenShellPanes("skin");
  const floating = useFloatingShellPanes("skin");
  const openPane = useOpenShellPane("skin");
  const { reason: edit } = useObjectCommands();

  const shelled = menu?.shelled === true;
  const layout =
    menu?.mode === "properties"
      ? m.workshop_bin_menu_skin_layout_reason({ view: menu.layoutTitle ?? "" })
      : null;
  const closed = (pane: ShellPaneId) =>
    shelled && !open.has(pane) && !floating.includes(pane)
      ? m.workshop_bin_menu_skin_pane_reason({ pane: SHELL_PANE_TITLE[pane]() })
      : null;
  const noPreview =
    lookup(SKIN_FIT_COMMAND) === null ? m.workshop_bin_menu_skin_preview_reason() : null;

  return {
    preview: layout ?? closed("preview") ?? noPreview,
    pane: (pane) => layout ?? (shelled ? closed(pane) : m.workshop_bin_menu_skin_wide_reason()),
    sections: layout ?? closed("inspector"),
    edit,
    front: (pane) => (run) => () => {
      if (shelled) openPane(pane);
      run();
    },
  };
}
