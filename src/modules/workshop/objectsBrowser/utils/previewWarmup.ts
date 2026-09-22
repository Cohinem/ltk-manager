const SAMPLE_STEPS = 24;
const STEP_SECONDS = 1 / 30;
const STEPS_PER_FRAME = 8;
const FRAME_BUDGET_MS = 2;

/** A 0.8-second particle sample advanced in bounded batches, independent of display frame rate. */
export function createPreviewWarmup(
  advance: (seconds: number) => void,
  now = () => performance.now(),
  hasContent?: () => boolean,
) {
  let remaining = SAMPLE_STEPS;

  return {
    get ready() {
      return remaining === 0;
    },
    run() {
      const start = now();
      let steps = 0;

      while (remaining > 0 && steps < STEPS_PER_FRAME) {
        advance(STEP_SECONDS);
        remaining -= 1;
        steps += 1;

        if (hasContent?.()) {
          remaining = 0;
          break;
        }

        if (now() - start >= FRAME_BUDGET_MS) {
          break;
        }
      }
    },
  };
}
