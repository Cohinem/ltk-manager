import { DownloadSimpleIcon, TrashIcon } from "@phosphor-icons/react";

import { Button, type ButtonSize } from "./Button";
import { ButtonGroup } from "./ButtonGroup";
import type { GalleryEntry } from "./galleryEntry";

const SIZES: ButtonSize[] = ["xs", "sm", "md", "lg"];

const entry: GalleryEntry = {
  name: "Button",
  family: "buttons",
  cases: [
    {
      name: "Filled",
      render: () => (
        <>
          <Button variant="filled">accent</Button>
          <Button variant="filled" tone="danger">
            danger
          </Button>
        </>
      ),
    },
    {
      name: "Tonal",
      render: () => (
        <>
          <Button variant="tonal">accent</Button>
          <Button variant="tonal" tone="danger">
            danger
          </Button>
        </>
      ),
    },
    {
      name: "Outline",
      render: () => (
        <>
          <Button>neutral</Button>
          <Button tone="accent">accent</Button>
          <Button tone="danger">danger</Button>
        </>
      ),
    },
    {
      name: "Ghost",
      render: () => (
        <>
          <Button variant="ghost">neutral</Button>
          <Button variant="ghost" tone="accent">
            accent
          </Button>
          <Button variant="ghost" tone="danger">
            danger
          </Button>
        </>
      ),
    },
    {
      name: "Sizes",
      render: () =>
        SIZES.map((size) => (
          <Button key={size} size={size}>
            {size}
          </Button>
        )),
    },
    {
      name: "Icons",
      render: () => (
        <>
          <Button variant="filled" left={<DownloadSimpleIcon weight="bold" />}>
            Import
          </Button>
          <Button right={<DownloadSimpleIcon weight="bold" />}>Import</Button>
          <Button variant="filled" tone="danger" left={<TrashIcon weight="bold" />}>
            Delete
          </Button>
        </>
      ),
    },
    {
      name: "Loading beside its idle width",
      render: () => (
        <>
          <Button variant="filled" loading>
            Saving
          </Button>
          <Button variant="filled">Saving</Button>
          <Button loading left={<DownloadSimpleIcon weight="bold" />}>
            Import
          </Button>
          <Button left={<DownloadSimpleIcon weight="bold" />}>Import</Button>
        </>
      ),
    },
    {
      name: "Disabled",
      render: () => (
        <>
          <Button variant="filled" disabled>
            filled
          </Button>
          <Button variant="tonal" disabled>
            tonal
          </Button>
          <Button disabled>outline</Button>
          <Button variant="ghost" disabled>
            ghost
          </Button>
        </>
      ),
    },
    {
      name: "Disabled with a reason",
      render: () => (
        <Button variant="filled" disabled disabledReason="Enable a mod first.">
          Start patcher
        </Button>
      ),
    },
    {
      name: "Joined",
      render: () => (
        <ButtonGroup>
          <Button variant="tonal" size="lg">
            Play
          </Button>
          <Button variant="tonal" size="lg" left={<DownloadSimpleIcon weight="bold" />} />
        </ButtonGroup>
      ),
    },
  ],
};

export default entry;
