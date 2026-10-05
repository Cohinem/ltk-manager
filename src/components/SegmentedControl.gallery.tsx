import { GridFourIcon, ListIcon, PlusIcon } from "@phosphor-icons/react";
import { useState } from "react";

import { IconButton } from "./Button";
import type { GalleryEntry } from "./galleryEntry";
import { SegmentedControl, type SegmentedControlProps } from "./SegmentedControl";

const TEXT = [
  { value: "all", label: "All" },
  { value: "enabled", label: "Enabled" },
  { value: "disabled", label: "Disabled" },
];

const ICONS = [
  { value: "grid", label: <GridFourIcon weight="bold" className="size-4" />, name: "Grid" },
  { value: "list", label: <ListIcon weight="bold" className="size-4" />, name: "List" },
];

function Text({ size }: { size: SegmentedControlProps<string>["size"] }) {
  const [value, setValue] = useState("all");

  return (
    <SegmentedControl
      size={size}
      aria-label="Filter"
      options={TEXT}
      value={value}
      onChange={setValue}
    />
  );
}

function Icons({ withAction }: { withAction?: boolean }) {
  const [value, setValue] = useState("grid");

  return (
    <SegmentedControl
      aria-label="View"
      options={ICONS}
      value={value}
      onChange={setValue}
      action={withAction ? <IconButton icon={<PlusIcon />} label="Add a view" /> : undefined}
    />
  );
}

const entry: GalleryEntry = {
  name: "SegmentedControl",
  family: "navigation",
  cases: [
    {
      name: "Sizes",
      render: () => (
        <>
          <Text size="sm" />
          <Text size="xs" />
        </>
      ),
    },
    {
      name: "Icons and a trailing action",
      render: () => (
        <>
          <Icons />
          <Icons withAction />
        </>
      ),
    },
  ],
};

export default entry;
