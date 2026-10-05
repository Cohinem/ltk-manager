import { GearIcon, PushPinIcon, TrashIcon } from "@phosphor-icons/react";
import { useState } from "react";

import { IconButton, type IconButtonSize } from "./Button";
import type { GalleryEntry } from "./galleryEntry";

const SIZES: IconButtonSize[] = ["row", "xs", "sm", "md", "lg"];

function PinToggle() {
  const [pinned, setPinned] = useState(true);

  return (
    <IconButton
      icon={<PushPinIcon />}
      label="Pin"
      pressed={pinned}
      onClick={() => setPinned(!pinned)}
    />
  );
}

const entry: GalleryEntry = {
  name: "IconButton",
  family: "buttons",
  cases: [
    {
      name: "Sizes",
      render: () =>
        SIZES.map((size) => <IconButton key={size} size={size} icon={<GearIcon />} label={size} />),
    },
    {
      name: "Variants",
      render: () => (
        <>
          <IconButton icon={<GearIcon />} label="Ghost" />
          <IconButton icon={<GearIcon />} label="Outline" variant="outline" />
          <IconButton icon={<GearIcon />} label="Filled" variant="filled" />
          <IconButton icon={<TrashIcon />} label="Danger" variant="danger" />
        </>
      ),
    },
    { name: "Pressed", render: () => <PinToggle /> },
    {
      name: "Disabled",
      render: () => <IconButton icon={<GearIcon />} label="Settings" disabled />,
    },
  ],
};

export default entry;
