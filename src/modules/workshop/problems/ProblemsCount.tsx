import { SeverityTally } from "@/components";

import { countBySeverity } from "./problemGroups";
import { useShownProblems } from "./runCatalogue";

/**
 * What the list below holds, beside the actions that act on it.
 *
 * A severity with nothing in it draws nothing, because a counter that is always
 * there and always says zero is a counter a user stops reading. This counts
 * what is on screen, forward-looking rows included - the question a reader is
 * asking here is what is in the list, and the project bar is where the count
 * of what the mod owes today lives.
 */
export function ProblemsCount() {
  return <SeverityTally counts={countBySeverity(useShownProblems())} />;
}
