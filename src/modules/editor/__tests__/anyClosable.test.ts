import { anyClosable } from "../useCloseQueue";

describe("anyClosable", () => {
  it("takes an unpinned document", () => {
    expect(anyClosable(["a", "b"], ["a"])).toBe(true);
  });

  it("takes nothing from a batch that is pinned through", () => {
    expect(anyClosable(["a", "b"], ["a", "b"])).toBe(false);
  });

  it("takes nothing from an empty batch", () => {
    expect(anyClosable([], [])).toBe(false);
  });
});
