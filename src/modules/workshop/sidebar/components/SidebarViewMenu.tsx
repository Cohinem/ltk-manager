import { ArrowSquareOutIcon, DotsThreeVerticalIcon, FilesIcon } from "@phosphor-icons/react";

import { IconButton, Menu, Tooltip } from "@/components";
import { m } from "@/i18n";
import { useSidebarView } from "@/stores";

import { gameWadsDocument } from "../../documents";
import { useOpenDocument } from "../../state";
import { railViews } from "./railViews";

/**
 * The panel header's kebab: what this view offers that its body has no room for.
 *
 * DS-GLYPH-ROLE. Draws nothing for a view with nothing to offer, so the header of
 * the Explorer is the title alone.
 */
export function SidebarViewMenu() {
  const id = useSidebarView();
  const openDocument = useOpenDocument();

  const view = railViews().find((entry) => entry.id === id);
  const wide = view?.wide;
  if (!wide) return null;

  return (
    <Menu.Root>
      <Tooltip content={m.workshop_sidebar_menu_label()}>
        <Menu.Trigger
          render={
            <IconButton
              icon={<DotsThreeVerticalIcon />}
              aria-label={m.workshop_sidebar_menu_label()}
              size="row"
            />
          }
        />
      </Tooltip>
      <Menu.Content align="end" sideOffset={4} className="w-60">
        <Menu.Item
          icon={<ArrowSquareOutIcon className="size-4" />}
          onClick={() => openDocument(wide.document())}
        >
          {m.workshop_sidebar_open_tab_action({ title: wide.title })}
        </Menu.Item>

        {/* The tree folds the archives away, so the one route left to a
                single archive is the list this opens. */}
        {id === "game" && (
          <Menu.Item
            icon={<FilesIcon className="size-4" />}
            onClick={() => openDocument(gameWadsDocument())}
          >
            {m.workshop_game_wads_label()}
          </Menu.Item>
        )}
      </Menu.Content>
    </Menu.Root>
  );
}
