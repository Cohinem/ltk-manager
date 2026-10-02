import { twMerge } from "@/utils";

/* DS-KIND-HUE: X red, Y green, Z blue and W as Riot draws them, and R, G, B, A the same. */
const SASH_FILL = ["bg-channel-1", "bg-channel-2", "bg-channel-3", "bg-channel-4"] as const;

/**
 * The bar down the left edge of a component field that names its channel by hue alone.
 *
 * It stands in for the channel's letter, so the field it heads carries the letter as its
 * accessible name. A channel past the fourth draws a neutral bar.
 */
export function ChannelSash({ channel, className }: { channel: number; className?: string }) {
  return (
    <span
      aria-hidden
      data-ui="ChannelSash"
      className={twMerge(
        "w-0.75 shrink-0 self-stretch",
        SASH_FILL[channel] ?? "bg-surface-500",
        className,
      )}
    />
  );
}
