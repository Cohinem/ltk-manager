// @vitest-environment happy-dom

import type { QueryClient, QueryKey } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

import type { InstalledMod } from "@/lib/tauri";
import { settingsKeys } from "@/modules/settings";
import { createMockInstalledMod, createMockSettings } from "@/test/fixtures";
import { createTestQueryClient } from "@/test/utils";

import { libraryKeys } from "../keys";
import { modMutations } from "../modMutations";

describe.each(["toggle", "enableWithLayers"] as const)("%s optimistic order", (kind) => {
  it.each([undefined, false, true])(
    "respects promotion preference %s before the backend responds",
    async (promotion) => {
      const client = createTestQueryClient();
      if (promotion !== undefined) {
        client.setQueryData(
          settingsKeys.settings(),
          createMockSettings({ promoteEnabledMods: promotion }),
        );
      }
      client.setQueryData(libraryKeys.mods(), [
        createMockInstalledMod({ id: "first" }),
        createMockInstalledMod({ id: "second", enabled: false }),
        createMockInstalledMod({ id: "third" }),
      ]);
      const context = { client, meta: undefined, mutationKey: undefined };

      if (kind === "toggle") {
        await modMutations.toggle(client).onMutate!({ modId: "second", enabled: true }, context);
      } else {
        await modMutations.enableWithLayers(client).onMutate!(
          { modId: "second", layerStates: { base: false } },
          context,
        );
      }

      const mods = client.getQueryData<InstalledMod[]>(libraryKeys.mods())!;
      expect(mods.map((mod) => mod.id)).toEqual(
        promotion ? ["second", "first", "third"] : ["first", "second", "third"],
      );
      expect(mods.find((mod) => mod.id === "second")?.enabled).toBe(true);
      if (kind === "enableWithLayers") {
        expect(mods.find((mod) => mod.id === "second")?.layers[0].enabled).toBe(false);
      }
      client.clear();
    },
  );
});

describe("settling a write against one mod", () => {
  /* Every card reads its thumbnail from under the mods key, and a thumbnail
     refetch mints a new asset URL, so invalidating the prefix redraws every
     card's image. */
  function seed() {
    const client = createTestQueryClient();
    client.setQueryData(libraryKeys.mods(), [
      createMockInstalledMod({ id: "first" }),
      createMockInstalledMod({ id: "second" }),
    ]);
    client.setQueryData(libraryKeys.thumbnails(["first", "second"]), {});
    for (const id of ["first", "second"]) {
      client.setQueryData(libraryKeys.thumbnail(id), `asset://${id}`);
      client.setQueryData(libraryKeys.readme(id), { status: "absent" });
      client.setQueryData(libraryKeys.licenseText(id), { status: "absent" });
    }
    return client;
  }

  function invalidated(client: QueryClient): QueryKey[] {
    return client
      .getQueryCache()
      .getAll()
      .filter((query) => query.state.isInvalidated)
      .map((query) => query.queryKey);
  }

  function context(client: QueryClient) {
    return { client, meta: undefined, mutationKey: undefined };
  }

  it.each([
    ["toggle", { modId: "second", enabled: false }],
    ["setLayers", { modId: "second", layerStates: {} }],
    ["enableWithLayers", { modId: "second", layerStates: {} }],
    ["uninstall", "second"],
  ] as const)("%s refetches the list and nothing a card draws from", (kind, variables) => {
    const client = seed();
    const { onSettled } = modMutations[kind](client) as {
      onSettled?: (...args: unknown[]) => unknown;
    };

    onSettled!(undefined, null, variables, undefined, context(client));

    expect(invalidated(client)).toEqual([libraryKeys.mods()]);
    client.clear();
  });

  it("edit refetches the list and nothing a card draws from", () => {
    const client = seed();

    modMutations.edit(client).onSettled!(
      undefined,
      null,
      { modId: "second", metadata: {} as never },
      undefined,
      context(client),
    );

    expect(invalidated(client)).toEqual([libraryKeys.mods()]);
    client.clear();
  });

  it("setStorage refetches the list and that mod's own documents", () => {
    const client = seed();

    modMutations.setStorage(client).onSettled!(
      undefined,
      null,
      { modId: "second", storage: "project" },
      undefined,
      context(client),
    );

    expect(invalidated(client)).toEqual(
      expect.arrayContaining([
        libraryKeys.mods(),
        libraryKeys.thumbnail("second"),
        libraryKeys.readme("second"),
        libraryKeys.licenseText("second"),
      ]),
    );
    expect(invalidated(client)).not.toContainEqual(libraryKeys.thumbnail("first"));
    expect(invalidated(client)).not.toContainEqual(libraryKeys.thumbnails(["first", "second"]));
    client.clear();
  });
});
