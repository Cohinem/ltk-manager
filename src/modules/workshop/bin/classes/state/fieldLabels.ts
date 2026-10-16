import { createContext } from "react";

/** A surface's property names, leaving the source names intact for inspection and copying. */
export const FieldLabelsContext = createContext<
  ((hash: string, name: string) => string | undefined) | null
>(null);

/** `false` inside a host that draws each row on one line, which has no room for `RandomFields`. */
export const RandomFieldsContext = createContext(true);
