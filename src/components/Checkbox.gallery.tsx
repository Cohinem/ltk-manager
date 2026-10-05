import { Checkbox, type CheckboxSize } from "./Checkbox";
import type { GalleryEntry } from "./galleryEntry";

const SIZES: CheckboxSize[] = ["sm", "md", "lg"];

const entry: GalleryEntry = {
  name: "Checkbox",
  family: "fields",
  cases: [
    {
      name: "Sizes",
      render: () =>
        SIZES.map((size) => <Checkbox key={size} size={size} defaultChecked aria-label={size} />),
    },
    {
      name: "States",
      render: () => (
        <>
          <Checkbox aria-label="Unchecked" />
          <Checkbox defaultChecked aria-label="Checked" />
          <Checkbox indeterminate aria-label="Indeterminate" />
          <Checkbox disabled aria-label="Disabled" />
          <Checkbox disabled defaultChecked aria-label="Disabled and checked" />
        </>
      ),
    },
    {
      name: "Label and description",
      render: () => (
        <>
          <Checkbox label="Start with Windows" />
          <Checkbox
            defaultChecked
            label="Verify archives"
            description="Archives get verified on demand when mounting."
          />
          <Checkbox disabled label="Unavailable" description="Needs the patcher." />
        </>
      ),
    },
  ],
};

export default entry;
