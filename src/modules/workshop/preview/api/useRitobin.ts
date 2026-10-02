import { useMutation, useQuery } from "@tanstack/react-query";

import { api, type AppError, type AssetRef } from "@/lib/tauri";
import { unwrapForQuery } from "@/utils/query";

import { ritobinQueries } from "./queries";

export { ritobinKeys } from "./queries";

/** Whether VS Code will open a `.bin` as ritobin text. */
export function useRitobinIntegration() {
  return useQuery(ritobinQueries.integration());
}

interface OpenInRitobinArgs {
  asset: AssetRef;
  /** The file name, which a game chunk's reference holds only a hash for. */
  name?: string;
}

/**
 * Open one asset as ritobin text in VS Code.
 *
 * Nothing lands in this window, so a failure has nowhere to show but a toast.
 * The message names the remedy, which is a command inside VS Code.
 */
export function useOpenInRitobin() {
  return useMutation<null, AppError, OpenInRitobinArgs>({
    meta: { errorTitle: "Couldn't open in VS Code" },
    mutationFn: async ({ asset, name }) =>
      unwrapForQuery(await api.openAssetInRitobin(asset, name)),
  });
}
