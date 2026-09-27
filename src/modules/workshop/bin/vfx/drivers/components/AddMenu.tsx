import { PlusIcon } from "@phosphor-icons/react";
import { use } from "react";

import { IconButton, Menu } from "@/components";

import { LeafEditContext } from "../../../tree/hooks/useLeafEdit";

/** One entry of an Add menu: what it names, and what picking it does. */
export interface AddChoice {
  readonly key: string;
  readonly text: string;
  readonly pick: () => void;
}

/** A titled run of an Add menu's entries, which draws as a submenu beside other runs. */
export interface AddSection {
  readonly title: string;
  readonly choices: readonly AddChoice[];
}

const POPUP = "max-h-80 overflow-y-auto";

/**
 * The plus button on a section or node header that adds what the header holds: a flat list
 * where one section has entries, and a submenu per section where several do.
 *
 * Nothing draws where the document takes no edit or no section has an entry left to add.
 */
export function AddMenu({ label, sections }: { label: string; sections: readonly AddSection[] }) {
  const editable = use(LeafEditContext) !== null;
  const shown = sections.filter((section) => section.choices.length > 0);
  if (!editable || shown.length === 0) return null;

  const [only] = shown;
  const flat = shown.length === 1 && only !== undefined;

  return (
    <Menu.Root>
      <Menu.Trigger
        render={
          <IconButton
            variant="ghost"
            size="xs"
            aria-label={label}
            title={label}
            className="nodrag ml-auto shrink-0"
            icon={<PlusIcon weight="bold" className="h-3.5 w-3.5" />}
          />
        }
      />
      <Menu.Portal>
        <Menu.Positioner>
          <Menu.Popup className={POPUP}>
            {flat && <Choices choices={only.choices} />}
            {!flat && shown.map((section) => <Submenu key={section.title} section={section} />)}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

function Submenu({ section }: { section: AddSection }) {
  return (
    <Menu.SubmenuRoot>
      <Menu.SubmenuTrigger>{section.title}</Menu.SubmenuTrigger>
      <Menu.Portal>
        <Menu.SubmenuPositioner>
          <Menu.Popup className={POPUP}>
            <Choices choices={section.choices} />
          </Menu.Popup>
        </Menu.SubmenuPositioner>
      </Menu.Portal>
    </Menu.SubmenuRoot>
  );
}

function Choices({ choices }: { choices: readonly AddChoice[] }) {
  return choices.map((choice) => (
    <Menu.Item key={choice.key} onClick={choice.pick}>
      {choice.text}
    </Menu.Item>
  ));
}
