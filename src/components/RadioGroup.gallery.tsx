import type { GalleryEntry } from "./galleryEntry";
import { RadioGroup } from "./RadioGroup";

const entry: GalleryEntry = {
  name: "RadioGroup",
  family: "fields",
  cases: [
    {
      name: "Cards",
      render: () => (
        <RadioGroup.Root defaultValue="modpkg" className="w-full max-w-xl">
          <RadioGroup.Label>Output format</RadioGroup.Label>
          <RadioGroup.Options>
            <RadioGroup.Card value="modpkg" title=".modpkg" description="Layers and metadata" />
            <RadioGroup.Card value="fantome" title=".fantome" description="Legacy format" />
            <RadioGroup.Card value="zip" title=".zip" description="Unavailable" disabled />
          </RadioGroup.Options>
        </RadioGroup.Root>
      ),
    },
    {
      name: "Items",
      render: () => (
        <RadioGroup.Root defaultValue="system">
          <RadioGroup.Options orientation="vertical">
            <RadioGroup.Item value="system" label="System" description="Follows the OS" />
            <RadioGroup.Item value="dark" label="Dark" />
            <RadioGroup.Item value="light" label="Light" disabled />
          </RadioGroup.Options>
        </RadioGroup.Root>
      ),
    },
  ],
};

export default entry;
