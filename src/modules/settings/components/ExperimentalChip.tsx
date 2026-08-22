/** Marks a setting whose behaviour is not settled yet. */
export function ExperimentalChip() {
  return (
    <span className="rounded-sm border border-warning/30 bg-warning/10 px-1.5 py-0.5 text-[0.625rem] font-medium tracking-wide text-warning-text uppercase">
      Experimental
    </span>
  );
}
