import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";

const SETTINGS_LINK = "ltk://settings?";

/** Returns the `focus` of an `ltk://settings` link, or `null` if `link` is not one. */
export function settingsFocus(link: string): string | null {
  if (!link.startsWith(SETTINGS_LINK)) return null;

  return new URLSearchParams(link.slice(SETTINGS_LINK.length)).get("focus") || null;
}

/**
 * Returns a function that opens an `ltk://` link inside the app.
 *
 * Only a settings link opens. Any other link is logged and skipped.
 */
export function useOpenDeepLink(): (link: string) => void {
  const navigate = useNavigate();

  return useCallback(
    (link: string) => {
      const focus = settingsFocus(link);
      if (focus === null) {
        console.warn("Skipping a deep link that the app does not open in place:", link);
        return;
      }

      void navigate({ to: "/settings", search: { focus } });
    },
    [navigate],
  );
}
