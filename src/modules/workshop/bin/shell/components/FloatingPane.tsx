import { DotsSixVerticalIcon, SidebarSimpleIcon, XIcon } from "@phosphor-icons/react";
import {
  type PointerEvent,
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { IconButton, OVERLINE } from "@/components";
import { m } from "@/i18n";
import { twMerge } from "@/utils";

import { clampInto, placeBeside, type Point } from "../utils/floatPlace";

/** The size a frame opens at, which a drag on its corner changes: a pane of rows, or a viewport. */
const OPEN_SIZE = { rows: "h-80 w-[34rem]", viewport: "h-[28rem] w-[40rem]" } as const;

interface FloatingPaneProps {
  title: string;
  /** The pane draws a viewport, so its frame opens larger. */
  viewport?: boolean;
  /** The pane's own strip controls, drawn after its title. */
  actions?: ReactNode;
  /** The shell the frame floats over and stays inside. It is positioned against this box. */
  bounds: RefObject<HTMLElement | null>;
  /** Where the reader last pressed, on the window, which the frame first opens beside. */
  pressed: RefObject<Point | null>;
  /** Where the reader last left the frame, and where to keep it. It opens there again. */
  rest: Point | undefined;
  onRest: (place: Point) => void;
  /** A press anywhere on the frame, which brings it in front of the others. */
  onPress: () => void;
  onDock: () => void;
  onClose: () => void;
  /** The slot the pane's body is drawn into. */
  children: ReactNode;
}

/**
 * One pane of a shell in a floating frame over its tree, per "A pane floats" in
 * docs/ux/BIN_EDITOR.md.
 *
 * It stays open until its Close, moves by its header, sizes by its corner and stays inside
 * the shell.
 */
export function FloatingPane({
  title,
  viewport = false,
  actions,
  bounds,
  pressed,
  rest,
  onRest,
  onPress,
  onDock,
  onClose,
  children,
}: FloatingPaneProps) {
  const frame = useRef<HTMLDivElement>(null);
  const grip = useRef<Point | null>(null);
  const [place, setPlace] = useState<Point | null>(null);

  /** `next` kept inside the shell, at the frame's size now. */
  const inside = useCallback(
    (next: Point): Point => {
      const box = bounds.current;
      const own = frame.current;
      if (box === null || own === null) return next;

      return clampInto(
        next,
        { width: box.clientWidth, height: box.clientHeight },
        { width: own.offsetWidth, height: own.offsetHeight },
      );
    },
    [bounds],
  );

  /* Once, as the frame opens: where it was left, else beside the press that opened it. */
  const opened = useRef(false);
  useLayoutEffect(() => {
    const box = bounds.current;
    if (opened.current || box === null) return;
    opened.current = true;
    if (rest !== undefined) {
      setPlace(inside(rest));
      return;
    }

    const rect = box.getBoundingClientRect();
    const at = pressed.current;
    const pointer = at === null ? null : { x: at.x - rect.left, y: at.y - rect.top };
    const own = frame.current;
    setPlace(
      placeBeside(
        pointer,
        { width: box.clientWidth, height: box.clientHeight },
        { width: own?.offsetWidth ?? 0, height: own?.offsetHeight ?? 0 },
      ),
    );
  }, [bounds, pressed, rest, inside]);

  /* A shell that shrinks would leave the frame past its edge. */
  useEffect(() => {
    const box = bounds.current;
    if (box === null) return;

    const observer = new ResizeObserver(() => {
      setPlace((held) => (held === null ? held : inside(held)));
    });
    observer.observe(box);
    return () => observer.disconnect();
  }, [bounds, inside]);

  const startDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (place === null || event.button !== 0) return;
    if ((event.target as HTMLElement).closest("button") !== null) return;

    event.currentTarget.setPointerCapture(event.pointerId);
    grip.current = { x: event.clientX - place.x, y: event.clientY - place.y };
  };

  const drag = (event: PointerEvent<HTMLDivElement>) => {
    const held = grip.current;
    if (held === null) return;

    setPlace(inside({ x: event.clientX - held.x, y: event.clientY - held.y }));
  };

  const endDrag = () => {
    if (grip.current !== null && place !== null) onRest(place);
    grip.current = null;
  };

  return (
    <div
      ref={frame}
      data-ui="FloatingPane"
      role="dialog"
      aria-label={title}
      /* DS-GROUND, DS-RADIUS. Solid, since a pane is read over the panes that move under it. */
      className={twMerge(
        "absolute z-30 flex max-h-[calc(100%-1rem)] min-h-56 max-w-[calc(100%-1rem)] min-w-88 resize flex-col overflow-hidden rounded-xl border border-surface-700 bg-surface-800 shadow-xl",
        viewport ? OPEN_SIZE.viewport : OPEN_SIZE.rows,
        place === null && "invisible",
      )}
      style={{ left: place?.x ?? 0, top: place?.y ?? 0 }}
      onPointerDownCapture={onPress}
    >
      <div
        className="flex h-7 shrink-0 cursor-grab touch-none items-center gap-1 border-b border-surface-700 pr-1 pl-1.5 select-none active:cursor-grabbing"
        onPointerDown={startDrag}
        onPointerMove={drag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <DotsSixVerticalIcon weight="bold" aria-hidden className="size-3.5 text-surface-500" />
        <span className={twMerge(OVERLINE, "shrink-0 font-sans")}>{title}</span>
        <div className="flex h-full min-w-0 flex-1 items-center justify-end">{actions}</div>
        <IconButton
          variant="ghost"
          size="row"
          muted
          icon={<SidebarSimpleIcon />}
          label={m.workshop_bin_panes_dock_action()}
          onClick={onDock}
        />
        <IconButton
          variant="ghost"
          size="row"
          muted
          icon={<XIcon />}
          label={m.common_close_action()}
          onClick={onClose}
        />
      </div>
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {children}
      </div>
    </div>
  );
}
