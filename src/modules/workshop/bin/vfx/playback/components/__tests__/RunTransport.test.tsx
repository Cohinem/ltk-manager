// @vitest-environment happy-dom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { fakeRun } from "../../state/__tests__/fakeRun";
import { VfxRunContext } from "../../state/run";
import { RunTransport } from "../RunTransport";

const readout = () => screen.getByRole("timer", { name: "Playhead time" });

describe("RunTransport", () => {
  it("draws the run's playhead off the clock, and its controls off the run", async () => {
    const { run } = fakeRun();
    render(
      <VfxRunContext value={run}>
        <RunTransport />
      </VfxRunContext>,
    );

    const scrub = screen.getByRole("slider", { name: "Playhead" });
    expect(readout()).toHaveTextContent("0.00 / 2.00 s");
    expect(scrub).toHaveAttribute("aria-valuenow", "0.00");

    run.driver.advance(0.4);
    await waitFor(() => expect(readout()).toHaveTextContent("0.40 / 2.00 s"));
    await waitFor(() => expect(scrub).toHaveAttribute("aria-valuenow", "0.40"));
    expect(Number(scrub.style.getPropertyValue("--scrub"))).toBeCloseTo(0.2);

    await userEvent.click(screen.getByRole("button", { name: "Play" }));
    expect(run.setPlaying).toHaveBeenCalledWith(true);
  });

  it("types the run's speed to three places and nudges it from the arrows", async () => {
    const { run } = fakeRun();
    render(
      <VfxRunContext value={run}>
        <RunTransport />
      </VfxRunContext>,
    );

    expect(screen.getByRole("textbox", { name: "Playback speed" })).toHaveValue("1.000");

    await userEvent.click(screen.getByRole("button", { name: "Faster" }));
    expect(run.setSpeed).toHaveBeenLastCalledWith(1.1);
  });

  it("leaves the scrub out where the host draws a ruler", () => {
    const { run } = fakeRun();
    render(
      <VfxRunContext value={run}>
        <RunTransport scrub={false} />
      </VfxRunContext>,
    );

    expect(screen.queryByRole("slider", { name: "Playhead" })).not.toBeInTheDocument();
    expect(readout()).toHaveTextContent("0.00 / 2.00 s");
  });

  it("switches the loop from its toggle, lit while the run loops", async () => {
    const { run } = fakeRun();
    render(
      <VfxRunContext value={run}>
        <RunTransport variant="mini" />
      </VfxRunContext>,
    );

    const loop = screen.getByRole("button", { name: "Loop" });
    expect(loop).toHaveAttribute("aria-pressed", String(run.looping));

    await userEvent.click(loop);
    expect(run.setLooping).toHaveBeenCalledWith(!run.looping);
  });

  it("restarts the run and plays it from the Restart button", async () => {
    const { run } = fakeRun();
    render(
      <VfxRunContext value={run}>
        <RunTransport />
      </VfxRunContext>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Restart" }));

    expect(run.restart).toHaveBeenCalledTimes(1);
    expect(run.setPlaying).toHaveBeenCalledWith(true);
  });

  it("pauses the clock while the mini scrub moves, and lets it run once the move commits", () => {
    const { run } = fakeRun();
    render(
      <VfxRunContext value={run}>
        <RunTransport variant="mini" />
      </VfxRunContext>,
    );

    fireEvent.keyDown(screen.getByRole("slider", { name: "Playhead" }), { key: "ArrowRight" });

    expect(run.beginScrub).toHaveBeenCalled();
    expect(run.seek).toHaveBeenCalled();
    expect(run.endScrub).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "Restart" })).not.toBeInTheDocument();
  });
});
