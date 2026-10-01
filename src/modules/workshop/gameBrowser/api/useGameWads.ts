import { useQuery } from "@tanstack/react-query";

import { useWadSource } from "../state/wadSource";
import { gameQueries } from "./queries";

/** Every WAD archive of the enclosing browser's source. Errors when no League path is set. */
export function useGameWads() {
  return useQuery(gameQueries.wads(useWadSource()));
}
