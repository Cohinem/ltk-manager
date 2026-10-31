import { Stack } from "@/components";
import { RuneforgeSection } from "@/modules/runeforge";

import { AuthorProfilesSection } from "./AuthorProfilesSection";
import { ProjectEditorSection } from "./ProjectEditorSection";
import { WorkshopPathSection } from "./WorkshopPathSection";

export function WorkshopSection() {
  return (
    <Stack gap={6}>
      <WorkshopPathSection />
      <ProjectEditorSection />
      <AuthorProfilesSection />
      <RuneforgeSection />
    </Stack>
  );
}
