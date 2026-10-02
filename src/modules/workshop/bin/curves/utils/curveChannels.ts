import type { ValueFamily } from "../../values/utils/valueRows";

/** What each channel of a family is called, in the letters both of Riot's editors use. */
export const CHANNELS: Record<ValueFamily, readonly string[]> = {
  scalar: ["value"],
  vector: ["X", "Y", "Z"],
  color: ["R", "G", "B", "A"],
};

/** The hue each channel draws in, X red, Y green and Z blue as Riot draws them. DS-KIND-HUE. */
export const STROKE = [
  "text-channel-1",
  "text-channel-2",
  "text-channel-3",
  "text-channel-4",
] as const;

/** The same hues as a label, per DS-TEXT. */
export const CHIP = [
  "text-channel-1-text",
  "text-channel-2-text",
  "text-channel-3-text",
  "text-channel-4-text",
] as const;

/**
 * The hue a channel draws in: a scalar's is the float socket's, the hue its value node carries
 * in the Graph pane, and any other family's is its channel's. DS-KIND-HUE.
 */
export function strokeOf(family: ValueFamily, channel: number): string {
  if (family === "scalar") return "text-socket-float";
  return STROKE[channel] ?? STROKE[0];
}

/** `strokeOf`'s hue as a label, per DS-TEXT. */
export function chipOf(family: ValueFamily, channel: number): string {
  if (family === "scalar") return "text-socket-float-text";
  return CHIP[channel] ?? CHIP[0];
}

/** What `channel` is called on a `family`, falling back to its own index. */
export function channelName(family: ValueFamily, channel: number): string {
  return CHANNELS[family][channel] ?? String(channel);
}
