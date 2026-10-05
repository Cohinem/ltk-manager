import { AlertBox } from "./AlertBox";
import { Button } from "./Button";
import type { GalleryEntry } from "./galleryEntry";
import type { StatusTone } from "./tone";

const TONES: StatusTone[] = ["neutral", "info", "success", "warning", "danger"];

const entry: GalleryEntry = {
  name: "AlertBox",
  family: "feedback",
  cases: [
    {
      name: "Tones, with a title and a body",
      render: () => (
        <div className="flex w-full max-w-xl flex-col gap-2">
          {TONES.map((tone) => (
            <AlertBox key={tone} tone={tone} title={tone}>
              The patcher builds the overlay from the enabled mods.
            </AlertBox>
          ))}
        </div>
      ),
    },
    {
      name: "A title alone, and a body alone",
      render: () => (
        <div className="flex w-full max-w-xl flex-col gap-2">
          <AlertBox tone="success" title="The overlay is up to date" />
          <AlertBox tone="neutral">Nothing is enabled in this profile.</AlertBox>
        </div>
      ),
    },
    {
      name: "Actions and dismiss",
      render: () => (
        <div className="flex w-full max-w-xl flex-col gap-2">
          <AlertBox
            tone="warning"
            title="Two mods edit the same file"
            actions={
              <Button size="sm" variant="outline">
                Review
              </Button>
            }
          />
          <AlertBox tone="info" title="A new build is ready" onDismiss={() => {}} />
        </div>
      ),
    },
    {
      name: "Pressable",
      render: () => (
        <div className="flex w-full max-w-xl flex-col gap-2">
          <AlertBox tone="danger" title="3 problems found" onClick={() => {}}>
            Open the list
          </AlertBox>
          <AlertBox tone="neutral" title="Checking the library" onClick={() => {}} disabled />
        </div>
      ),
    },
  ],
};

export default entry;
