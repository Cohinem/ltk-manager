import { queryOptions, useQuery } from "@tanstack/react-query";

import { fetchCdChampion } from "./cdragon";
import { fetchChampionDetail, fetchChampionList, fetchLatestVersion } from "./ddragon";

export const nativeKeys = {
  version: () => ["native", "version"] as const,
  champions: (version: string) => ["native", "champions", version] as const,
  championDetail: (version: string, champId: string) =>
    ["native", "champion", version, champId] as const,
  cdChampion: (championId: string) => ["native", "cdragon-champion", championId] as const,
};

export const nativeVersionOptions = () =>
  queryOptions({
    queryKey: nativeKeys.version(),
    queryFn: fetchLatestVersion,
    staleTime: 1000 * 60 * 60,
  });

export const championListOptions = (version: string | undefined) =>
  queryOptions({
    queryKey: version
      ? nativeKeys.champions(version)
      : (["native", "champions", "pending"] as const),
    queryFn: () => fetchChampionList(version!),
    enabled: !!version,
    staleTime: 1000 * 60 * 30,
  });

export const championDetailOptions = (version: string | undefined, champId: string | null) =>
  queryOptions({
    queryKey:
      version && champId
        ? nativeKeys.championDetail(version, champId)
        : (["native", "champion", "pending", champId] as const),
    queryFn: () => fetchChampionDetail(version!, champId!),
    enabled: !!version && !!champId,
    staleTime: 1000 * 60 * 30,
  });

export const cdChampionOptions = (championId: string | null) =>
  queryOptions({
    queryKey: championId
      ? nativeKeys.cdChampion(championId)
      : (["native", "cdragon-champion", "pending"] as const),
    queryFn: () => fetchCdChampion(championId!),
    enabled: !!championId,
    staleTime: 1000 * 60 * 30,
  });

export function useNativeVersion() {
  return useQuery(nativeVersionOptions());
}

export function useChampionList(version: string | undefined) {
  return useQuery(championListOptions(version));
}

export function useChampionDetail(version: string | undefined, champId: string | null) {
  return useQuery(championDetailOptions(version, champId));
}

export function useCdChampion(championId: string | null) {
  return useQuery(cdChampionOptions(championId));
}
