import { ExternalLink } from "./ExternalLink";
import type { GalleryEntry } from "./galleryEntry";
import { HintIcon } from "./HintIcon";

const entry: GalleryEntry = {
  name: "HintIcon",
  family: "feedback",
  cases: [
    {
      name: "Variants",
      render: () => (
        <>
          <HintIcon content="Archives get verified on demand when mounting." />
          <HintIcon variant="warning" content="Turning this off skips the check." />
        </>
      ),
    },
    {
      name: "ExternalLink",
      render: () => (
        <>
          <ExternalLink href="https://leaguetoolkit.dev">The wiki</ExternalLink>
          <ExternalLink href="https://leaguetoolkit.dev" hideIcon>
            No icon
          </ExternalLink>
        </>
      ),
    },
  ],
};

export default entry;
