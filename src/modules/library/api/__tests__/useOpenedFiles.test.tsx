// @vitest-environment happy-dom

import { act, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";

import { commandNames } from "@/test/commandNames";
import { mockInvoke, mockListen } from "@/test/mocks/tauri";

import { useOpenedFilesStore } from "../../state";
import { useOpenedFilesListener } from "../useOpenedFilesListener";
import { useOpenedModFiles } from "../useOpenedModFiles";

const navigate = vi.fn();

vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  useNavigate: () => navigate,
}));

type Handler = (event: { payload: unknown }) => void;

const handlers = new Map<string, Handler[]>();

function Harness({ onOpen }: { onOpen: (paths: string[]) => void }) {
  useOpenedFilesListener();
  useOpenedModFiles(onOpen);
  return null;
}

function pending(paths: string[]) {
  mockInvoke.mockImplementation((cmd: string) => {
    if (cmd === commandNames.links.takePendingOpenedFiles) {
      return Promise.resolve({ ok: true, value: { paths } });
    }
    return Promise.resolve({ ok: true, value: null });
  });
}

describe("opened mod files", () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    navigate.mockReset();
    handlers.clear();
    useOpenedFilesStore.setState({ paths: [] });
    (mockListen as Mock).mockImplementation((name: string, handler: Handler) => {
      handlers.set(name, [...(handlers.get(name) ?? []), handler]);
      return Promise.resolve(() => {});
    });
  });

  it("installs the files a cold start was launched with", async () => {
    pending(["C:\\mods\\a.fantome", "C:\\mods\\b.modpkg"]);
    const onOpen = vi.fn();

    render(<Harness onOpen={onOpen} />);

    await waitFor(() =>
      expect(onOpen).toHaveBeenCalledWith(["C:\\mods\\a.fantome", "C:\\mods\\b.modpkg"]),
    );
    expect(navigate).toHaveBeenCalledWith({ to: "/mods" });
    expect(useOpenedFilesStore.getState().paths).toEqual([]);
  });

  it("installs a batch Explorer opens while the app runs", async () => {
    pending([]);
    const onOpen = vi.fn();
    render(<Harness onOpen={onOpen} />);
    await waitFor(() => expect(handlers.has("files-opened")).toBe(true));

    await act(async () => {
      for (const handler of handlers.get("files-opened") ?? []) {
        handler({ payload: { paths: ["C:\\mods\\c.fantome"] } });
      }
    });

    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledWith(["C:\\mods\\c.fantome"]);
    expect(navigate).toHaveBeenCalledWith({ to: "/mods" });
  });

  it("stays put when nothing was opened", async () => {
    pending([]);
    const onOpen = vi.fn();

    render(<Harness onOpen={onOpen} />);

    await waitFor(() =>
      expect(
        mockInvoke.mock.calls.some(
          ([command]) => command === commandNames.links.takePendingOpenedFiles,
        ),
      ).toBe(true),
    );
    expect(onOpen).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });
});
