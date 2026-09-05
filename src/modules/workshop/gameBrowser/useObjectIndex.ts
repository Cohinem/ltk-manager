import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import { api, type AppError } from "@/lib/tauri";
import { useSearchObjects } from "@/stores";
import { mutationFn } from "@/utils/query";

import { gameKeys } from "./useGameWads";

/**
 * One step of the index's lifecycle, after which every held object search is
 * asked again so a row that read "building" is replaced.
 */
function useObjectIndexStep(step: () => Promise<Awaited<ReturnType<typeof api.warmObjectIndex>>>) {
  const queryClient = useQueryClient();

  return useMutation<void, AppError, void>({
    mutationFn: mutationFn(step),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: gameKeys.objectSearches });
    },
  });
}

/** Build the object index, unless one is built or building. */
export function useWarmObjectIndex() {
  return useObjectIndexStep(api.warmObjectIndex);
}

/** Drop the object index, so the bar stops answering for objects. */
export function useDropObjectIndex() {
  return useObjectIndexStep(api.dropObjectIndex);
}

/**
 * Keep the object index in step with the Objects switch.
 *
 * Mounted once at the root: the index warms at startup while the switch is
 * on, warms when the switch is turned on, and drops when it is turned off. A
 * warm of an index that is built or building does nothing.
 */
export function useObjectIndexLifecycle() {
  const searchObjects = useSearchObjects();
  const warm = useWarmObjectIndex();
  const drop = useDropObjectIndex();
  const warmMutate = warm.mutate;
  const dropMutate = drop.mutate;

  /* Off at startup is nothing to drop, so the first run with the switch off
     is told apart from a turn-off. */
  const was = useRef<boolean | null>(null);
  useEffect(() => {
    const before = was.current;
    was.current = searchObjects;
    if (searchObjects) warmMutate();
    else if (before === true) dropMutate();
  }, [dropMutate, searchObjects, warmMutate]);
}
