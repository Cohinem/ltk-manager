import { FormField, TextareaField } from "./FormField";
import type { GalleryEntry } from "./galleryEntry";

const entry: GalleryEntry = {
  name: "FormField",
  family: "fields",
  cases: [
    {
      name: "States",
      render: () => (
        <div className="grid w-full max-w-2xl grid-cols-2 gap-4">
          <FormField label="Name" placeholder="Fiora VFX" />
          <FormField label="Name" description="Shown in the library." defaultValue="Fiora VFX" />
          <FormField label="Version" required defaultValue="1.0.0" />
          <FormField label="Version" error="A version has three parts." defaultValue="1.0" />
          <FormField label="Author" disabled defaultValue="Crauzer" />
          <FormField placeholder="No label" aria-label="Unlabelled" />
        </div>
      ),
    },
    {
      name: "Textarea",
      render: () => (
        <div className="grid w-full max-w-2xl grid-cols-2 gap-4">
          <TextareaField label="Description" placeholder="What the mod changes" />
          <TextareaField label="Description" error="A description is required." />
        </div>
      ),
    },
  ],
};

export default entry;
