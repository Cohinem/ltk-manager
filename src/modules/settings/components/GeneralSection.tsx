import type { ReactNode } from "react";

import { Stack } from "@/components";

import { LeagueSection } from "./LeagueSection";
import { PrivacySection } from "./PrivacySection";
import { StartupAndTraySection } from "./StartupAndTraySection";

interface GeneralSectionProps {
  /* A slot rather than an import: settings sits under migration in the module
     order, so naming it here would close a cycle. */
  migration?: ReactNode;
}

export function GeneralSection({ migration }: GeneralSectionProps) {
  return (
    <Stack gap={6}>
      <LeagueSection />
      <StartupAndTraySection />
      <PrivacySection />
      {migration}
    </Stack>
  );
}
