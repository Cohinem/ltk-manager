import { describe, expect, it } from "vitest";

import { list, number, valueCurve } from "../../engine/drivers/__tests__/driverFixture";
import { systemLeaf } from "../childModel";
import {
  authored,
  childSet,
  emitter,
  hex,
  identifier,
  inlined,
  SET,
  SMOKE,
  SPARKS,
  text,
} from "./childFixture";

describe("authoredChildSet", () => {
  it("reads an emitter that writes no set as an unwritten set at the set's hash path", () => {
    expect(authored(null)).toMatchObject({
      hashPath: SET,
      authored: false,
      children: [],
      bones: [],
      probabilityRead: false,
      picked: null,
      starved: false,
    });
  });

  it("reads a linked child and a keyed child the resolver inlined", () => {
    const set = authored(childSet([identifier("effect", SPARKS), identifier("effectKey", SMOKE)]));

    expect(set.children).toMatchObject([
      {
        index: 0,
        naming: "link",
        system: { entry: "0x00000011", name: "Particles/Sparks_Child" },
        label: "Particles/Sparks_Child",
        hashPath: `${SET}.${hex("childrenIdentifiers")}[0]`,
        emitters: [{ name: "Spark", simple: false, listIndex: 0, children: 0 }],
      },
      { index: 1, naming: "key", system: { entry: "0x00000022" } },
    ]);
  });

  it("reads a link and a key the resolver left in place as children with no system", () => {
    const set = authored(
      childSet([
        identifier("effect", { type: "link", hash: "0x000000aa", name: "Particles/Elsewhere" }),
        identifier("effectKey", { type: "hash", hash: "0x000000bb", name: null }),
      ]),
    );

    expect(set.children.map((child) => [child.naming, child.system, child.label])).toEqual([
      ["link", null, "Particles/Elsewhere"],
      ["key", null, "0x000000bb"],
    ]);
  });

  it("counts the children a child's emitter names in its own set", () => {
    const carrier = emitter("Carrier", {
      childParticleSetDefinition: childSet([
        identifier("effect", SMOKE),
        identifier("effect", SMOKE),
      ]),
    });
    const set = authored(childSet([identifier("effect", inlined("0x33", null, carrier))]));

    expect(set.children[0]?.emitters).toEqual([
      { name: "Carrier", simple: false, listIndex: 0, children: 2 },
    ]);
  });

  it("marks the child a constant probability picks, as `max(0, value) % count`", () => {
    const children = [identifier("effect", SPARKS), identifier("effect", SMOKE)];
    const pick = (value: number) =>
      authored(childSet(children, { childrenProbability: valueCurve("ValueFloat", number(value)) }))
        .picked;

    expect(authored(childSet(children)).picked).toBe(0);
    expect(pick(1)).toBe(1);
    expect(pick(3.9)).toBe(1);
    expect(pick(-2)).toBe(0);
  });

  it("marks no child for a keyed probability or a set of one child", () => {
    const keyed = valueCurve("ValueFloat", number(0), [
      [0, number(0)],
      [1, number(1)],
    ]);
    const two = [identifier("effect", SPARKS), identifier("effect", SMOKE)];

    expect(authored(childSet(two, { childrenProbability: keyed })).picked).toBeNull();
    expect(authored(childSet([identifier("effect", SPARKS)]))).toMatchObject({
      probabilityRead: false,
      picked: null,
    });
  });

  it("reads a set naming bones as a bone set, with each child's bone", () => {
    const set = authored(
      childSet([identifier("effect", SPARKS), identifier("effect", SMOKE)], {
        boneToSpawnAt: list(text("Head"), text("Root")),
      }),
    );

    expect(set).toMatchObject({
      bones: ["Head", "Root"],
      probabilityRead: false,
      picked: null,
      starved: false,
    });
    expect(set.children.map((child) => child.bone)).toEqual(["Head", "Root"]);
  });

  it("marks a bone set with fewer bones than children as spawning none", () => {
    const set = authored(
      childSet([identifier("effect", SPARKS), identifier("effect", SMOKE)], {
        boneToSpawnAt: list(text("Head")),
      }),
    );

    expect(set.starved).toBe(true);
    expect(set.children[1]?.bone).toBeNull();
  });
});

describe("systemLeaf", () => {
  it("answers the last segment of a path, and a bare name whole", () => {
    expect(systemLeaf("Characters/Ahri/Particles/Ahri_Q_Child")).toBe("Ahri_Q_Child");
    expect(systemLeaf("0x000000bb")).toBe("0x000000bb");
  });
});
