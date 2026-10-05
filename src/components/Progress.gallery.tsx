import type { GalleryEntry } from "./galleryEntry";
import { ProgressBar } from "./Progress";

const entry: GalleryEntry = {
  name: "Progress",
  family: "feedback",
  cases: [
    {
      name: "Sizes",
      render: () => (
        <div className="flex w-80 flex-col gap-4">
          <ProgressBar size="sm" value={35} aria-label="Small" />
          <ProgressBar size="md" value={70} aria-label="Medium" />
        </div>
      ),
    },
    {
      name: "Labels",
      render: () => (
        <div className="w-80">
          <ProgressBar value={40} label="Checking mods" valueLabel="17 / 42" />
        </div>
      ),
    },
    {
      name: "Indeterminate",
      render: () => (
        <div className="w-80">
          <ProgressBar value={null} aria-label="Working" />
        </div>
      ),
    },
  ],
};

export default entry;
