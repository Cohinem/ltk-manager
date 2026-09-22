// @vitest-environment happy-dom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { nameHash } from "../../../bin/shared/utils/binHash";
import type { ObjectRowNode } from "../../utils/objectTree";
import { ObjectsGrid } from "../ObjectsGrid";

const state = vi.hoisted(() => ({
  reduced: false,
  visible: true,
  row: 0,
  width: 180,
  images: new Map<string, (image: string | null) => void>(),
  open: vi.fn(),
  virtualizer: {
    measure: vi.fn(),
    scrollToIndex: vi.fn(),
    getTotalSize: () => 472,
    getVirtualItems: (): { index: number; key: number; start: number }[] => [],
  },
}));

vi.mock("@/hooks", async (original) => ({
  ...(await original<typeof import("@/hooks")>()),
  useContentVisible: () => state.visible,
  useReducedMotion: () => state.reduced,
  useZoomedPx: () => (value: number) => value,
}));
vi.mock("@tanstack/react-virtual", () => ({ useVirtualizer: () => state.virtualizer }));
vi.mock("../../../explorer/components/ExplorerSurface", () => ({
  useMeasuredWidth: () => state.width,
}));
vi.mock("../../hooks/useOpenObjectNode", () => ({ useOpenObjectNode: () => state.open }));
vi.mock("../ObjectsContextMenu", () => ({ ObjectsContextMenu: () => null }));
vi.mock("../ObjectPreviewWorker", () => ({
  default: ({
    node,
    onImage,
  }: {
    node: ObjectRowNode | null;
    onImage: (image: string | null) => void;
  }) => {
    if (node === null) return null;
    state.images.set(node.name, onImage);
    return <output data-testid="worker">{node.name}</output>;
  },
}));

function node(name: string): ObjectRowNode {
  return {
    type: "object",
    id: name,
    path: name,
    name,
    objectHash: name,
    unnamed: false,
    layers: [],
    count: 0,
    children: [],
    declarations: [
      {
        asset: { kind: "gameChunk", wad: "test.wad.client", pathHash: name },
        file: "test.bin",
        class: "VfxSystemDefinitionData",
        classHash: nameHash("VfxSystemDefinitionData"),
      },
    ],
  };
}

const nodes = [node("First effect"), node("Second effect")];
const noop = () => {};
const grid = (thumbnails = true) => (
  <ObjectsGrid nodes={nodes} thumbnails={thumbnails} onDescend={noop} onUp={noop} />
);

beforeEach(() => {
  vi.useFakeTimers();
  state.row = 0;
  state.visible = true;
  state.reduced = false;
  state.width = 180;
  state.images.clear();
  state.virtualizer.getVirtualItems = () => [
    { index: state.row, key: state.row, start: state.row * 236 },
  ];
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

async function settle() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}

it("does no rendering until thumbnails are requested and releases the worker when disabled", async () => {
  const { rerender } = render(grid(false));
  expect(screen.queryByTestId("worker")).toBeNull();

  rerender(grid());
  await settle();
  expect(screen.getByTestId("worker")).toHaveTextContent("First effect");
  act(() => state.images.get("First effect")!("data:image/webp;base64,first"));
  expect(screen.queryByTestId("worker")).toBeNull();
  expect(
    screen
      .getByRole("button", { name: "First effect VfxSystemDefinitionData" })
      .querySelector("img"),
  ).not.toBeNull();

  rerender(grid(false));
  expect(screen.queryByTestId("worker")).toBeNull();
});

it("discards obsolete captures after scrolling and queues only the visible row", async () => {
  const { rerender } = render(grid());
  await settle();
  const obsolete = state.images.get("First effect")!;

  state.row = 1;
  rerender(grid());
  expect(screen.getByTestId("worker")).toHaveTextContent("Second effect");
  act(() => obsolete("data:image/webp;base64,obsolete"));
  expect(screen.getByTestId("worker")).toHaveTextContent("Second effect");

  state.row = 0;
  rerender(grid());
  expect(screen.getByTestId("worker")).toHaveTextContent("First effect");
});

it("plays a focused particle after a dwell and stops it for reduced motion or hidden content", async () => {
  const { rerender } = render(grid());
  await settle();
  act(() => state.images.get("First effect")!("data:image/webp;base64,first"));
  fireEvent.focus(screen.getByRole("button", { name: "First effect VfxSystemDefinitionData" }));
  expect(screen.queryByTestId("worker")).toBeNull();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(180);
  });
  expect(screen.getByTestId("worker")).toHaveTextContent("First effect");

  state.reduced = true;
  rerender(grid());
  expect(screen.queryByTestId("worker")).toBeNull();
  state.visible = false;
  rerender(grid());
  expect(screen.queryByTestId("worker")).toBeNull();
});

