import type { GalleryEntry } from "./galleryEntry";
import { Select, SelectField } from "./Select";

const OPTIONS = [
  { value: "modpkg", label: ".modpkg" },
  { value: "fantome", label: ".fantome" },
  { value: "zip", label: ".zip", disabled: true },
];

const entry: GalleryEntry = {
  name: "Select",
  family: "fields",
  cases: [
    {
      name: "Field",
      render: () => (
        <div className="grid w-full max-w-2xl grid-cols-2 gap-4">
          <SelectField label="Format" options={OPTIONS} defaultValue="modpkg" />
          <SelectField
            label="Format"
            description="The archive a build writes."
            options={OPTIONS}
            defaultValue="fantome"
          />
          <SelectField label="Format" error="Choose a format." options={OPTIONS} />
          <SelectField label="Format" disabled options={OPTIONS} defaultValue="modpkg" />
        </div>
      ),
    },
    {
      name: "Groups and descriptions",
      render: () => (
        <div className="w-64">
          <Select.Root defaultValue="smooth">
            <Select.Trigger aria-label="Scrolling">
              <Select.Value prefix="Scroll" />
              <Select.Icon />
            </Select.Trigger>
            <Select.Content>
              <Select.Group>
                <Select.GroupLabel>Eased</Select.GroupLabel>
                <Select.Item value="smooth" description="Eases a scroll the app asks for">
                  smooth
                </Select.Item>
                <Select.Item value="spring" description="Adds an overscroll bounce">
                  spring
                </Select.Item>
              </Select.Group>
              <Select.Separator />
              <Select.Item value="instant" disabled>
                instant
              </Select.Item>
            </Select.Content>
          </Select.Root>
        </div>
      ),
    },
  ],
};

export default entry;
