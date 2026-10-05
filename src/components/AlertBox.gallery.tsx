import { AlertBox, type AlertBoxVariant } from "./AlertBox";
import { Button } from "./Button";
import type { GalleryEntry } from "./galleryEntry";

const VARIANTS: AlertBoxVariant[] = ["neutral", "info", "success", "warning", "error"];

const entry: GalleryEntry = {
  name: "AlertBox",
  family: "feedback",
  cases: [
    {
      name: "Variants",
      render: () => (
        <div className="flex w-full max-w-xl flex-col gap-2">
          {VARIANTS.map((variant) => (
            <AlertBox key={variant} variant={variant} title={variant}>
              The patcher builds the overlay from the enabled mods.
            </AlertBox>
          ))}
        </div>
      ),
    },
    {
      name: "Actions and dismiss",
      render: () => (
        <div className="flex w-full max-w-xl flex-col gap-2">
          <AlertBox
            variant="warning"
            title="Two mods edit the same file"
            actions={
              <Button size="xs" variant="outline">
                Review
              </Button>
            }
          />
          <AlertBox variant="info" title="A new build is ready" onDismiss={() => {}} />
        </div>
      ),
    },
    {
      name: "Pressable",
      render: () => (
        <div className="flex w-full max-w-xl flex-col gap-2">
          <AlertBox variant="error" title="3 problems found" onClick={() => {}}>
            Open the list
          </AlertBox>
          <AlertBox variant="neutral" title="Checking the library" onClick={() => {}} disabled />
        </div>
      ),
    },
  ],
};

export default entry;
