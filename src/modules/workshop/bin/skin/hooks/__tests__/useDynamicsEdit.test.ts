import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AppError, ValueEdit } from "@/lib/tauri";

import { MESH_PROPERTIES } from "../../utils/dynamicsFields";
import { type DynamicsSends, sendDynamics } from "../useDynamicsEdit";

const { edit } = vi.hoisted(() => ({ edit: vi.fn() }));

vi.mock("@/lib/tauri", () => ({ api: { bin: { edit } } }));
vi.mock("../../utils/dynamicsCalls", () => ({
  declaredCalls: () => [
    { kind: "remove", path: "aaaaaaaa[0]" },
    { kind: "remove", path: "aaaaaaaa[1]" },
  ],
}));

const ENTRY = "0x12345678";
const EDITS = [{ type: "removeItem", path: "aaaaaaaa[0]" }] as ValueEdit[];
const REFUSED = { code: "BIN_EDIT_REJECTED" } as AppError;

function sends() {
  const landed = vi.fn();
  const send = (async (call: (id: number) => Promise<unknown>) => ({
    result: await call(7),
    id: 7,
  })) as DynamicsSends["send"];

  return { send, landed };
}

describe("sendDynamics", () => {
  beforeEach(() => {
    edit.mockReset();
  });

  it("sends nothing for no edits", async () => {
    const through = sends();

    expect(await sendDynamics(through, ENTRY, false, [])).toBeNull();
    expect(edit).not.toHaveBeenCalled();
  });

  it("sends a document that saves its own bytes one edit of the mesh properties", async () => {
    edit.mockResolvedValue({ ok: true, value: null });
    const through = sends();

    const refused = await sendDynamics(through, ENTRY, false, EDITS);

    expect(refused).toBeNull();
    expect(edit).toHaveBeenCalledExactlyOnceWith(7, {
      kind: "editProperty",
      entry: ENTRY,
      holder: "",
      field: MESH_PROPERTIES,
      edits: EDITS,
    });
    expect(through.landed).toHaveBeenCalledExactlyOnceWith(7);
  });

  it("answers the refusal, and lands nothing", async () => {
    edit.mockResolvedValue({ ok: false, error: REFUSED });
    const through = sends();

    expect(await sendDynamics(through, ENTRY, false, EDITS)).toBe(REFUSED);
    expect(through.landed).not.toHaveBeenCalled();
  });

  it("sends a declared document its calls in order, and stops at the first refused", async () => {
    edit
      .mockResolvedValueOnce({ ok: true, value: null })
      .mockResolvedValueOnce({ ok: false, error: REFUSED });
    const through = sends();

    const refused = await sendDynamics(through, ENTRY, true, EDITS);

    const mesh = MESH_PROPERTIES.slice(2);
    expect(refused).toBe(REFUSED);
    expect(edit.mock.calls.map(([, wire]) => wire)).toEqual([
      { kind: "removeItem", entry: ENTRY, path: `${mesh}.aaaaaaaa[0]` },
      { kind: "removeItem", entry: ENTRY, path: `${mesh}.aaaaaaaa[1]` },
    ]);
    expect(through.landed).toHaveBeenCalledExactlyOnceWith(7);
  });
});
