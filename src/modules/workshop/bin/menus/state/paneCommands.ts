import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from "react";

/** One command that a pane offers the menu bar of its object tab. */
export interface PaneCommand {
  /** Runs the command, or null while it does not apply. */
  readonly run: (() => void) | null;
  readonly checked?: boolean;
  /** The reason that a disabled command shows. */
  readonly reason?: string;
  /** The words of a command that depend on its target, such as "Delete emitter". */
  readonly title?: string;
}

/** The commands of one source, by command id. An absent command is not offered. */
export type PaneCommands = Readonly<Record<string, PaneCommand | undefined>>;

/** What an object tab holds the commands of its panes in. */
export interface PaneCommandHub {
  readonly publish: (source: string, commands: PaneCommands) => void;
  readonly withdraw: (source: string) => void;
  /** Marks `source` as the pane that a command with several offers acts on. */
  readonly focus: (source: string) => void;
  readonly resolve: (id: string) => PaneCommand | null;
  readonly subscribe: (listener: () => void) => () => void;
  /** A number that changes with each change of the commands, for `useSyncExternalStore`. */
  readonly version: () => number;
}

/**
 * Returns the offer of `id` that a command acts on, or null if no source offers it.
 *
 * The focused source wins if it offers `id`. Any other offer that can run wins over one that
 * cannot, so a pane that lost its selection does not disable the command of another pane.
 */
export function resolvePaneCommand(
  published: ReadonlyMap<string, PaneCommands>,
  focused: string | null,
  id: string,
): PaneCommand | null {
  const own = focused === null ? undefined : published.get(focused)?.[id];
  if (own !== undefined) return own;

  let idle: PaneCommand | null = null;
  for (const commands of published.values()) {
    const offer = commands[id];
    if (offer === undefined) continue;
    if (offer.run !== null) return offer;

    idle ??= offer;
  }

  return idle;
}

/** Returns a hub with no commands. */
export function createPaneCommandHub(): PaneCommandHub {
  const published = new Map<string, PaneCommands>();
  const listeners = new Set<() => void>();
  let focused: string | null = null;
  let version = 0;

  function changed() {
    version += 1;
    for (const listener of listeners) listener();
  }

  return {
    publish: (source, commands) => {
      published.set(source, commands);
      changed();
    },
    withdraw: (source) => {
      published.delete(source);
      if (focused === source) focused = null;
      changed();
    },
    focus: (source) => {
      if (focused === source) return;

      focused = source;
      changed();
    },
    resolve: (id) => resolvePaneCommand(published, focused, id),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    version: () => version,
  };
}

/** The hub of the enclosing object tab, or null outside one. */
export const PaneCommandsContext = createContext<PaneCommandHub | null>(null);

/** The handlers that mark a pane as the one a command with several offers acts on. */
export interface PaneFocusProps {
  readonly onFocusCapture: () => void;
  readonly onPointerDownCapture: () => void;
}

/**
 * Offers `commands` of `source` to the menu bar of the enclosing object tab while mounted.
 *
 * A command runs through the latest closure, so a fresh closure per render costs no publish. Only
 * a change of which commands run, or of a title, reason or check, publishes. Spread the returned
 * props on the pane root if another pane offers the same ids.
 */
export function usePaneCommands(source: string, commands: PaneCommands): PaneFocusProps {
  const hub = use(PaneCommandsContext);
  const latest = useRef(commands);
  latest.current = commands;

  const signature = commandSignature(commands);
  useEffect(() => {
    if (hub === null) return;

    hub.publish(
      source,
      bound(latest.current, () => latest.current),
    );
  }, [hub, source, signature]);

  useEffect(() => {
    if (hub === null) return;

    return () => hub.withdraw(source);
  }, [hub, source]);

  const focus = useCallback(() => hub?.focus(source), [hub, source]);

  return { onFocusCapture: focus, onPointerDownCapture: focus };
}

/**
 * Returns a function that reads the offer of a command id that a pane of the enclosing tab makes.
 *
 * The function changes with each change of the commands, because the React Compiler keeps a call
 * of it until its identity changes.
 */
export function usePaneCommandLookup(): (id: string) => PaneCommand | null {
  const hub = use(PaneCommandsContext);
  const version = useSyncExternalStore(hub?.subscribe ?? noSubscription, hub?.version ?? noVersion);

  return useMemo(() => lookupAt(hub, version), [hub, version]);
}

/** Returns a reader of `hub`, a new one for each `version` of its commands. */
function lookupAt(
  hub: PaneCommandHub | null,
  _version: number,
): (id: string) => PaneCommand | null {
  return (id) => hub?.resolve(id) ?? null;
}

function commandSignature(commands: PaneCommands): string {
  return Object.entries(commands)
    .filter(([, offer]) => offer !== undefined)
    .map(
      ([id, offer]) =>
        `${id}:${offer?.run === null ? 0 : 1}:${offer?.checked === true ? 1 : 0}:${offer?.reason ?? ""}:${offer?.title ?? ""}`,
    )
    .sort()
    .join("\u0001");
}

/** Returns `commands` with each `run` reading its closure from `read` when it is pressed. */
function bound(commands: PaneCommands, read: () => PaneCommands): PaneCommands {
  const offered: Record<string, PaneCommand> = {};
  for (const [id, offer] of Object.entries(commands)) {
    if (offer === undefined) continue;

    offered[id] = { ...offer, run: offer.run === null ? null : () => read()[id]?.run?.() };
  }

  return offered;
}

function noSubscription(): () => void {
  return () => {};
}

function noVersion(): number {
  return 0;
}
