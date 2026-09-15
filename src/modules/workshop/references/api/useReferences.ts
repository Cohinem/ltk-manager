import { useQuery } from "@tanstack/react-query";

import type { ReferenceRequest } from "../../state";
import { referenceQueries } from "./queries";

export { referenceKeys } from "./queries";

/** What one question asks the index or the walk for, in the slot the index is in. */
export function useReferences(request: ReferenceRequest | null) {
  return useQuery(referenceQueries.forRequest(request));
}
