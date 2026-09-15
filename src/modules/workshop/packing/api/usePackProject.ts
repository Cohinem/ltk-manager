import { useMutation } from "@tanstack/react-query";

import { packMutations } from "./mutations";

/** Pack a workshop project to `.modpkg` or `.fantome`. */
export function usePackProject() {
  return useMutation(packMutations.pack());
}
