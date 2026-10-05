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
    {
      name: "Labelled",
      render: () => (
        <div className="flex flex-col gap-3">
          <Switch label="Start with Windows" />
          <Switch
            defaultChecked
            label="Close to the tray"
            description="The patcher keeps running while the window is closed."
          />
          <Switch disabled label="Verify archives on mount" description="Needs a game folder." />
        </div>
      ),
    },
  ],
};

export default entry;
