export interface AssetLoad {
  readonly pending: number;
  readonly failed: number;
}

/** Completion of one asset batch, including failures and unmount cancellation. */
export function assetLoad(total: number, report?: (load: AssetLoad) => void) {
  let pending = total;
  let failed = 0;
  let live = true;
  report?.({ pending, failed });
  return {
    done(error = false) {
      if (!live) return;
      pending -= 1;
      if (error) failed += 1;
      report?.({ pending, failed });
    },
    cancel() {
      live = false;
    },
  };
}
