/** The keys the canvas runs the preview toolbar's actions on, which its tooltips name. */
export const PREVIEW_KEYS = {
  transform: "V",
  interact: "I",
  safeZone: "Z",
  showDisabled: "H",
  effects: "E",
  samples: "S",
  stackScenes: "L",
  buttonState: "B",
  play: "P",
} as const;

/** What the preview keys act on. */
export interface PreviewKeyActions {
  readonly chooseTransform: () => void;
  readonly toggleInteract: () => void;
  readonly toggleSafeZone: () => void;
  readonly toggleShowDisabled: () => void;
  readonly toggleEffects: () => void;
  readonly toggleSamples: () => void;
  readonly toggleStackScenes: () => void;
  readonly cycleButtonState: () => void;
  readonly togglePlaying: () => void;
}

/** Run the preview's action for `key`, and answer whether it had one. */
export function previewKey(key: string, actions: PreviewKeyActions): boolean {
  switch (key.toUpperCase()) {
    case PREVIEW_KEYS.transform:
      actions.chooseTransform();
      return true;
    case PREVIEW_KEYS.interact:
      actions.toggleInteract();
      return true;
    case PREVIEW_KEYS.safeZone:
      actions.toggleSafeZone();
      return true;
    case PREVIEW_KEYS.showDisabled:
      actions.toggleShowDisabled();
      return true;
    case PREVIEW_KEYS.effects:
      actions.toggleEffects();
      return true;
    case PREVIEW_KEYS.samples:
      actions.toggleSamples();
      return true;
    case PREVIEW_KEYS.stackScenes:
      actions.toggleStackScenes();
      return true;
    case PREVIEW_KEYS.buttonState:
      actions.cycleButtonState();
      return true;
    case PREVIEW_KEYS.play:
      actions.togglePlaying();
      return true;
    default:
      return false;
  }
}
