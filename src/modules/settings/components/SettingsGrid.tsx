import { type ReactNode } from "react";

import { Grid } from "@/components";

interface SettingsGridProps {
  children: ReactNode;
}

/** A tab's section cards, in two columns once there is room. */
export function SettingsGrid({ children }: SettingsGridProps) {
  return (
    <Grid columns={2} collapseBelow="lg" align="start" gap={6}>
      {children}
    </Grid>
  );
}
