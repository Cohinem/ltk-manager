import type { GalleryEntry } from "./galleryEntry";
import { Switch } from "./Switch";

const entry: GalleryEntry = {
  name: "Switch",
  family: "fields",
  cases: [
    {
      name: "States",
      render: () => (
        <>
          <Switch aria-label="Off" />
          <Switch defaultChecked aria-label="On" />
          <Switch disabled aria-label="Disabled" />
          <Switch disabled defaultChecked aria-label="Disabled and on" />
        </>
      ),
    },
  ],
};

export default entry;
