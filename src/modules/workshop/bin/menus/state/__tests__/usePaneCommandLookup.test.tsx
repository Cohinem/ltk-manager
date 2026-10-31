// @vitest-environment happy-dom
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";

import { createPaneCommandHub, PaneCommandsContext, usePaneCommandLookup } from "../paneCommands";

describe("usePaneCommandLookup", () => {
  it("returns a new function if a pane publishes after the first render", () => {
    const hub = createPaneCommandHub();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <PaneCommandsContext value={hub}>{children}</PaneCommandsContext>
    );
    const { result } = renderHook(() => usePaneCommandLookup(), { wrapper });
    const first = result.current;
    expect(first("fit")).toBeNull();

    const fit = { run: () => {} };
    act(() => hub.publish("viewport", { fit }));

    expect(result.current).not.toBe(first);
    expect(result.current("fit")).toBe(fit);
  });
});
