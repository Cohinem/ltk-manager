import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";

import { api, type AppError, type Profile } from "@/lib/tauri";
import { unwrapForQuery } from "@/utils/query";

import { libraryKeys } from "./keys";

/**
 * Hook to switch to a different profile.
 */
export function useSwitchProfile() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  return useMutation<Profile, AppError, string>({
    mutationFn: async (profileId) => {
      const result = await api.switchModProfile(profileId);
      return unwrapForQuery(result);
    },
    onSuccess: () => {
      navigate({ to: "/mods" });
      queryClient.invalidateQueries({ queryKey: libraryKeys.activeProfile() });
      queryClient.invalidateQueries({ queryKey: libraryKeys.mods() });
    },
  });
}
