import type { AppError } from "@/lib/tauri";

import { Button } from "./Button";
import { EmptyState, type EmptyStateSize } from "./EmptyState";
import { ErrorState } from "./ErrorState";
import type { GalleryEntry } from "./galleryEntry";
import { LoadingState } from "./LoadingState";
import { Spinner, type SpinnerSize } from "./Spinner";

const SIZES: EmptyStateSize[] = ["xs", "sm", "md"];

const SPINNER_SIZES: SpinnerSize[] = [12, 14, 16, 24, 32];

const ERROR: AppError = { code: "IO", detail: "The folder is read-only." };

const entry: GalleryEntry = {
  name: "EmptyState",
  family: "feedback",
  cases: [
    {
      name: "Sizes",
      render: () => (
        <div className="grid w-full grid-cols-3 gap-3">
          {SIZES.map((size) => (
            <div key={size} className="flex rounded-lg border border-surface-700">
              <EmptyState
                size={size}
                title="No mods match"
                description="Clear a filter to see more of the library."
              />
            </div>
          ))}
        </div>
      ),
    },
    {
      name: "Centred in a taller flex parent, with an action",
      render: () => (
        <div className="flex h-72 w-full rounded-lg border border-surface-700">
          <EmptyState
            title="The library is empty"
            description="Install a mod to see it here."
            action={<Button variant="filled">Install a mod</Button>}
          />
        </div>
      ),
    },
    {
      name: "ErrorState, in both tones",
      render: () => (
        <div className="grid w-full grid-cols-2 gap-3">
          <div className="flex rounded-lg border border-surface-700">
            <ErrorState error={ERROR} title="The library could not be read" />
          </div>
          <div className="flex rounded-lg border border-surface-700">
            <ErrorState error={ERROR} tone="warning" showCode={false} />
          </div>
        </div>
      ),
    },
    {
      name: "Spinner sizes, and LoadingState in a flex parent",
      render: () => (
        <>
          {SPINNER_SIZES.map((size) => (
            <Spinner key={size} size={size} />
          ))}
          <div className="flex h-24 w-48 rounded-lg border border-surface-700">
            <LoadingState />
          </div>
        </>
      ),
    },
  ],
};

export default entry;
