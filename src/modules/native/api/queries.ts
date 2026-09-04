import { useQuery } from "@tanstack/react-query";

import { type CdChampion, fetchCdChampion } from "./cdragon";
import {
  type DdChampionDetail,
  type DdChampionSummary,
  fetchChampionDetail,
  fetchChampionList,
  fetchLatestVersion,
} from "./ddragon";

export const nativeKeys = {
  version: () => ["native", "version"] as const,
  champions: (version: string) => ["native", "champions", version] as const,
  championDetail: (version: string, champId: string) =>
    ["native", "champion", version, champId] as const,
  cdChampion: (championId: string) => ["native", "cdragon-champion", championId] as const,
};

export function useNativeVersion() {
  return useQuery<string>({
    queryKey: nativeKeys.version(),
    queryFn: fetchLatestVersion,
    staleTime: 1000 * 60 * 60,
  });
}

export function useChampionList(version: string | undefined) {
  return useQuery<Record<string, DdChampionSummary>>({
    queryKey: version
      ? nativeKeys.champions(version)
      : (["native", "champions", "pending"] as const),
    queryFn: () => fetchChampionList(version!),
    enabled: !!version,
    staleTime: 1000 * 60 * 30,
  });
}

export function useChampionDetail(version: string | undefined, champId: string | null) {
  return useQuery<DdChampionDetail>({
    queryKey:
      version && champId
        ? nativeKeys.championDetail(version, champId)
        : (["native", "champion", "pending", champId] as const),
    queryFn: () => fetchChampionDetail(version!, champId!),
    enabled: !!version && !!champId,
    staleTime: 1000 * 60 * 30,
  });
}

export function useCdChampion(championId: string | null) {
  return useQuery<CdChampion>({
    queryKey: championId
      ? nativeKeys.cdChampion(championId)
      : (["native", "cdragon-champion", "pending"] as const),
    queryFn: () => fetchCdChampion(championId!),
    enabled: !!championId,
    staleTime: 1000 * 60 * 30,
  });
}
