// @vitest-environment happy-dom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import type { EmitterModel, SystemModel } from "../../engine/model/model";
import { emptySystem } from "../../engine/model/systemModel";
import { emitterOf } from "../../engine/simulation/__tests__/emitterFixture";
import { fakeRun } from "../../playback/state/__tests__/fakeRun";
import { VfxRunContext } from "../../playback/state/run";
import { MaskMark } from "../MaskMark";
import { maskUse } from "../maskModel";

function stencilled(index: number, name: string, mode: number, ref: number): EmitterModel {
  return emitterOf(index, {
    name,
    stencilMode: mode as EmitterModel["stencilMode"],
    stencilRef: ref,
  });
}

function draw(emitters: readonly EmitterModel[]) {
  const system: SystemModel = { ...emptySystem("0x1"), emitters };
  const { run } = fakeRun({ system });

  render(
    <VfxRunContext value={run}>
      {emitters.map((emitter) => {
        const use = maskUse(emitter);
        return use === null ? null : <MaskMark key={emitter.index} use={use} />;
      })}
    </VfxRunContext>,
  );
}

describe("MaskMark", () => {
  it("names the role and the mask of each emitter", () => {
    draw([
      stencilled(0, "cap", 1, 2),
      stencilled(1, "glow", 2, 2),
      stencilled(2, "rim", 3, 2),
      stencilled(3, "lines", 4, 5),
    ]);

    expect(screen.getByRole("img", { name: "Writes mask 2" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Draws inside mask 2" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Draws outside mask 2" })).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "Draws outside mask 5 and adds to it" }),
    ).toBeInTheDocument();
  });

  it("lists the emitters that write the mask and the emitters it masks on hover", async () => {
    draw([stencilled(0, "cap", 1, 2), stencilled(1, "glow", 2, 2)]);

    await userEvent.hover(screen.getByRole("img", { name: "Draws inside mask 2" }));

    expect(await screen.findByText("Written by cap")).toBeInTheDocument();
    expect(screen.getByText("Masks glow")).toBeInTheDocument();
  });
});
