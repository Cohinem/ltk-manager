import { createContext } from "react";

/**
 * An arranged table's handler for a press on a row's checkbox.
 *
 * Held in context rather than passed through every cell, since only the
 * checkbox cell reads it.
 */
export const PickContext = createContext<
  (event: React.PointerEvent, rowKey: string, id: string, selected: boolean) => void
>(() => {});
