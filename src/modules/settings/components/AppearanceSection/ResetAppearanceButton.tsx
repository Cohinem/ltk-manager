import { ArrowCounterClockwiseIcon } from "@phosphor-icons/react";

import { Button } from "@/components";

import { useSettingReset } from "../SettingScope";

/**
 * Puts every Appearance row back to what a fresh install shows.
 *
 * It counts the rows the card's own scope collected, so the card and the groups
 * inside it can never disagree about what a default is.
 */
export function ResetAppearanceButton() {
  const { changed, reset } = useSettingReset();

  return (
    <Button
      variant="outline"
      size="sm"
      left={<ArrowCounterClockwiseIcon weight="bold" className="h-4 w-4" />}
      onClick={reset}
      disabled={changed.length === 0}
    >
      Reset to default
    </Button>
  );
}
