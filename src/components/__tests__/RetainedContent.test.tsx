// @vitest-environment happy-dom

import { cleanup, render, screen } from "@testing-library/react";
import { useEffect, useState } from "react";
import { afterEach, expect, it, vi } from "vitest";

import { useContentVisible } from "@/hooks";

import { RetainedContent } from "../RetainedContent";

afterEach(cleanup);

it("retains a visited pane and propagates ancestor visibility", () => {
  const mount = vi.fn();
  const dispose = vi.fn();
  function Content() {
    const visible = useContentVisible();
    const [identity] = useState(() => crypto.randomUUID());
    useEffect(() => {
      mount();
      return dispose;
    }, []);
    return (
      <output data-testid="content" data-visible={visible}>
        {identity}
      </output>
    );
  }
  const view = (outer: boolean, inner: boolean) => (
    <RetainedContent active={outer}>
      <RetainedContent active={inner} defer>
        <Content />
      </RetainedContent>
    </RetainedContent>
  );
  const { rerender, unmount } = render(view(true, false));
  expect(mount).not.toHaveBeenCalled();
  rerender(view(true, true));
  const node = screen.getByTestId("content");
  const identity = node.textContent;
  expect(node).toHaveAttribute("data-visible", "true");
  rerender(view(false, true));
  expect(node).toHaveAttribute("data-visible", "false");
  rerender(view(true, false));
  expect(node).toHaveAttribute("data-visible", "false");
  rerender(view(true, true));
  expect(node.textContent).toBe(identity);
  expect(node).toHaveAttribute("data-visible", "true");
  expect(mount).toHaveBeenCalledTimes(1);
  expect(dispose).not.toHaveBeenCalled();
  unmount();
  expect(dispose).toHaveBeenCalledTimes(1);
});
