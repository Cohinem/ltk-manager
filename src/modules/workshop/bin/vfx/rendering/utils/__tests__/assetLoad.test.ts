import { expect, it, vi } from "vitest";

import { assetLoad } from "../assetLoad";

it("counts failures as settled and ignores completions after disposal", () => {
  const report = vi.fn();
  const batch = assetLoad(3, report);
  batch.done();
  batch.done(true);
  expect(report).toHaveBeenLastCalledWith({ pending: 1, failed: 1 });
  batch.cancel();
  batch.done();
  expect(report).toHaveBeenCalledTimes(3);
});

it("makes an empty batch ready immediately", () => {
  const report = vi.fn();
  assetLoad(0, report);
  expect(report).toHaveBeenCalledWith({ pending: 0, failed: 0 });
});
