import { type ReactNode, useState } from "react";

import { Button } from "./Button";
import { ConfirmDialog, type ConfirmTone } from "./ConfirmDialog";
import { Dialog, type DialogHeaderTone, type DialogOverlaySize } from "./Dialog";
import { FormField } from "./FormField";
import type { GalleryEntry } from "./galleryEntry";

const SIZES: DialogOverlaySize[] = ["sm", "md", "lg", "xl"];

interface ShellDemoProps {
  label: string;
  size?: DialogOverlaySize;
  tone?: DialogHeaderTone;
  description?: ReactNode;
  closable?: boolean;
  paragraphs?: number;
}

function ShellDemo({ label, size, tone, description, closable, paragraphs = 1 }: ShellDemoProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        {label}
      </Button>
      <Dialog.Shell
        open={open}
        onClose={() => setOpen(false)}
        title="New project"
        description={description}
        size={size}
        tone={tone}
        closable={closable}
      >
        <Dialog.Body>
          <FormField label="Name" placeholder="Fiora VFX" />
          {Array.from({ length: paragraphs }, (_, index) => (
            <p key={index} className="text-sm text-surface-400">
              A project holds the layers a build packs into one mod archive.
            </p>
          ))}
        </Dialog.Body>
        <Dialog.Footer>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button variant="filled" onClick={() => setOpen(false)}>
            Create
          </Button>
        </Dialog.Footer>
      </Dialog.Shell>
    </>
  );
}

function ConfirmDemo({ tone, heading }: { tone: ConfirmTone; heading?: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        {heading === undefined ? "Prose" : tone}
      </Button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={() => setOpen(false)}
        title="Delete project"
        heading={heading}
        description="The project folder is removed from disk."
        confirmLabel="Delete"
        tone={tone}
      />
    </>
  );
}

const entry: GalleryEntry = {
  name: "Dialog",
  family: "dialogs",
  cases: [
    {
      name: "Sizes",
      render: () => SIZES.map((size) => <ShellDemo key={size} label={size} size={size} />),
    },
    {
      name: "Header",
      render: () => (
        <>
          <ShellDemo label="Description" description="Starts an empty project." />
          <ShellDemo label="Accent tone" tone="accent" />
          <ShellDemo label="No close button" closable={false} />
        </>
      ),
    },
    {
      name: "Tall body",
      render: () => <ShellDemo label="40 paragraphs" paragraphs={40} />,
    },
    {
      name: "ConfirmDialog",
      render: () => (
        <>
          <ConfirmDemo tone="danger" heading="Delete Fiora VFX?" />
          <ConfirmDemo tone="warning" heading="Delete Fiora VFX?" />
          <ConfirmDemo tone="danger" />
        </>
      ),
    },
  ],
};

export default entry;
