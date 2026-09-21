import { useCallback, useState } from "react";

/**
 * One detached DOM node per key, created on first use and held for the caller's life.
 *
 * A portal into one of these mounts once, however often the frame around it is rebuilt,
 * and a `PortalSlot` moves the node to wherever the frame shows it now. A canvas moved
 * this way keeps its WebGL context and everything uploaded to it.
 */
export function usePortalHosts(): (key: string) => HTMLElement {
  const [hosts] = useState(() => new Map<string, HTMLElement>());
  return useCallback(
    (key: string) => {
      let host = hosts.get(key);
      if (host === undefined) {
        host = document.createElement("div");
        /* No box of its own, so what is portalled in lays out against the slot's parent. */
        host.style.display = "contents";
        host.dataset.ui = `PortalHost:${key}`;
        hosts.set(key, host);
      }
      return host;
    },
    [hosts],
  );
}

/** Where a `usePortalHosts` node shows, adopted on mount and let go on unmount. */
export function PortalSlot({ host }: { host: HTMLElement }) {
  const adopt = useCallback(
    (slot: HTMLDivElement) => {
      slot.append(host);
      return () => {
        /* The slot taking over may already hold it, when both commit together. */
        if (host.parentNode === slot) host.remove();
      };
    },
    [host],
  );
  return <div ref={adopt} className="contents" />;
}
