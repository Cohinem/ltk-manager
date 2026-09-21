import {
  type ReactNode,
  useCallback,
  useLayoutEffect,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";

import { ContentVisibilityContext, useContentVisible } from "@/hooks";

/** How the slots holding a host show it: in none, only hidden, or on screen. */
export type HostView = "unheld" | "hidden" | "shown";

/**
 * A detached DOM node that outlives the frames showing it, and how the slots show it.
 *
 * A portal into `node` mounts once, however often the frame around it is rebuilt, and a
 * `PortalSlot` moves the node to wherever the frame shows it now. A canvas moved this
 * way keeps its WebGL context and everything uploaded to it.
 */
export interface PortalHost {
  readonly node: HTMLElement;
  readonly view: () => HostView;
  readonly subscribe: (listener: () => void) => () => void;
  /** Record whether `slot` shows the node on screen, or with null that it let go. */
  readonly report: (slot: object, visible: boolean | null) => void;
}

function createPortalHost(key: string): PortalHost {
  const node = document.createElement("div");
  /* No box of its own, so what is portalled in lays out against the slot's parent. */
  node.style.display = "contents";
  node.dataset.ui = `PortalHost:${key}`;

  const slots = new Map<object, boolean>();
  const listeners = new Set<() => void>();
  let view: HostView = "unheld";

  return {
    node,
    view: () => view,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    report: (slot, visible) => {
      if (visible === null) slots.delete(slot);
      else slots.set(slot, visible);
      const next: HostView =
        slots.size === 0 ? "unheld" : [...slots.values()].some(Boolean) ? "shown" : "hidden";
      if (next === view) return;
      view = next;
      for (const listener of listeners) listener();
    },
  };
}

/** One portal host per key, created on first use and held for the caller's life. */
export function usePortalHosts(): (key: string) => PortalHost {
  const [hosts] = useState(() => new Map<string, PortalHost>());
  return useCallback(
    (key: string) => {
      let host = hosts.get(key);
      if (host === undefined) {
        host = createPortalHost(key);
        hosts.set(key, host);
      }
      return host;
    },
    [hosts],
  );
}

/** Where a host's node shows, adopted on mount, and as visible as the slot's own place. */
export function PortalSlot({ host }: { host: PortalHost }) {
  const visible = useContentVisible();
  const [slot] = useState(() => ({}));
  const adopt = useCallback(
    (element: HTMLDivElement) => {
      element.append(host.node);
      return () => {
        /* The slot taking over may already hold it, when both commit together. */
        if (host.node.parentNode === element) host.node.remove();
      };
    },
    [host],
  );
  useLayoutEffect(() => {
    host.report(slot, visible);
  }, [host, slot, visible]);
  useLayoutEffect(
    () => () => {
      host.report(slot, null);
    },
    [host, slot],
  );
  return <div ref={adopt} className="contents" />;
}

/**
 * What `host` carries, mounted while any slot holds the host and visible while one shows it.
 *
 * A frame swapping one slot for another commits both together, so the content never sees
 * the host unheld between them.
 */
export function HostedContent({ host, children }: { host: PortalHost; children: ReactNode }) {
  const view = useSyncExternalStore(host.subscribe, host.view);
  if (view === "unheld") return null;
  return createPortal(
    <ContentVisibilityContext value={view === "shown"}>{children}</ContentVisibilityContext>,
    host.node,
  );
}
