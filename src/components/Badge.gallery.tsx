import { SparkleIcon, WarningIcon, WrenchIcon } from "@phosphor-icons/react";

import { Badge, type BadgeSize, type BadgeTone } from "./Badge";
import type { GalleryEntry } from "./galleryEntry";

const TONES: BadgeTone[] = [
  "neutral",
  "accent",
  "info",
  "success",
  "warning",
  "danger",
  "champion",
  "map",
];

const SIZES: BadgeSize[] = ["sm", "md", "lg"];

const entry: GalleryEntry = {
  name: "Badge",
  family: "feedback",
  cases: [
    ...SIZES.map((size) => ({
      name: `Tones, ${size}`,
      render: () =>
        TONES.map((tone) => (
          <Badge key={tone} tone={tone} size={size}>
            {tone}
          </Badge>
        )),
    })),
    {
      name: "Dashed, for what the app worked out",
      render: () =>
        TONES.map((tone) => (
          <Badge
            key={tone}
            tone={tone}
            dashed
            icon={<SparkleIcon weight="bold" className="size-2.5" />}
          >
            {tone}
          </Badge>
        )),
    },
    {
      name: "Pressable, with a glyph, a count and a disabled one",
      render: () => (
        <>
          <Badge
            size="lg"
            tone="warning"
            icon={<WarningIcon weight="bold" className="size-4" />}
            aria-label="Suspected"
            onClick={() => {}}
          />
          <Badge
            size="lg"
            tone="danger"
            icon={<WrenchIcon weight="bold" className="size-4" />}
            onClick={() => {}}
          >
            3
          </Badge>
          <Badge size="lg" onClick={() => {}}>
            Flagged
          </Badge>
          <Badge size="lg" tone="warning" onClick={() => {}} disabled>
            Disabled
          </Badge>
        </>
      ),
    },
  ],
};

export default entry;
