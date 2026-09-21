// @vitest-environment happy-dom

import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NO_AMBIENT_OCCLUSION } from "@/modules/viewport/scene/utils/ambientOcclusion";
import { NO_POST_EFFECTS } from "@/modules/viewport/scene/utils/postEffects";
import { useWorkshopLayoutStore } from "@/stores";

import { PostEffectsControl } from "../PostEffectsControl";

vi.mock("@/modules/viewport", async () => ({
  ...(await import("@/modules/viewport/scene/utils/ambientOcclusion")),
  NO_POST_EFFECTS: (await import("@/modules/viewport/scene/utils/postEffects")).NO_POST_EFFECTS,
  useBackdropAmbientOcclusion: () => null,
  useBackdropPostEffects: () => null,
}));

beforeEach(() => {
  useWorkshopLayoutStore.setState({ previewPostEffects: null, previewAmbientOcclusion: null });
});
afterEach(cleanup);

async function open() {
  const user = userEvent.setup();
  render(<PostEffectsControl source={null} />);
  await user.click(screen.getByRole("button", { name: "Post effects" }));
  return { user, popup: await screen.findByRole("dialog", { name: "Post effects" }) };
}

describe("PostEffectsControl", () => {
  it("opens with every effect off and none of their knobs", async () => {
    const { popup } = await open();

    for (const effect of ["Ambient occlusion", "Depth fog", "Height fog", "Depth of field"]) {
      expect(within(popup).getByRole("switch", { name: effect })).not.toBeChecked();
    }
    expect(within(popup).queryByRole("slider")).toBeNull();
  });

  it("switches an effect on as a custom override and shows its knobs in its group", async () => {
    const { user, popup } = await open();

    await user.click(within(popup).getByRole("switch", { name: "Height fog" }));

    expect(useWorkshopLayoutStore.getState().previewPostEffects).toEqual({
      ...NO_POST_EFFECTS,
      heightFog: { ...NO_POST_EFFECTS.heightFog, enabled: true },
    });
    const group = within(popup).getByRole("group", { name: "Height fog" });
    expect(within(group).getByRole("slider", { name: "Start" })).toBeInTheDocument();
    expect(within(group).getByRole("button", { name: "Fog colour" })).toBeInTheDocument();
  });

  it("sets the occlusion as its own override, apart from the other effects", async () => {
    const { user, popup } = await open();

    await user.click(within(popup).getByRole("switch", { name: "Ambient occlusion" }));
    const group = within(popup).getByRole("group", { name: "Ambient occlusion" });
    await user.click(within(group).getByRole("button", { name: "8" }));

    expect(useWorkshopLayoutStore.getState().previewAmbientOcclusion).toEqual({
      ...NO_AMBIENT_OCCLUSION,
      enabled: true,
      sampleQuality: 1,
    });
    expect(useWorkshopLayoutStore.getState().previewPostEffects).toBeNull();
    expect(within(group).getByRole("slider", { name: "Sample radius" })).toBeInTheDocument();
  });

  it("returns every map to its own effects on reset", async () => {
    const { user, popup } = await open();
    await user.click(within(popup).getByRole("switch", { name: "Depth fog" }));
    await user.click(within(popup).getByRole("switch", { name: "Ambient occlusion" }));

    await user.click(
      within(popup).getByRole("button", { name: "Reset to the map's post effects" }),
    );

    expect(useWorkshopLayoutStore.getState().previewPostEffects).toBeNull();
    expect(useWorkshopLayoutStore.getState().previewAmbientOcclusion).toBeNull();
  });
});
