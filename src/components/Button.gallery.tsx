import { DownloadSimpleIcon, TrashIcon } from "@phosphor-icons/react";

import { Button, type ButtonSize, type ButtonVariant } from "./Button";
import type { GalleryEntry } from "./galleryEntry";

const VARIANTS: ButtonVariant[] = [
  "default",
  "filled",
  "danger",
  "light",
  "duotone",
  "outline",
  "ghost",
  "transparent",
];

const SIZES: ButtonSize[] = ["xs", "sm", "md", "lg", "xl"];

const entry: GalleryEntry = {
  name: "Button",
  family: "buttons",
  cases: [
    {
      name: "Variants",
      render: () =>
        VARIANTS.map((variant) => (
          <Button key={variant} variant={variant}>
            {variant}
          </Button>
        )),
    },
    {
      name: "Sizes",
      render: () =>
        SIZES.map((size) => (
          <Button key={size} size={size} variant="outline">
            {size}
          </Button>
        )),
    },
    {
      name: "Compact sizes",
      render: () =>
        SIZES.map((size) => (
          <Button key={size} size={size} variant="outline" compact>
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
          <Button variant="outline" right={<DownloadSimpleIcon weight="bold" />}>
            Import
          </Button>
          <Button variant="danger" left={<TrashIcon weight="bold" />}>
            Delete
          </Button>
        </>
      ),
    },
    {
      name: "Loading",
      render: () => (
        <>
          <Button variant="filled" loading>
            Saving
          </Button>
          <Button variant="outline" loading left={<DownloadSimpleIcon weight="bold" />}>
            Import
          </Button>
          <Button variant="filled">Saving</Button>
        </>
      ),
    },
    {
      name: "Disabled",
      render: () =>
        VARIANTS.map((variant) => (
          <Button key={variant} variant={variant} disabled>
            {variant}
          </Button>
        )),
    },
  ],
};

export default entry;
