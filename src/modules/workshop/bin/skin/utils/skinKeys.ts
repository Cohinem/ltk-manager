import type { SceneClock } from "@/modules/viewport";

import { speedDetent } from "../../vfx/playback/components/Transport";

/** The seconds one frame key moves the clip. */
const FRAME_SECONDS = 1 / 60;

/** How many frames Shift and an arrow move, which is a tenth of a second. */
export const SHIFT_FRAMES = 6;

/** What a key or a menu item reaches of a skin's preview. */
export interface SkinKeyTarget {
  readonly clock: Pick<SceneClock, "time" | "seek" | "restart">;
  readonly playing: boolean;
  readonly setPlaying: (playing: boolean) => void;
  readonly speed: number;
  readonly setSpeed: (speed: number) => void;
  readonly fit: () => void;
  /** The socket gizmo the keys of `SOCKET_KEYS` drive, and absent while none draws. */
  readonly socketGizmo?: SocketGizmoKeys | null;
}

/** What the keys of `SOCKET_KEYS` reach of the socket gizmo. */
export interface SocketGizmoKeys {
  readonly move: () => void;
  readonly turn: () => void;
  readonly toggleAxes: () => void;
}

/** One key of the preview: its `react-hotkeys-hook` name, its keycaps and its action. */
export interface SkinKey {
  readonly hotkey: string;
  readonly shortcut: string;
  readonly run: (target: SkinKeyTarget) => void;
}

export type SkinKeyId =
  | "play"
  | "restart"
  | "stepBack"
  | "stepForward"
  | "stepBackLong"
  | "stepForwardLong"
  | "slower"
  | "faster"
  | "fit";

/** Pauses and moves the clip by whole frames. */
function step(target: SkinKeyTarget, frames: number): void {
  target.setPlaying(false);
  target.clock.seek(target.clock.time + frames * FRAME_SECONDS);
}

/** The keys of the preview, which `useSkinKeys` and the Animation menu both read. */
export const SKIN_KEYS: Readonly<Record<SkinKeyId, SkinKey>> = {
  play: {
    hotkey: "space",
    shortcut: "Space",
    run: (target) => target.setPlaying(!target.playing),
  },
  restart: { hotkey: "home", shortcut: "Home", run: (target) => target.clock.restart() },
  stepBack: { hotkey: "left", shortcut: "Left", run: (target) => step(target, -1) },
  stepForward: { hotkey: "right", shortcut: "Right", run: (target) => step(target, 1) },
  stepBackLong: {
    hotkey: "shift+left",
    shortcut: "Shift+Left",
    run: (target) => step(target, -SHIFT_FRAMES),
  },
  stepForwardLong: {
    hotkey: "shift+right",
    shortcut: "Shift+Right",
    run: (target) => step(target, SHIFT_FRAMES),
  },
  slower: {
    hotkey: "bracketleft",
    shortcut: "[",
    run: (target) => target.setSpeed(speedDetent(target.speed, -1)),
  },
  faster: {
    hotkey: "bracketright",
    shortcut: "]",
    run: (target) => target.setSpeed(speedDetent(target.speed, 1)),
  },
  fit: { hotkey: "f", shortcut: "F", run: (target) => target.fit() },
};

/** The keys of the socket gizmo, the same keys that the map editor's gizmo takes. */
export const SOCKET_KEYS = {
  move: {
    hotkey: "w",
    shortcut: "W",
    run: (target) => target.socketGizmo?.move(),
  },
  turn: {
    hotkey: "e",
    shortcut: "E",
    run: (target) => target.socketGizmo?.turn(),
  },
  axes: {
    hotkey: "x",
    shortcut: "X",
    run: (target) => target.socketGizmo?.toggleAxes(),
  },
} as const satisfies Readonly<Record<string, SkinKey>>;

/** The key that shows the preview's controls again after Hide UI. */
export const SKIN_SHOW_UI_KEY = { key: "Escape", shortcut: "Esc" } as const;

/** Returns the entry of `SKIN_KEYS` that answers the `react-hotkeys-hook` name `hotkey`. */
export function skinKeyOf(hotkey: string): SkinKey | undefined {
  return [...Object.values(SKIN_KEYS), ...Object.values(SOCKET_KEYS)].find(
    (key) => key.hotkey === hotkey,
  );
}
