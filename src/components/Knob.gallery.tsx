import { useState } from "react";

import type { GalleryEntry } from "./galleryEntry";
import { Knob } from "./Knob";

function Demo({
  min,
  max,
  initial,
  unit,
  disabled,
}: {
  min: number;
  max: number;
  initial: number;
  unit?: string;
  disabled?: boolean;
}) {
  const [value, setValue] = useState(initial);

  return (
    <span className="flex items-center gap-2 font-mono text-surface-200">
      <Knob
        value={value}
        min={min}
        max={max}
        defaultValue={0}
        unit={unit}
        onChange={setValue}
        disabled={disabled}
        aria-label="Volume"
      />
      {unit === undefined ? value : `${value} ${unit}`}
    </span>
  );
}

const entry: GalleryEntry = {
  name: "Knob",
  family: "fields",
  cases: [
    { name: "Bipolar", render: () => <Demo min={-96} max={12} initial={-12} unit="dB" /> },
    { name: "Unipolar", render: () => <Demo min={0} max={100} initial={40} /> },
    { name: "Disabled", render: () => <Demo min={0} max={100} initial={40} disabled /> },
  ],
};

export default entry;
