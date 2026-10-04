import { describe, expect, it } from "vitest";

import { advanceLock, applyLockInto, buildLock, endLock, type LockCue, startLock } from "../lock";
import { axisAngleInto, yawOf } from "../math";
import { createRoot, LOCAL_FLOATS } from "../world";

const DT = 0.1;
const UP = [0, 1, 0];

function cue(over: Partial<LockCue> = {}): LockCue {
  return { at: 0, until: null, joint: 0, blendOut: 0.2, ...over };
}

/** One joint with no turn of its own, as `LOCAL_FLOATS` floats. */
function still(): Float32Array {
  const locals = new Float32Array(LOCAL_FLOATS);
  locals[6] = 1;
  return locals;
}

/** How far the joint is turned about the up axis, in degrees. */
function yaw(locals: Float32Array): number {
  return (yawOf(locals.subarray(3, 7)) * 180) / Math.PI;
}

/** The unit turned `degrees` about the up axis. */
function turned(degrees: number) {
  const root = createRoot();
  axisAngleInto(root.rotation, 0, UP, 0, (degrees * Math.PI) / 180);
  return root;
}

describe("applyLockInto", () => {
  it("turns nothing before an event starts", () => {
    const rig = buildLock(cue());
    const locals = still();
    applyLockInto(rig, turned(40), DT, locals);
    expect(yaw(locals)).toBeCloseTo(0);
  });

  it("turns nothing on the step it takes hold, and holds the facing after", () => {
    const rig = buildLock(cue());
    startLock(rig);

    const first = still();
    applyLockInto(rig, turned(40), DT, first);
    expect(yaw(first)).toBeCloseTo(0);

    const second = still();
    applyLockInto(rig, turned(70), DT, second);
    expect(yaw(second)).toBeCloseTo(-30);
  });

  it("eases out in a line once the event ends, and lets go past the blend-out time", () => {
    const rig = buildLock(cue({ blendOut: 0.2 }));
    startLock(rig);
    applyLockInto(rig, turned(0), DT, still());

    endLock(rig);
    const atEnd = still();
    applyLockInto(rig, turned(40), DT, atEnd);
    expect(yaw(atEnd)).toBeCloseTo(-40);

    const half = still();
    applyLockInto(rig, turned(40), DT, half);
    expect(yaw(half)).toBeCloseTo(-20);

    applyLockInto(rig, turned(40), DT, still());
    const gone = still();
    applyLockInto(rig, turned(40), DT, gone);
    expect(yaw(gone)).toBeCloseTo(0);
    expect(rig.phase).toBe("off");
  });

  it("keeps the facing it took when the event starts again while it eases out", () => {
    const rig = buildLock(cue({ blendOut: 1 }));
    startLock(rig);
    applyLockInto(rig, turned(10), DT, still());
    endLock(rig);
    applyLockInto(rig, turned(50), DT, still());

    startLock(rig);
    const held = still();
    applyLockInto(rig, turned(50), DT, held);
    expect(yaw(held)).toBeCloseTo(-40);
  });

  it("holds for one more step with no blend-out time", () => {
    const rig = buildLock(cue({ blendOut: 0 }));
    startLock(rig);
    applyLockInto(rig, turned(0), DT, still());
    endLock(rig);

    const last = still();
    applyLockInto(rig, turned(30), DT, last);
    expect(yaw(last)).toBeCloseTo(-30);

    const after = still();
    applyLockInto(rig, turned(30), DT, after);
    expect(yaw(after)).toBeCloseTo(0);
  });
});

describe("advanceLock", () => {
  it("eases a lock out over time that passes with no step, and lets go past the blend-out time", () => {
    const rig = buildLock(cue({ blendOut: 0.2 }));
    startLock(rig);
    applyLockInto(rig, turned(0), DT, still());
    endLock(rig);

    advanceLock(rig, 0.1);
    const half = still();
    applyLockInto(rig, turned(40), DT, half);
    expect(yaw(half)).toBeCloseTo(-20);

    advanceLock(rig, 0.2);
    expect(rig.phase).toBe("off");
  });

  it("leaves a lock whose event still runs as it is", () => {
    const rig = buildLock(cue());
    startLock(rig);

    advanceLock(rig, 5);

    expect(rig.phase).toBe("armed");
    expect(rig.ended).toBe(-1);
  });
});
