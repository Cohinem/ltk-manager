import { describe, expect, it } from "vitest";

import { batchDraws } from "../batch";
import type { Command, DrawCommand } from "../types";

/** One quad of `element` sampling `texture`, its vertices tagged with `x`. */
function quad(element: string, texture: number | null, x: number): DrawCommand {
  return {
    kind: "draw",
    shader: "blend",
    texture,
    geometry: {
      positions: [x, 0, x, 0, x, 1, x, 1],
      colors: new Array<number>(16).fill(255),
      texcoords: new Array<number>(16).fill(0),
      indices: [0, 2, 1, 1, 2, 3],
    },
    primitive: "triangles",
    blend: "premultiplied",
    effect: null,
    scissor: null,
    element,
  };
}

function draws(commands: readonly Command[]): DrawCommand[] {
  return commands.filter((command): command is DrawCommand => command.kind === "draw");
}

describe("batchDraws", () => {
  it("merges consecutive draws of one texture into one, in their order", () => {
    const [batch, ...rest] = draws(batchDraws([quad("a", 0, 1), quad("b", 0, 2)]));

    expect(rest).toHaveLength(0);
    expect(batch?.element).toBe("a");
    expect(batch?.geometry.positions.filter((_, at) => at % 2 === 0)).toEqual([
      1, 1, 1, 1, 2, 2, 2, 2,
    ]);
    expect(batch?.geometry.indices).toEqual([0, 2, 1, 1, 2, 3, 4, 6, 5, 5, 6, 7]);
  });

  it("starts a new batch at another texture, a scissor, an effect or a text", () => {
    const scissored = { ...quad("c", 0, 3), scissor: { x: 0, y: 0, w: 10, h: 10 } };
    const timed = { ...quad("d", 0, 4), effect: {} as DrawCommand["effect"] };
    const commands: Command[] = [
      quad("a", 0, 1),
      quad("b", 1, 2),
      scissored,
      timed,
      { kind: "push", group: "g" },
      quad("e", 0, 5),
    ];

    expect(batchDraws(commands)).toHaveLength(commands.length);
  });

  it("leaves a lone draw as it was", () => {
    const lone = quad("a", 0, 1);

    expect(batchDraws([lone])[0]).toBe(lone);
  });
});
