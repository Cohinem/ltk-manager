// @vitest-environment happy-dom

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
