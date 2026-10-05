import { XIcon } from "@phosphor-icons/react";

import { Button } from "./Button";
import type { GalleryEntry } from "./galleryEntry";
import { Popover } from "./Popover";

const entry: GalleryEntry = {
  name: "Popover",
  family: "floating",
  cases: [
    {
      name: "Title, description and close",
      render: () => (
        <Popover.Root>
          <Popover.Trigger render={<Button variant="outline">Open</Button>} />
          <Popover.Content className="w-72 p-4">
            <div className="flex items-start justify-between gap-3">
              <Popover.Title>Filter by tag</Popover.Title>
              <Popover.Close aria-label="Close" className="size-6">
                <XIcon weight="bold" className="size-3.5" />
              </Popover.Close>
            </div>
            <Popover.Description>
              Only mods carrying every chosen tag are listed.
            </Popover.Description>
          </Popover.Content>
        </Popover.Root>
      ),
    },
    {
      name: "Arrow",
      render: () => (
        <Popover.Root>
          <Popover.Trigger render={<Button variant="outline">Open above</Button>} />
          <Popover.Content side="top" sideOffset={10} className="p-3">
            <Popover.Arrow />
            <Popover.Description>Opens on the side with room.</Popover.Description>
          </Popover.Content>
        </Popover.Root>
      ),
    },
  ],
};

export default entry;