it("keeps playback in a large popover across the tile-to-popup gap and closes on leave", async () => {
  render(grid());
  await settle();
  act(() => state.images.get("First effect")!("data:image/webp;base64,first"));
  const tile = screen.getByRole("button", { name: "First effect VfxSystemDefinitionData" });
  fireEvent.pointerEnter(tile);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(180);
  });
  const worker = screen.getByTestId("worker");
  const popup = screen.getByRole("dialog", { name: "First effect" });
  expect(tile.contains(worker)).toBe(false);
  expect(popup.contains(worker)).toBe(true);
  expect(popup).toHaveClass("w-96");
  act(() => state.images.get("First effect")!("data:image/webp;base64,live"));
  fireEvent.pointerLeave(tile);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(100);
  });
  fireEvent.pointerEnter(popup);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(60_000);
  });
  expect(screen.getByTestId("worker")).toBe(worker);

  fireEvent.pointerLeave(popup);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(180);
  });
  expect(screen.queryByTestId("worker")).toBeNull();
  expect(tile.querySelector("img")).not.toBeNull();
});

it("scrolls and focuses a revealed tile without opening it, including a repeated reveal", async () => {
  state.width = 300;
  const settled = vi.fn();
  const { rerender } = render(
    <ObjectsGrid
      nodes={nodes}
      thumbnails={false}
      onDescend={noop}
      onUp={noop}
      reveal={{ path: nodes[1]!.id, token: 1 }}
      onRevealed={settled}
    />,
  );
  await act(async () => {
    await vi.advanceTimersByTimeAsync(40);
  });
  const tile = screen.getByRole("button", { name: "Second effect VfxSystemDefinitionData" });
  expect(tile).toHaveFocus();
  expect(settled).toHaveBeenCalledWith(1);
  expect(state.open).not.toHaveBeenCalled();

  rerender(
    <ObjectsGrid
      nodes={nodes}
      thumbnails={false}
      onDescend={noop}
      onUp={noop}
      reveal={{ path: nodes[1]!.id, token: 2 }}
      onRevealed={settled}
    />,
  );
  await act(async () => {
    await vi.advanceTimersByTimeAsync(40);
  });
  expect(settled).toHaveBeenLastCalledWith(2);
  expect(tile).toHaveFocus();
});

it("retries a failed still on hover and dismisses the popover with Escape", async () => {
  render(grid());
  await settle();
  act(() => state.images.get("First effect")!(null));
  const tile = screen.getByRole("button", { name: "First effect VfxSystemDefinitionData" });
  fireEvent.pointerEnter(tile);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(180);
  });
  expect(screen.getByRole("dialog", { name: "First effect" })).toBeInTheDocument();
  expect(screen.getByTestId("worker")).toHaveTextContent("First effect");
  act(() => state.images.get("First effect")!("data:image/webp;base64,recovered"));
  expect(tile.querySelector("img")).toHaveAttribute("src", "data:image/webp;base64,recovered");
  fireEvent.keyDown(screen.getByRole("dialog", { name: "First effect" }), { key: "Escape" });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(300);
  });
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.queryByTestId("worker")).toBeNull();
});

it("settles an unanswered preview once and keeps opening the object available", async () => {
  render(grid());
  await settle();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(15_000);
  });
  expect(screen.queryByTestId("worker")).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: "First effect VfxSystemDefinitionData" }));
  expect(state.open).toHaveBeenCalledWith(nodes[0], "default");
});

it("loads two previews concurrently and keeps the unfinished slot when another completes", async () => {
  state.width = 600;
  const many = [...nodes, node("Third effect"), node("Fourth effect")];
  render(<ObjectsGrid nodes={many} thumbnails onDescend={noop} onUp={noop} />);
  await settle();
  expect(screen.getAllByTestId("worker").map((worker) => worker.textContent)).toEqual([
    "First effect",
    "Second effect",
  ]);
  const second = screen.getAllByTestId("worker")[1];

  act(() => state.images.get("First effect")!("data:image/webp;base64,first"));
  expect(screen.getAllByTestId("worker").map((worker) => worker.textContent)).toEqual([
    "Third effect",
    "Second effect",
  ]);
  expect(screen.getAllByTestId("worker")[1]).toBe(second);
});

it("shows failed previews and retries without discarding completed stills", async () => {
  state.width = 300;
  render(grid());
  await settle();
  act(() => {
    state.images.get("First effect")!(null);
    state.images.get("Second effect")!("data:image/webp;base64,second");
  });
  expect(
    screen.getByRole("button", { name: "First effect VfxSystemDefinitionData" }),
  ).toHaveAttribute("aria-description", "Preview unavailable");
  fireEvent.click(screen.getByRole("button", { name: "Retry previews" }));
  expect(screen.getByTestId("worker")).toHaveTextContent("First effect");
  expect(
    screen
      .getByRole("button", { name: "Second effect VfxSystemDefinitionData" })
      .querySelector("img"),
  ).not.toBeNull();
});

it("keeps child navigation separate from opening an object and uses compact tile widths", () => {
  const descend = vi.fn();
  const parent = { ...nodes[0]!, count: 12 };
  render(<ObjectsGrid nodes={[parent]} thumbnails={false} onDescend={descend} onUp={noop} />);
  fireEvent.click(screen.getByRole("button", { name: "Browse 12 children" }));
  expect(descend).toHaveBeenCalledWith(parent.id);
  expect(state.open).not.toHaveBeenCalled();
  expect(screen.getByRole("row")).toHaveStyle({
    gridTemplateColumns: "repeat(1, minmax(0, 128px))",
  });
  expect(
    screen
      .getByRole("button", { name: "Browse 12 children" })
      .closest("button")
      ?.parentElement?.closest("button"),
  ).toBeNull();
});
