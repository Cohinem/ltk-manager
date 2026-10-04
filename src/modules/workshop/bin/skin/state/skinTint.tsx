import { createContext, type ReactNode, useMemo, useState } from "react";

import type { ChainParameter } from "@/modules/viewport";

/** One chain parameter of one group, which the overlay tints by. */
export interface TintedParameter {
  /** The hash path of the `DynamicsJointTreeGroupData`. */
  readonly group: string;
  readonly parameter: ChainParameter;
}

/** The chain parameter the overlay tints the simulated joints by, and null for none. */
export interface SkinTint {
  readonly tinted: TintedParameter | null;
  readonly setTinted: (tinted: TintedParameter | null) => void;
}

/** The tint of one skin's editor, and null outside one. */
export const SkinTintContext = createContext<SkinTint | null>(null);

/**
 * Holds the tint of the skin editor under it.
 *
 * A pointer crossing a parameter row sets the tint, so it is held apart from
 * `SkinChoiceContext`, where only the row and the overlay read it.
 */
export function SkinTintScope({ children }: { children: ReactNode }) {
  const [tinted, setTinted] = useState<TintedParameter | null>(null);
  const tint = useMemo(() => ({ tinted, setTinted }), [tinted]);

  return <SkinTintContext value={tint}>{children}</SkinTintContext>;
}
