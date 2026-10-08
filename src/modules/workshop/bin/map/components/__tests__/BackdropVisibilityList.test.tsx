// @vitest-environment happy-dom

import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { backdropFlags } from "@/test/mapBackdrop";

import { BackdropVisibilityList } from "../BackdropVisibilityList";

const TERRAIN = "Layer 4 0x3c5b24f7";
const MUTATOR = "SR_Hall_Of_Legends Maps/Controllers/HallOfLegends";

/** The section under the heading `title`. */
function section(title: string): HTMLElement {
  const found = screen.getByRole("heading", { name: title }).closest("section");
  if (found === null) throw new Error(`no section titled ${title}`);
  return found;
}

afterEach(cleanup);

describe("BackdropVisibilityList", () => {
  it("lists each layer with its state and its triangle count", () => {
    render(<BackdropVisibilityList backdrop={backdropFlags()} />);

    const layer = within(section("Layers")).getByRole("checkbox", { name: "Layer 4" });
    expect(layer.getAttribute("aria-checked")).toBe("false");
    expect(screen.getByText("1,250 triangles")).toBeTruthy();
  });

  it("lists an independent controller in the section of its kind, with a checkbox", () => {
    render(<BackdropVisibilityList backdrop={backdropFlags()} />);

    const terrain = within(section("Terrain")).getByRole("checkbox", { name: TERRAIN });
    const mutator = within(section("Mutator")).getByRole("checkbox", { name: MUTATOR });

    expect(terrain.getAttribute("aria-checked")).toBe("false");
    expect(mutator.getAttribute("aria-checked")).toBe("false");
    expect(within(section("Terrain")).getByText("138 meshes")).toBeTruthy();
  });

  it("lists a dependent controller under its parent, with no checkbox", () => {
    render(<BackdropVisibilityList backdrop={backdropFlags()} />);

    const terrain = section("Terrain");

    expect(within(terrain).getByText("0x5e652742")).toBeTruthy();
    expect(within(terrain).getAllByRole("checkbox")).toHaveLength(1);
    expect(screen.queryByRole("checkbox", { name: /0x5e652742/ })).toBeNull();
  });

  it("marks a dependent as hidden while its parent is shown, and shows its current state", () => {
    render(<BackdropVisibilityList backdrop={backdropFlags()} />);

    expect(screen.getByLabelText("Hidden while Layer 4 is shown")).toBeTruthy();
    expect(screen.getByLabelText("Shown")).toBeTruthy();
  });

  it("shows a dependent as hidden once the override of its parent hides it", () => {
    const overrides = new Map([["0x3c5b24f7", true]]);
    render(<BackdropVisibilityList backdrop={backdropFlags({ overrides })} />);

    expect(screen.getByLabelText("Hidden")).toBeTruthy();
    expect(screen.queryByLabelText("Shown")).toBeNull();
  });

  it("sets a layer and a controller to the state the reader ticks", async () => {
    const held = backdropFlags();
    render(<BackdropVisibilityList backdrop={held} />);

    await userEvent.click(within(section("Layers")).getByRole("checkbox", { name: "Layer 4" }));
    await userEvent.click(screen.getByRole("checkbox", { name: TERRAIN }));

    expect(held.setLayer).toHaveBeenCalledWith(3, true);
    expect(held.setController).toHaveBeenCalledWith("0x3c5b24f7", true);
  });

  it("has no open action without an open handler", () => {
    render(<BackdropVisibilityList backdrop={backdropFlags()} />);

    expect(screen.queryByRole("button", { name: "Open the controller object" })).toBeNull();
  });

  it("opens the object of an independent controller and of a dependent one", async () => {
    const onOpen = vi.fn();
    render(<BackdropVisibilityList backdrop={backdropFlags()} onOpenController={onOpen} />);

    const actions = within(section("Terrain")).getAllByRole("button", {
      name: "Open the controller object",
    });
    for (const action of actions) await userEvent.click(action);

    expect(onOpen.mock.calls.map(([hash]) => hash)).toEqual(["0x3c5b24f7", "0x5e652742"]);
  });

  it("shows the empty text if the map has no layers and no controllers", () => {
    render(
      <BackdropVisibilityList
        backdrop={backdropFlags({ layers: [], controllers: [], uses: new Map() })}
      />,
    );

    expect(screen.getByText("The map names no visibility layers")).toBeTruthy();
    expect(screen.getByText("The map declares no visibility controllers")).toBeTruthy();
  });
});
