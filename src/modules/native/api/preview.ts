type PreviewMod = {
  id: string;
  name: string;
  displayName: string;
};

/**
 * Preview stand-in: hand back a sample mod so the Native page flow completes.
 * The browser mock's sample mods only approximate `InstalledMod`, so the base
 * stays generic rather than pretending to the real binding's shape.
 */
export function leagueSkinPreviewMod<B extends PreviewMod>(
  championId: number,
  skinId: number,
  base: B,
): B {
  return {
    ...base,
    id: `preview-league-skin-${championId}-${skinId}`,
    name: `league-skin-${championId}-${skinId}`,
    displayName: `LeagueSkin ${championId}/${skinId} (preview)`,
  };
}
