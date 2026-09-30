/**
 * The moment a controller's preview draws: the scenes its controller switches on and off over
 * what the file says, by the scene's name. A view whose controller has none rests as its file
 * says.
 */
export interface ControllerMoment {
  readonly show: readonly string[];
  readonly hide: readonly string[];
}

const NO_MOMENT: ControllerMoment = { show: [], hide: [] };

/** Per "A preview that looks like the game" in docs/plans/atlas-ui-editor.md, by class name. */
const MOMENTS: ReadonlyMap<string, ControllerMoment> = new Map([
  /* No skill point to spend. */
  ["PlayerFrameViewController", { show: [], hide: ["LevelUp", "LevelUpFxIn", "LevelUpFxOut"] }],
  /* Tab held. */
  ["ScoreboardViewController", { show: ["Scoreboard"], hide: [] }],
  ["ItemShopViewController", { show: ["ItemShop"], hide: [] }],
  /* A unit selected. */
  ["TargetFrameViewController", { show: ["TargetFrame"], hide: ["TargetFrameClosed"] }],
  [
    "EndOfGameViewController",
    {
      show: ["EndOfGameMainScene"],
      hide: [
        "ConnectionErrorBGScene",
        "ConnectionErrorScene",
        "IGNBBGScene",
        "IGNBScene",
        "VanguardBGScene",
        "VanguardScene",
      ],
    },
  ],
  ["LoadingScreenPlayerCardsViewController", { show: ["LoadingScreen_PlayerCard"], hide: [] }],
]);

/** The moment the controller class `name` draws in. */
export function momentOf(name: string): ControllerMoment {
  return MOMENTS.get(name) ?? NO_MOMENT;
}
