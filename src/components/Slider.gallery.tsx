import { useState } from "react";

import type { GalleryEntry } from "./galleryEntry";
import { Slider, type SliderVariant } from "./Slider";

const MARKS = [
  { value: 0, label: "0%" },
  { value: 50, label: "50%" },
  { value: 100, label: "100%" },
];

function Demo({ variant, disabled }: { variant?: SliderVariant; disabled?: boolean }) {
  const [value, setValue] = useState(30);

  return (
    <div className="w-72">
      <Slider
        label="Surface tint"
        value={value}
        onValueChange={setValue}
        marks={MARKS}
        variant={variant}
        disabled={disabled}
      />
    </div>
  );
}

const entry: GalleryEntry = {
  name: "Slider",
  family: "fields",
  cases: [
    { name: "Default", render: () => <Demo /> },
    { name: "Ruler", render: () => <Demo variant="ruler" /> },
    { name: "Disabled", render: () => <Demo disabled /> },
  ],
};

export default entry;
