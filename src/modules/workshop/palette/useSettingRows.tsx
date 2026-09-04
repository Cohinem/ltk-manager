import { GearSixIcon } from "@phosphor-icons/react";
import { useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";

import { settingFocusTab, SETTINGS_INDEX, SETTINGS_TAB_LABELS } from "@/modules/settings";

import { buildCandidate } from "./candidate";
import type { PaletteCandidate } from "./types";

const GLYPH = "h-4 w-4";

/**
 * Every setting the bar can open, as rows of a source that waits for a term.
 *
 * `settings` is not one of the sources a resting box lists, so forty-five rows
 * never crowd out the handful of commands someone opened the bar to read. The
 * id is a keyword rather than the name, because it is what a reader who already
 * knows the setting would type, and it is not on screen to mark.
 */
export function useSettingRows(): readonly PaletteCandidate[] {
  const navigate = useNavigate();

  return useMemo(
    () =>
      SETTINGS_INDEX.map((entry) =>
        buildCandidate({
          id: `setting:${entry.id}`,
          source: "settings",
          name: entry.title,
          path: SETTINGS_TAB_LABELS[settingFocusTab(entry.id)],
          keywords: entry.id.toLowerCase(),
          icon: <GearSixIcon className={GLYPH} />,
          target: {
            kind: "command",
            command: {
              id: entry.id,
              title: entry.title,
              group: "Settings",
              run: () => void navigate({ to: "/settings", search: { focus: entry.id } }),
            },
          },
        }),
      ),
    [navigate],
  );
}
