import { type DependencyList, useEffect, useMemo } from "react";

/** Anything with a `dispose`, which three.js geometries, materials and helpers all have. */
interface Disposable {
  dispose(): void;
}

/**
 * A value `create` makes per change of `deps`, disposed once it is replaced or the component
 * unmounts.
 */
export function useDisposable<T extends Disposable | null>(
  create: () => T,
  deps: DependencyList,
): T {
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `deps` are the caller's, for `create`
  const value = useMemo(create, deps);

  useEffect(() => () => value?.dispose(), [value]);

  return value;
}
