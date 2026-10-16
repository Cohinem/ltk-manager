/** Fields that take typing, where no run key acts. */
const EDITABLE =
  "input:not([type='range']), textarea, select, [role='textbox'], [role='searchbox'], [role='spinbutton'], [role='combobox']";

/** Controls whose keys are the arrows and Space, which the run's keys leave alone. */
const KEYED_CONTROLS =
  "[role='tab'], [role='menuitem'], [role='menuitemcheckbox'], [role='menuitemradio'], [role='option'], [role='radio']";

/** A slider, which keeps the keys that move it and passes every other key to the run. */
const SLIDER = "input[type='range'], [role='slider']";

/** The keys a slider moves by. */
const SLIDER_KEYS: ReadonlySet<string> = new Set([
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "Home",
  "End",
  "PageUp",
  "PageDown",
]);

/** A key the focused control uses, which the run leaves to it. */
export function ignoredKey(event: KeyboardEvent): boolean {
  const target = event.target;
  if (!(target instanceof Element)) return false;
  if (target.closest(EDITABLE) !== null || target.closest(KEYED_CONTROLS) !== null) return true;

  return target.closest(SLIDER) !== null && SLIDER_KEYS.has(event.key);
}
