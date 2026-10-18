/** The track group that React's component and scheduler entries end their names with. */
const REACT_TRACK = "⚛";

/**
 * Drops the performance track entries that a development build of React logs for every render,
 * unless `VITE_REACT_PERFORMANCE_TRACKS` is `1`. Every other timing call passes through.
 *
 * A map scene commits thousands of components at once, and this logging held one load's commit
 * for about 14 seconds in WebView2.
 */
export function quietReactPerformanceTracks(): void {
  if (!import.meta.env.DEV || import.meta.env.VITE_REACT_PERFORMANCE_TRACKS === "1") return;

  const timeStamp = console.timeStamp.bind(console);
  console.timeStamp = (...args: unknown[]) => {
    const tracks = [args[3], args[4]];
    if (tracks.some((track) => typeof track === "string" && track.endsWith(REACT_TRACK))) return;
    (timeStamp as (...rest: unknown[]) => void)(...args);
  };

  const measure = performance.measure.bind(performance);
  performance.measure = ((name: string, options?: string | PerformanceMeasureOptions) => {
    const detail = typeof options === "object" ? (options.detail as { devtools?: unknown }) : null;
    if (detail?.devtools !== undefined) return undefined;
    return measure(name, options);
  }) as typeof performance.measure;
}
