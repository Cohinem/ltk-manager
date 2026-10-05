import { AutoPill } from "./AutoPill";
import { type CategoryTone, Chip } from "./Chip";
import type { GalleryEntry } from "./galleryEntry";

const TONES: CategoryTone[] = ["tag", "champion", "map"];

const entry: GalleryEntry = {
  name: "Chip",
  family: "feedback",
  cases: [
    {
      name: "Tones, sm",
      render: () =>
        TONES.map((tone) => (
          <Chip key={tone} tone={tone}>
            {tone}
          </Chip>
        )),
    },
    {
      name: "Tones, md",
      render: () =>
        TONES.map((tone) => (
          <Chip key={tone} tone={tone} size="md">
            {tone}
          </Chip>
        )),
    },
    {
      name: "Removable",
      render: () => (
        <>
          <Chip onRemove={() => {}}>vfx</Chip>
          <Chip size="md" tone="champion" onRemove={() => {}}>
            Fiora
          </Chip>
        </>
      ),
    },
    {
      name: "AutoPill",
      render: () => (
        <>
          {TONES.map((tone) => (
            <AutoPill key={tone} tone={tone} label={tone} />
          ))}
          <AutoPill tone="champion" label="Suggested" onClick={() => {}} />
        </>
      ),
    },
  ],
};

export default entry;
