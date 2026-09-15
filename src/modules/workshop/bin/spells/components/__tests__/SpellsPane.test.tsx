// @vitest-environment happy-dom

import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CharacterSpells } from "@/lib/tauri";
import { mockInvoke } from "@/test/mocks/tauri";
import { createTestQueryClient } from "@/test/utils";

import { gameKeys } from "../../../../gameBrowser/api/keys";
import { spellQueries } from "../../api/spellQueries";
import { SpellsPane } from "../SpellsPane";

vi.mock("../MissilePane", () => ({
  MissilePane: ({ entry }: { entry: string }) => <div>{`Preview ${entry}`}</div>,
}));

const PATH = "Characters/Sejuani/Spells/SejuaniEAbility/SejuaniEPassiveMissile";
const READY: CharacterSpells = {
  status: "ready",
  unnamed: 0,
  spells: [
    {
      objectHash: "0x859d7934",
      path: PATH,
      name: "SejuaniEAbility/SejuaniEPassiveMissile",
      group: "SejuaniEAbility",
      declarations: ["a"].map((name) => ({
        asset: { kind: "gameChunk", wad: `${name}.wad.client`, pathHash: name },
        file: `data/${name}.bin`,
        classHash: "0x5e7e5a06",
        class: "SpellObject",
      })),
    },
  ],
};

function mount(path = "Characters/Sejuani/Skins/Skin0") {
  const client = createTestQueryClient();
  render(
    <QueryClientProvider client={client}>
      <SpellsPane objectPath={path} skin={{ document: 1, entry: "0xskin" }} />
    </QueryClientProvider>,
  );
  return client;
}

const PREVIEW = {
  missile: { movement: { kind: "fixedSpeed", speed: 5000 }, startDelay: null },
  issues: [],
};
function answer(command: string) {
  if (command === "bin_open") return Promise.resolve({ ok: true, value: { document: 2 } });
  if (command === "read_spell") return Promise.resolve({ ok: true, value: PREVIEW });
  if (command === "bin_close") return Promise.resolve({ ok: true, value: null });
  return Promise.resolve({ ok: true, value: READY });
}

beforeEach(() => {
  mockInvoke.mockReset();
  mockInvoke.mockImplementation(answer);
});
afterEach(cleanup);

describe("SpellsPane", () => {
  it("opens a supported spell directly without exposing its containing bin", async () => {
    const user = userEvent.setup();
    mount();
    const spell = await screen.findByRole("button", { name: "SejuaniEPassiveMissile" });
    await waitFor(() => expect(spell).toBeEnabled());
    expect(screen.queryByText(/data\/a.bin/)).not.toBeInTheDocument();
    expect(spell).not.toHaveAttribute("aria-expanded");
    await user.click(spell);
    expect(await screen.findByText("Preview 0x859d7934")).toBeInTheDocument();
    expect(mockInvoke).toHaveBeenCalledWith("bin_close", { document: 2 });
    await user.click(screen.getByRole("button", { name: "Spells" }));
    await user.type(screen.getByRole("textbox", { name: "Filter spells" }), "missing");
    expect(screen.getByText("No named spells match.")).toBeInTheDocument();
    expect(mockInvoke.mock.calls.filter(([cmd]) => cmd === "character_spells")).toHaveLength(1);
  });

  it.each([null, { movement: { kind: "unsupported", class_hash: "0x775dfd10" } }])(
    "disables unsupported spells before navigation",
    async (missile) => {
      mockInvoke.mockImplementation((command) =>
        command === "read_spell"
          ? Promise.resolve({ ok: true, value: { missile, issues: [] } })
          : answer(command),
      );
      mount();
      const spell = await screen.findByRole("button", { name: /SejuaniEPassiveMissile/ });
      await screen.findByText("Not supported yet");
      expect(spell).toBeDisabled();
      await userEvent.setup().click(spell);
      expect(screen.queryByText(/Preview 0x/)).not.toBeInTheDocument();
    },
  );

  it("does not choose between conflicting declarations", async () => {
    const spell = READY.spells[0];
    mockInvoke.mockResolvedValue({
      ok: true,
      value: {
        ...READY,
        spells: [{ ...spell, declarations: [...spell.declarations, ...spell.declarations] }],
      },
    });
    mount();
    await screen.findByText("Conflicting definitions");
    expect(screen.getByRole("button", { name: /SejuaniEPassiveMissile/ })).toBeDisabled();
    expect(mockInvoke.mock.calls.some(([cmd]) => cmd === "bin_open")).toBe(false);
  });

  it("warms an absent index and refetches the catalog when the warm completes", async () => {
    let ready = false;
    mockInvoke.mockImplementation(async (command) => {
      if (command === "warm_object_index") {
        ready = true;
        return { ok: true, value: null };
      }
      if (command === "character_spells")
        return { ok: true, value: ready ? READY : { status: "absent" } };
      return answer(command);
    });
    mount();
    expect(
      await screen.findByRole("button", { name: /SejuaniEPassiveMissile/ }),
    ).toBeInTheDocument();
    expect(
      mockInvoke.mock.calls.filter(([command]) => command === "warm_object_index"),
    ).toHaveLength(1);
  });

  it("keeps index failure distinct from an empty catalog and retries the build", async () => {
    mockInvoke.mockResolvedValue({
      ok: true,
      value: { status: "failed", error: { code: "IO", detail: "archive unavailable" } },
    });
    mount();
    await userEvent.setup().click(await screen.findByRole("button", { name: "Retry" }));
    expect(mockInvoke).toHaveBeenCalledWith("warm_object_index");
    expect(screen.queryByText("No named spells match.")).not.toBeInTheDocument();
  });

  it("refreshes only this character and omits install-wide unknown names", async () => {
    const client = mount();
    await screen.findByRole("button", { name: /SejuaniEPassiveMissile/ });
    mockInvoke.mockResolvedValue({ ok: true, value: { status: "ready", spells: [], unnamed: 3 } });
    await client.invalidateQueries({ queryKey: gameKeys.objectSearches });
    await waitFor(() => expect(screen.getByText("No named spells match.")).toBeInTheDocument());
    expect(screen.queryByText(/spell objects in the install/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /SejuaniEPassiveMissile/ }),
    ).not.toBeInTheDocument();
  });

  it("does not query the catalog for an unnamed skin", () => {
    mount("0x12345678");
    expect(
      screen.getByText("A named character object is needed to find its spells."),
    ).toBeInTheDocument();
    expect(mockInvoke).not.toHaveBeenCalled();
  });
});

it("offers impact-only spells to the ability scene and respects the hit-effect flag", async () => {
  mockInvoke.mockImplementation((command) =>
    command === "read_spell"
      ? Promise.resolve({
          ok: true,
          value: {
            missile: null,
            animationName: null,
            hitEffectKey: "hit",
            haveHitEffect: true,
            issues: [],
          },
        })
      : answer(command),
  );
  const client = createTestQueryClient();
  expect(await client.fetchQuery(spellQueries.availability(READY.spells, true))).toEqual({
    "0x859d7934": "supported",
  });
  expect(await client.fetchQuery(spellQueries.availability(READY.spells))).toEqual({
    "0x859d7934": "unsupported",
  });
  mockInvoke.mockImplementation((command) =>
    command === "read_spell"
      ? Promise.resolve({
          ok: true,
          value: { missile: null, hitEffectKey: "hit", haveHitEffect: false, issues: [] },
        })
      : answer(command),
  );
  client.clear();
  expect(await client.fetchQuery(spellQueries.availability(READY.spells, true))).toEqual({
    "0x859d7934": "unsupported",
  });
});
