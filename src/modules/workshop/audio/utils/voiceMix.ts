/**
 * The values that one voice plays with: the properties along its path in the play tree, summed.
 *
 * Wwise adds the relative properties of an object to those of every object above it. Per
 * "Playback of properties" in docs/ux/AUDIO.md.
 */

import type { NodeProperty, ObjectProperties } from "@/lib/tauri";

import { PROPERTY_DEFAULTS } from "./bankEdits";

/** The objects whose properties a voice sums. */
export interface MixPath {
  /** The sound first, then each container above it, the outermost last. */
  readonly nodes: readonly number[];
  /**
   * The Play action and its delay in seconds as the tree reads it, or null for a press on a node,
   * which waits on no action.
   */
  readonly action: { readonly id: number; readonly delay: number } | null;
}

/** The path of a media that plays as its file holds it: no object, so no property applies. */
export const PLAIN_PATH: MixPath = { nodes: [], action: null };

/** The summed values of one voice. */
export interface VoiceMix {
  /** `Volume` plus `MakeUpGain` of every level, in dB. */
  readonly gain: number;
  /** `Pitch` of every level, in cents. */
  readonly pitch: number;
  /** `LPF` of every level, clamped to 0-100. */
  readonly lpf: number;
  /** `HPF` of every level, clamped to 0-100. */
  readonly hpf: number;
  /** `InitialDelay` of every node plus the `DelayTime` of the Play action, in seconds. */
  readonly delay: number;
  /** `Loop` of the sound: the number of plays, where 0 loops forever. */
  readonly loopCount: number;
}

/** The mix of a media that plays as its file holds it. */
export const NEUTRAL_MIX: VoiceMix = {
  gain: 0,
  pitch: 0,
  lpf: 0,
  hpf: 0,
  delay: 0,
  loopCount: PROPERTY_DEFAULTS.loopCount,
};

/** The highest value of `LPF` and `HPF`. */
const FILTER_MAX = 100;

/**
 * Returns the mix of the voice at `path`, from the properties of its objects.
 *
 * The gains, the pitch, the filters and the delays of the sound, its containers and the Play
 * action add. The filters clamp to 0-100 and the delay to 0 or more. The loop count is the
 * sound's own. A property without a value reads as its default.
 */
export function voiceMix(
  path: MixPath,
  properties: ReadonlyMap<number, ObjectProperties>,
): VoiceMix {
  const value = (object: number, property: NodeProperty): number | null => {
    const found = properties.get(object)?.values.find((each) => each.property === property);
    if (found === undefined) return null;

    return found.value ?? PROPERTY_DEFAULTS[property];
  };
  const sum = (property: NodeProperty) =>
    path.nodes.reduce((total, node) => total + (value(node, property) ?? 0), 0);

  const { action } = path;
  const actionDelay = action === null ? 0 : (value(action.id, "delay") ?? action.delay);
  const [sound] = path.nodes;

  return {
    gain: sum("volume") + sum("makeUpGain"),
    pitch: sum("pitch"),
    lpf: clamp(sum("lpf"), 0, FILTER_MAX),
    hpf: clamp(sum("hpf"), 0, FILTER_MAX),
    delay: Math.max(0, sum("delay") + actionDelay),
    loopCount:
      (sound === undefined ? null : value(sound, "loopCount")) ?? PROPERTY_DEFAULTS.loopCount,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** A value that a knob holds while it turns, before its edit lands. */
export interface MixDraft {
  readonly object: number;
  readonly property: NodeProperty;
  readonly value: number;
}

/**
 * Returns `properties` with the value of each of `drafts` in place of the value it holds.
 *
 * A drafted property that the object does not hold is added. Returns `properties` itself if
 * `drafts` is empty.
 */
export function withDrafts(
  properties: ReadonlyMap<number, ObjectProperties>,
  drafts: readonly MixDraft[],
): ReadonlyMap<number, ObjectProperties> {
  if (drafts.length === 0) return properties;

  const drafted = new Map(properties);
  for (const { object, property, value } of drafts) {
    const held = drafted.get(object) ?? { id: object, editable: false, values: [], weights: null };
    const values = held.values.filter((each) => each.property !== property);
    drafted.set(object, { ...held, values: [...values, { property, value }] });
  }

  return drafted;
}
