import { useState } from "react";

import { Combobox, useComboboxFilter } from "./Combobox";
import type { GalleryEntry } from "./galleryEntry";
import { MultiSelect } from "./MultiSelect";

const CHAMPIONS = ["Aatrox", "Ahri", "Akali", "Alistar", "Amumu", "Anivia", "Annie", "Aphelios"];

const TAGS = [
  { value: "vfx", label: "VFX" },
  { value: "sfx", label: "SFX" },
  { value: "model", label: "Model" },
  { value: "ui", label: "Interface" },
  { value: "map", label: "Map", disabled: true },
];

function ChampionCombobox() {
  const filter = useComboboxFilter();

  return (
    <div className="w-64">
      <Combobox.Root items={CHAMPIONS} defaultValue="Ahri" filter={filter.contains}>
        <Combobox.Input aria-label="Champion" placeholder="Champion" />
        <Combobox.Content>
          <Combobox.List>
            {(champion: string) => (
              <Combobox.Item key={champion} value={champion}>
                {champion}
              </Combobox.Item>
            )}
          </Combobox.List>
          <Combobox.Empty />
        </Combobox.Content>
      </Combobox.Root>
    </div>
  );
}

function Tags({ variant }: { variant: "compact" | "field" }) {
  const [selected, setSelected] = useState(new Set(["vfx", "model"]));

  return (
    <div className="w-64">
      <MultiSelect
        variant={variant}
        label="Tags"
        placeholder="Find a tag"
        options={TAGS}
        selected={selected}
        onChange={setSelected}
      />
    </div>
  );
}

const entry: GalleryEntry = {
  name: "Combobox",
  family: "floating",
  cases: [
    { name: "Filtering a list", render: () => <ChampionCombobox /> },
    { name: "MultiSelect, compact", render: () => <Tags variant="compact" /> },
    { name: "MultiSelect, as a field", render: () => <Tags variant="field" /> },
  ],
};

export default entry;
