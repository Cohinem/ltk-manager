import type { ReactNode } from "react";

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
    <div className="flex flex-col gap-6">
      <LeagueSection />
      <StartupAndTraySection />
      <PrivacySection />
      {migration}
    </div>
  );
}
