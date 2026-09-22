import { createContext } from "react";

/** A surface's property names, leaving the source names intact for inspection and copying. */
export const FieldLabelsContext = createContext<
  ((hash: string, name: string) => string | undefined) | null
>(null);
