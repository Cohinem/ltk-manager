import { m } from "@/i18n";
import { useActiveProfile, useInstalledMods } from "@/modules/library";

/** What the library amounts to on Home: whose profile is active, and how much of it is on. */
export interface LibraryFacts {
  /** `null` until the profile has loaded. */
  profileName: string | null;
  enabled: number;
  total: number;
  /** `{enabled} of {total} enabled`, as every surface on Home says it. */
  enabledLabel: string;
}

export function useLibraryFacts(): LibraryFacts {
  const { data: profile } = useActiveProfile();
  const { data: mods = [] } = useInstalledMods();

  const enabled = mods.filter((mod) => mod.enabled).length;
  const total = mods.length;

  return {
    profileName: profile?.name ?? null,
    enabled,
    total,
    enabledLabel: m.home_library_enabled_count_label({ enabled, total }),
  };
}
