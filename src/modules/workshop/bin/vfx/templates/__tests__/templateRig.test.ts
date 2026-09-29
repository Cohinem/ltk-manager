import { describe, expect, it } from "vitest";

import { FLIGHT_HEIGHT } from "../../engine/model/rig";
import { templateRig } from "../templateRig";

describe("templateRig", () => {
  it("stands a ground template on the ground, playing as it was tuned", () => {
    const rig = templateRig({ carrier: "ground", playback: "continuous", speed: null });

    expect(rig.motion.kind).toBe("still");
    expect(rig.height).toBe(0);
    expect(rig.life).toBe("continuous");
  });

  it("flies a flight template at the speed it was tuned on", () => {
    const rig = templateRig({ carrier: "flight", playback: "replay", speed: 1200 });

    expect(rig.motion).toMatchObject({ kind: "path", speed: 1200 });
    expect(rig.height).toBe(FLIGHT_HEIGHT);
    expect(rig.life).toBe("loop");
  });
});
