/**
 * Removes `console.timeStamp` in a development build, unless `VITE_REACT_PERFORMANCE_TRACKS` is
 * `1`, so React logs no performance tracks.
 *
 * React checks for `console.timeStamp` once, when its module loads, so `beforeReact.ts` calls this
 * before React loads. The logging walks the props of every component that a commit touches, and it
 * held a map scene's first commit for seconds in WebView2.
 */
export function quietReactPerformanceTracks(): void {
  if (!import.meta.env.DEV || import.meta.env.VITE_REACT_PERFORMANCE_TRACKS === "1") return;

  (console as { timeStamp?: unknown }).timeStamp = undefined;
}
