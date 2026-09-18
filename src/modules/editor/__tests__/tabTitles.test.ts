import { sharedTitles } from "../tabTitles";

describe("sharedTitles", () => {
  it("holds nothing while every title is its own", () => {
    expect(sharedTitles(["Alpha", "Beta", "Gamma"]).size).toBe(0);
  });

  it("holds a title two tabs take", () => {
    const shared = sharedTitles(["skin0.bin", "skin0.bin", "skin1.bin"]);

    expect([...shared]).toEqual(["skin0.bin"]);
  });

  it("holds a title three tabs take once", () => {
    const shared = sharedTitles(["skin0.bin", "skin0.bin", "skin0.bin"]);

    expect([...shared]).toEqual(["skin0.bin"]);
  });
});
