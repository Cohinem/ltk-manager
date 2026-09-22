// @vitest-environment happy-dom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AssetRef } from "@/lib/tauri";

import { BakeTangentsButton } from "../BakeTangentsButton";

const { bake, success } = vi.hoisted(() => ({ bake: vi.fn(), success: vi.fn() }));

vi.mock("@/lib/tauri", () => ({ api: { bin: { bakeSkinTangents: bake } } }));
vi.mock("@/components", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components")>()),
  useToast: () => ({ success }),
}));

const skin: AssetRef = { kind: "layer", project: "project", layer: "base", path: "skin.bin" };
const mesh: AssetRef = { ...skin, path: "body.skn" };

function draw(asset: AssetRef = skin, target: AssetRef | null = mesh) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const invalidate = vi.spyOn(client, "invalidateQueries");
  render(
    <QueryClientProvider client={client}>
      <BakeTangentsButton document={1} entry="0x12345678" asset={asset} mesh={target} />
    </QueryClientProvider>,
  );

  return invalidate;
}

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("skin tangent baking", () => {
  it("saves the selected skin's mesh and refreshes its geometry", async () => {
    bake.mockResolvedValue({ ok: true, value: mesh });
    const invalidate = draw();

    fireEvent.click(screen.getByRole("button", { name: "Bake tangents" }));

    await waitFor(() => expect(success).toHaveBeenCalledWith("Mesh tangents saved"));
    expect(bake).toHaveBeenCalledWith(1, "0x12345678");
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["viewport", "mesh", mesh] });
  });

  it("blocks repeated clicks while baking", async () => {
    let finish!: (value: unknown) => void;
    bake.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    draw();
    fireEvent.click(screen.getByRole("button", { name: "Bake tangents" }));

    const pending = await screen.findByRole("button", { name: "Baking tangents…" });
    fireEvent.click(pending);
    expect(bake).toHaveBeenCalledTimes(1);

    finish({ ok: true, value: mesh });
    await waitFor(() => expect(success).toHaveBeenCalled());
  });

  it.each<AssetRef | null>([
    null,
    { ...mesh, layer: "chroma" },
    { ...mesh, project: "other" },
    { kind: "gameChunk", wad: "Ahri.wad.client", pathHash: "0000000000000000" },
  ])("does not bake a mesh outside the viewed layer (%j)", (target) => {
    draw(skin, target);
    fireEvent.click(screen.getByRole("button", { name: "Bake tangents" }));
    expect(bake).not.toHaveBeenCalled();
  });

  it("hides baking outside a project layer", () => {
    draw({ kind: "file", path: "skin.bin" });
    expect(screen.queryByRole("button", { name: "Bake tangents" })).toBeNull();
  });

  it("allows retry after a failure without reporting success or refreshing geometry", async () => {
    bake.mockResolvedValue({ ok: false, error: { code: "PREVIEW", detail: "Invalid mesh" } });
    const invalidate = draw();
    fireEvent.click(screen.getByRole("button", { name: "Bake tangents" }));

    await waitFor(() => expect(bake).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByRole("button", { name: "Bake tangents" })).toBeTruthy());
    expect(invalidate).not.toHaveBeenCalled();
    expect(success).not.toHaveBeenCalled();

    bake.mockResolvedValue({ ok: true, value: mesh });
    fireEvent.click(screen.getByRole("button", { name: "Bake tangents" }));
    await waitFor(() => expect(success).toHaveBeenCalled());
  });
});
