import { describe, expect, it } from "vitest";

import type { ObjectProperties, PropertyValue } from "@/lib/tauri";

import { type MixPath, voiceMix, withDrafts } from "../voiceMix";

const SOUND = 1;
const RANDOM = 2;
const MIXER = 3;
const PLAY = 9;

function held(id: number, values: readonly PropertyValue[]): [number, ObjectProperties] {
  return [id, { id, editable: true, values: [...values], weights: null }];
}

const PATH: MixPath = { nodes: [SOUND, RANDOM, MIXER], action: { id: PLAY, delay: 0.25 } };

describe("voiceMix", () => {
  it("returns the neutral mix if no object of the path holds a property", () => {
    expect(voiceMix(PATH, new Map())).toEqual({
      gain: 0,
      pitch: 0,
      lpf: 0,
      hpf: 0,
      delay: 0.25,
      loopCount: 1,
    });
  });

  it("adds the volume and the make-up gain of every level in dB", () => {
    const properties = new Map([
      held(SOUND, [
        { property: "volume", value: -3 },
        { property: "makeUpGain", value: 2 },
      ]),
      held(RANDOM, [{ property: "volume", value: -6 }]),
      held(MIXER, [{ property: "makeUpGain", value: 1.5 }]),
    ]);

    expect(voiceMix(PATH, properties).gain).toBeCloseTo(-5.5);
  });

  it("adds the pitch of every level in cents", () => {
    const properties = new Map([
      held(SOUND, [{ property: "pitch", value: 100 }]),
      held(MIXER, [{ property: "pitch", value: -300 }]),
    ]);

    expect(voiceMix(PATH, properties).pitch).toBe(-200);
  });

  it("clamps the sums of the low-pass and the high-pass filter to 0-100", () => {
    const properties = new Map([
      held(SOUND, [
        { property: "lpf", value: 60 },
        { property: "hpf", value: 30 },
      ]),
      held(RANDOM, [
        { property: "lpf", value: 70 },
        { property: "hpf", value: 25 },
      ]),
    ]);

    expect(voiceMix(PATH, properties)).toMatchObject({ lpf: 100, hpf: 55 });
  });

  it("adds the initial delays of the nodes to the delay of the Play action in the tree", () => {
    const properties = new Map([
      held(SOUND, [{ property: "delay", value: 0.1 }]),
      held(RANDOM, [{ property: "delay", value: 0.2 }]),
    ]);

    expect(voiceMix(PATH, properties).delay).toBeCloseTo(0.55);
  });

  it("reads the delay of the Play action from its properties before the tree", () => {
    const properties = new Map([held(PLAY, [{ property: "delay", value: 0.5 }])]);

    expect(voiceMix(PATH, properties).delay).toBe(0.5);
  });

  it("adds no Play action delay for a press on a node", () => {
    const properties = new Map([held(SOUND, [{ property: "delay", value: 0.1 }])]);

    expect(voiceMix({ nodes: [SOUND], action: null }, properties).delay).toBe(0.1);
  });

  it("reads the loop count from the sound alone", () => {
    const properties = new Map([
      held(SOUND, [{ property: "loopCount", value: 3 }]),
      held(RANDOM, [{ property: "loopCount", value: 0 }]),
    ]);

    expect(voiceMix(PATH, properties).loopCount).toBe(3);
  });

  it("reads a property without a value as its default", () => {
    const properties = new Map([
      held(SOUND, [
        { property: "volume", value: null },
        { property: "loopCount", value: null },
      ]),
    ]);

    expect(voiceMix(PATH, properties)).toMatchObject({ gain: 0, loopCount: 1 });
  });
});

describe("withDrafts", () => {
  it("replaces the value of a drafted property and keeps the other values", () => {
    const properties = new Map([
      held(SOUND, [
        { property: "volume", value: -3 },
        { property: "pitch", value: 50 },
      ]),
    ]);

    const drafted = withDrafts(properties, [{ object: SOUND, property: "volume", value: 4 }]);

    expect(voiceMix(PATH, drafted)).toMatchObject({ gain: 4, pitch: 50 });
    expect(properties.get(SOUND)?.values[0]?.value).toBe(-3);
  });

  it("adds a drafted property that the object does not hold", () => {
    const drafted = withDrafts(new Map(), [{ object: RANDOM, property: "lpf", value: 40 }]);

    expect(voiceMix(PATH, drafted).lpf).toBe(40);
  });

  it("returns the same map without drafts", () => {
    const properties = new Map([held(SOUND, [])]);

    expect(withDrafts(properties, [])).toBe(properties);
  });
});
