import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import type { Champion } from "@/lib/tauri";
import { useSettings } from "@/modules/settings";

import { type ChampionRoster, championRoster } from "../utils/roster";
import { championQueries } from "./queries";

const NO_CHAMPIONS: Champion[] = [];

/**
 * The configured install's champions, read once per session. Empty until they arrive and where
 * no install is configured, so every value then names no champion.
 */
export function useChampionRoster(): ChampionRoster {
  const { data: settings } = useSettings();
  const { data } = useQuery(championQueries.roster(settings?.leaguePath));
  const champions = data ?? NO_CHAMPIONS;

  return useMemo(() => championRoster(champions), [champions]);
}
