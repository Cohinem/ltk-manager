import {
  ArrowSquareOutIcon,
  CaretDownIcon,
  GearIcon,
  PencilSimpleIcon,
  PlayIcon,
  PushPinIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import { useState } from "react";

import { Button, IconButton, type IconButtonSize } from "./Button";
import { ButtonGroup } from "./ButtonGroup";
import type { GalleryEntry } from "./galleryEntry";

const SIZES: IconButtonSize[] = ["row", "xs", "sm", "md", "lg"];

const ROWS = ["mSkinMeshProperties", "mAnimationGraphData", "mHealthBarData"];

function PinToggle({ muted }: { muted?: boolean }) {
  const [pinned, setPinned] = useState(true);

  return (
    <IconButton
      icon={<PushPinIcon />}
      label="Pin"
      muted={muted}
      pressed={pinned}
      onClick={() => setPinned(!pinned)}
    />
  );
}

function RevealRows() {
  const [pinned, setPinned] = useState(true);

  return (
    <ul className="flex w-72 flex-col">
      {ROWS.map((name, index) => (
        <li
          key={name}
          className="group/reveal flex h-6 items-center gap-1 rounded-sm px-1.5 font-mono text-code text-surface-200 hover:bg-surface-veil-soft"
        >
          <span className="min-w-0 flex-1 truncate">{name}</span>
          {index === 0 && (
            <IconButton
              size="row"
              icon={<PushPinIcon />}
              label="Pin"
              muted
              reveal
              pressed={pinned}
              onClick={() => setPinned(!pinned)}
            />
          )}
          <IconButton
            size="row"
            icon={<PencilSimpleIcon />}
            label="Edit"
            muted
            reveal
            disabled={index === 2}
          />
          <IconButton size="row" icon={<ArrowSquareOutIcon />} label="Open" muted reveal />
        </li>
      ))}
    </ul>
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
          <IconButton icon={<GearIcon />} label="Tonal" variant="tonal" />
          <IconButton icon={<GearIcon />} label="Filled" variant="filled" />
          <IconButton icon={<TrashIcon />} label="Ghost danger" tone="danger" />
          <IconButton icon={<TrashIcon />} label="Filled danger" variant="filled" tone="danger" />
        </>
      ),
    },
    { name: "Pressed", render: () => <PinToggle /> },
    {
      name: "Muted, beside the default",
      render: () => (
        <>
          <IconButton icon={<GearIcon />} label="Default" />
          <IconButton icon={<GearIcon />} label="Muted" muted />
          <IconButton icon={<TrashIcon />} label="Muted danger" muted tone="danger" />
          <PinToggle muted />
          <IconButton icon={<GearIcon />} label="Muted and disabled" muted disabled />
        </>
      ),
    },
    { name: "Reveal, with the last row's edit disabled", render: () => <RevealRows /> },
    {
      name: "Narrow, as the caret of a split button",
      render: () =>
        (["xs", "sm", "md", "lg"] as const).map((size) => (
          <ButtonGroup key={size}>
            <Button size={size} left={<PlayIcon weight="bold" className="size-4" />}>
              Test
            </Button>
            <IconButton
              size={size}
              variant="outline"
              icon={<CaretDownIcon />}
              label="Test options"
              narrow
            />
          </ButtonGroup>
        )),
    },
    {
      name: "Disabled",
      render: () => (
        <>
          <IconButton icon={<GearIcon />} label="Settings" disabled />
          <IconButton
            icon={<GearIcon />}
            label="Settings"
            disabled
            disabledReason="Settings are locked while patching."
          />
        </>
      ),
    },
  ],
};

export default entry;
