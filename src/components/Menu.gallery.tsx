import {
  CopyIcon,
  FolderOpenIcon,
  PencilSimpleIcon,
  SortAscendingIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import { type ReactNode, useState } from "react";

import { Button } from "./Button";
import { ContextMenu } from "./ContextMenu";
import type { GalleryEntry } from "./galleryEntry";
import { Menu } from "./Menu";

/** The rows a menu and a context menu both take, drawn from whichever is passed. */
function Rows({ parts }: { parts: typeof Menu | typeof ContextMenu }) {
  const [sort, setSort] = useState("name");
  const [thumbnails, setThumbnails] = useState(true);

  return (
    <>
      <parts.Item icon={<PencilSimpleIcon />} shortcut="F2">
        Rename
      </parts.Item>
      <parts.Item icon={<CopyIcon />} shortcut="Ctrl+C">
        Copy path
      </parts.Item>
      <parts.Item icon={<FolderOpenIcon />} disabled>
        Show in folder
      </parts.Item>
      <parts.SubmenuRoot>
        <parts.SubmenuTrigger icon={<SortAscendingIcon />}>Sort by</parts.SubmenuTrigger>
        <parts.SubmenuContent>
          <parts.RadioGroup value={sort} onValueChange={(value: unknown) => setSort(String(value))}>
            <parts.RadioItem value="name">Name</parts.RadioItem>
            <parts.RadioItem value="size">Size</parts.RadioItem>
            <parts.RadioItem value="kind">Kind</parts.RadioItem>
          </parts.RadioGroup>
        </parts.SubmenuContent>
      </parts.SubmenuRoot>
      <parts.Separator />
      <parts.Group>
        <parts.GroupLabel>View</parts.GroupLabel>
        <parts.CheckboxItem checked={thumbnails} onCheckedChange={setThumbnails}>
          Thumbnails
        </parts.CheckboxItem>
      </parts.Group>
      <parts.Separator />
      <parts.Item icon={<TrashIcon />} variant="danger" shortcut="Del">
        Delete
      </parts.Item>
    </>
  );
}

function Target({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-20 w-64 items-center justify-center rounded-lg border border-dashed border-surface-600 text-sm text-surface-400">
      {children}
    </div>
  );
}

const entry: GalleryEntry = {
  name: "Menu",
  family: "floating",
  cases: [
    {
      name: "Every kind of row",
      render: () => (
        <Menu.Root>
          <Menu.Trigger render={<Button>Open menu</Button>} />
          <Menu.Content align="start" className="w-56">
            <Rows parts={Menu} />
          </Menu.Content>
        </Menu.Root>
      ),
    },
    {
      name: "ContextMenu, with the same rows",
      render: () => (
        <ContextMenu.Root>
          <ContextMenu.Trigger>
            <Target>Right click here</Target>
          </ContextMenu.Trigger>
          <ContextMenu.Content className="w-56">
            <Rows parts={ContextMenu} />
          </ContextMenu.Content>
        </ContextMenu.Root>
      ),
    },
  ],
};

export default entry;
