import { ArrowsInLineVerticalIcon } from "@phosphor-icons/react";

import { IconButton, Kbd } from "@/components";
import { m } from "@/i18n";

import { COLLAPSE_ALL_SHORTCUT } from "../utils/treeGestures";

/** The toolbar button that shuts every folder of a tree. */
export function CollapseAllButton({
  onCollapse,
  disabled = false,
}: {
  onCollapse: () => void;
  /** Kept mounted and greyed where the tree is not on screen, so the toolbar holds its layout. */
  disabled?: boolean;
}) {
  return (
    <IconButton
      icon={<ArrowsInLineVerticalIcon />}
      onClick={onCollapse}
      disabled={disabled}
      aria-label={m.workshop_explorer_collapse_all_action()}
      tooltip={
        <>
          {m.workshop_explorer_collapse_all_label()} <Kbd shortcut={COLLAPSE_ALL_SHORTCUT} />
        </>
      }
    />
  );
}
