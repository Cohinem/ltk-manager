import { createContext, useContext } from "react";

import { NO_NAMES, type NodeNames } from "../utils/nodeNames";

/** The derived names of the bank set that the Events view of a document shows. */
export const NodeNamesContext = createContext<NodeNames>(NO_NAMES);

/** Returns the derived names of the bank set of the enclosing Events view. */
export function useNodeNames(): NodeNames {
  return useContext(NodeNamesContext);
}
