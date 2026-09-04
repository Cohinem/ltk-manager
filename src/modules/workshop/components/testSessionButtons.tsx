import { Button } from "@/components";
import { useStopPatcher } from "@/modules/patcher";

import { runningTint, testTint } from "./actionTints";

/* The two halves of a test in flight, shared by the row a project draws and the
   row the grid draws over a selection. What starts a test differs between them.
   What one looks like once it is running does not. */

/** The overlay is being built, which is the step with nothing to stop yet. */
export function BuildingTestButton() {
  return (
    <Button variant="ghost" size="sm" loading disabled className={testTint}>
      Building…
    </Button>
  );
}

/** The session in flight, and the one control that ends it. */
export function StopTestButton() {
  const stopPatcher = useStopPatcher();

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => stopPatcher.mutate()}
      loading={stopPatcher.isPending}
      left={
        !stopPatcher.isPending && (
          <span className="inline-flex h-2 w-2 rounded-full bg-success shadow-[0_0_6px_2px] shadow-success/60" />
        )
      }
      className={runningTint}
    >
      {stopPatcher.isPending ? "Stopping…" : "Stop Test"}
    </Button>
  );
}
