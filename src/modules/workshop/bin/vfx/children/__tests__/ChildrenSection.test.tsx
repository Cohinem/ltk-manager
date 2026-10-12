// @vitest-environment happy-dom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { list, number, valueCurve } from "../../engine/drivers/__tests__/driverFixture";
import { fakeRun } from "../../playback/state/__tests__/fakeRun";
import { VfxRunContext } from "../../playback/state/run";
import type { AuthoredChildSet } from "../childModel";
import { ChildrenSection } from "../ChildrenSection";
import type { ChildActions } from "../useChildren";
import { authored, childSet, EMITTER, identifier, SMOKE, SPARKS, text } from "./childFixture";

const UNREACHED = identifier("effectKey", { type: "hash", hash: "0x000000bb", name: null });

const fixture = vi.hoisted(() => ({
  set: null as AuthoredChildSet | null,
  actions: null as ChildActions | null,
}));
vi.mock("../useChildren", () => ({
  useChildren: () => ({
    card: { row: { entry: "0x12345678", path: EMITTER } },
    set: fixture.set,
    systemName: "Particles/Orb",
    visible: true,
  }),
  useChildActions: () => fixture.actions,
  childQueries: {
    targets: () => ({
      queryKey: ["vfx-child-targets", 0],
      queryFn: () => [
        { entry: "0x12345678", name: "Particles/Orb" },
        { entry: "0x00000011", name: "Particles/Sparks_Child" },
        { entry: "0x00000022", name: "Particles/Smoke_Child" },
      ],
    }),
  },
}));
vi.mock("../../templates/templateQueries", () => ({ useVfxTemplates: () => [] }));

function spies(): ChildActions {
  return {
    add: vi.fn().mockResolvedValue(true),
    remove: vi.fn().mockResolvedValue(true),
    move: vi.fn().mockResolvedValue(true),
    setBone: vi.fn().mockResolvedValue(true),
    create: vi.fn().mockResolvedValue(true),
  };
}

const READ_ONLY: ChildActions = {
  add: null,
  remove: null,
  move: null,
  setBone: null,
  create: null,
};

beforeEach(() => {
  fixture.actions = spies();
  fixture.set = authored(
    childSet([identifier("effect", SPARKS), identifier("effect", SMOKE), UNREACHED], {
      childrenProbability: valueCurve("ValueFloat", number(1)),
    }),
  );
});
afterEach(cleanup);

function mount(search = "") {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <VfxRunContext value={fakeRun().run}>
        <ChildrenSection search={search} />
      </VfxRunContext>
    </QueryClientProvider>,
  );
}

function childRows(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('[data-ui="ChildrenSection:child"]')];
}

describe("ChildrenSection", () => {
  it("lists each child by its place and its system's name, open while the set has children", () => {
    mount();

    expect(screen.getByRole("button", { name: "Child particles" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(childRows().map((row) => row.textContent)).toEqual([
      expect.stringContaining("[0]Sparks_Child"),
      expect.stringContaining("[1]Smoke_Child"),
      expect.stringContaining("[2]0x000000bb"),
    ]);
  });

  it("marks the child a constant probability picks and a child the resolver did not reach", () => {
    mount();
    const [sparks, smoke, unreached] = childRows();

    expect(within(smoke!).getByText("picked")).toBeInTheDocument();
    expect(within(sparks!).queryByText("picked")).not.toBeInTheDocument();
    expect(within(unreached!).getByText("unresolved")).toBeInTheDocument();
    expect(within(smoke!).getByRole("button", { name: "Open Smoke_Child" })).toBeInTheDocument();
    expect(within(unreached!).queryByRole("button", { name: /^Open / })).not.toBeInTheDocument();
  });

  it("sends a removal and a move for the child of the row", async () => {
    mount();
    const [sparks, smoke] = childRows();

    expect(within(sparks!).getByRole("button", { name: "Move up" })).toBeDisabled();
    await userEvent.click(within(sparks!).getByRole("button", { name: "Move down" }));
    await userEvent.click(within(smoke!).getByRole("button", { name: "Remove child" }));

    expect(fixture.actions?.move).toHaveBeenCalledWith(0, 1);
    expect(fixture.actions?.remove).toHaveBeenCalledWith(1);
  });

  it("draws an empty bone field on every child, and writes the bone typed into one", async () => {
    mount();
    const bones = screen.getAllByRole("textbox", { name: "Bone" });

    expect(bones.map((field) => (field as HTMLInputElement).value)).toEqual(["", "", ""]);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    await userEvent.type(bones[1]!, "Head{Enter}");
    expect(fixture.actions?.setBone).toHaveBeenCalledWith(1, "Head");
  });

  it("shows each child's bone, and warns of fewer bones than children", () => {
    fixture.set = authored(
      childSet([identifier("effect", SPARKS), identifier("effect", SMOKE)], {
        boneToSpawnAt: list(text("Head")),
      }),
    );
    mount();
    const bones = screen.getAllByRole("textbox", { name: "Bone" });

    expect(bones.map((field) => (field as HTMLInputElement).value)).toEqual(["Head", ""]);
    expect(screen.getByRole("alert")).toHaveTextContent("Too few bones");
  });

  it("starts folded on an emitter with no child, and offers the add picker once opened", async () => {
    fixture.set = authored(null);
    mount();
    const header = screen.getByRole("button", { name: "Child particles" });

    expect(header).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(header);
    expect(screen.getByText("No children")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Add child" })).toBeInTheDocument();
  });

  it("lists what Add child offers as effects and new effect, and links the effect picked", async () => {
    mount();
    await userEvent.click(screen.getByRole("combobox", { name: "Add child" }));

    const list = await screen.findByRole("listbox");
    expect(await within(list).findByText("Effects")).toBeInTheDocument();
    expect(within(list).getByText("New effect")).toBeInTheDocument();
    expect(within(list).queryByText("Orb")).not.toBeInTheDocument();
    expect(within(list).getAllByRole("option")).toHaveLength(3);

    await userEvent.click(within(list).getByRole("option", { name: /Sparks_Child/ }));
    expect(fixture.actions?.add).toHaveBeenCalledWith("0x00000011");
  });

  it("narrows Add child to the entries that contain the typed text", async () => {
    mount();
    await userEvent.type(screen.getByRole("combobox", { name: "Add child" }), "smoke");

    const list = await screen.findByRole("listbox");
    const smoke = await within(list).findByRole("option", { name: /Smoke_Child/ });
    expect(within(list).getAllByRole("option")).toHaveLength(1);
    await userEvent.click(smoke);
    expect(fixture.actions?.add).toHaveBeenCalledWith("0x00000022");
  });

  it("creates a blank effect as the child", async () => {
    mount();
    await userEvent.click(screen.getByRole("combobox", { name: "Add child" }));

    const list = await screen.findByRole("listbox");
    await userEvent.click(within(list).getByRole("option", { name: "Blank" }));
    expect(fixture.actions?.create).toHaveBeenCalledWith({ kind: "blank" });
  });

  it("draws no add picker and no row action on a document that takes no edit", () => {
    fixture.actions = READ_ONLY;
    mount();

    expect(screen.queryByRole("combobox", { name: "Add child" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove child" })).not.toBeInTheDocument();
  });

  it("stays out of a search that names neither the section nor a child", () => {
    mount("emission");
    expect(screen.queryByRole("button", { name: "Child particles" })).not.toBeInTheDocument();

    cleanup();
    mount("smoke");
    expect(childRows()).toHaveLength(3);
  });
});
