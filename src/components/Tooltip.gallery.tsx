import { Button } from "./Button";
import type { GalleryEntry } from "./galleryEntry";
import { Tooltip, type TooltipProps } from "./Tooltip";

const SIDES: Array<NonNullable<TooltipProps["side"]>> = ["top", "right", "bottom", "left"];

const entry: GalleryEntry = {
  name: "Tooltip",
  family: "floating",
  cases: [
    {
      name: "Sides",
      render: () =>
        SIDES.map((side) => (
          <Tooltip key={side} side={side} content={`Opens on the ${side}`}>
            <Button variant="outline">{side}</Button>
          </Tooltip>
        )),
    },
    {
      name: "No delay",
      render: () => (
        <Tooltip content="Shown at once" delay={0}>
          <Button variant="outline">Hover</Button>
        </Tooltip>
      ),
    },
  ],
};

export default entry;
