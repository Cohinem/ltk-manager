import { type ReactNode, useLayoutEffect, useRef, useState } from "react";

import { twMerge } from "@/utils";

import { Button, type ButtonSize } from "./Button";
import {
  segmentChosen,
  segmentRest,
  type SegmentSize,
  segmentThumb,
  segmentTrack,
  segmentTrackSize,
} from "./segment";

export interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
  /** Accessible name, required when the label is an icon. */
  name?: string;
}

export interface SegmentedControlProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** A control for the whole group, seated in the track behind a divider. */
  action?: ReactNode;
  /** The track's height, which is the height of the controls it sits beside: DS-SIZE. */
  size?: SegmentSize;
  /** The group's accessible name, where the options alone do not say what is chosen. */
  "aria-label"?: string;
  className?: string;
}

/* The track sets the height rather than the segments, so the border sits inside the
   box every other control in the row sits in. A segment is the button one step down,
   and takes h-full to drop the size class that would otherwise stop it stretching. */
const segmentButtonSize: Record<SegmentSize, ButtonSize> = {
  sm: "xs",
  md: "sm",
};

const segmentClass = `relative h-full rounded-sm ${segmentRest}`;

/** Where the thumb sits, in pixels from the track's padding edge. */
interface ThumbBox {
  left: number;
  width: number;
}

/**
 * A row of mutually exclusive choices sharing one inset track.
 *
 * It sets a value. A choice that shows a panel of its own is a `Tabs` list, whose `pills`
 * variant draws this same track.
 *
 * The chosen option sits on a thumb that slides to the next choice. The thumb is measured
 * from the chosen segment, so labels of any width and the trailing `action` keep working, and
 * it draws nothing until a first measure places it.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  action,
  size = "md",
  "aria-label": ariaLabel,
  className,
}: SegmentedControlProps<T>) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [thumb, setThumb] = useState<ThumbBox | null>(null);
  const [placed, setPlaced] = useState(false);

  useLayoutEffect(() => {
    const track = trackRef.current;
    if (!track) {
      return;
    }

    const measure = () => {
      const chosen = track.querySelector<HTMLElement>('[data-segment][aria-pressed="true"]');
      if (!chosen || chosen.offsetWidth === 0) {
        setThumb(null);
        return;
      }

      setThumb({ left: chosen.offsetLeft, width: chosen.offsetWidth });
    };

    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(track);
    return () => observer.disconnect();
  }, [value, options]);

  /* The first placement lands without sliding in from the track's edge. */
  useLayoutEffect(() => {
    if (thumb && !placed) {
      const frame = requestAnimationFrame(() => setPlaced(true));
      return () => cancelAnimationFrame(frame);
    }
  }, [thumb, placed]);

  return (
    <div
      ref={trackRef}
      className={twMerge(segmentTrack, segmentTrackSize[size], className)}
      role="group"
      aria-label={ariaLabel}
      data-ui="SegmentedControl"
    >
      {thumb && (
        <span
          aria-hidden
          className={twMerge(segmentThumb, placed && "transition-[transform,width] duration-200")}
          style={{ width: thumb.width, transform: `translateX(${thumb.left}px)` }}
        />
      )}

      {options.map((option) => (
        <Button
          key={option.value}
          data-segment
          variant="ghost"
          size={segmentButtonSize[size]}
          aria-pressed={option.value === value}
          aria-label={option.name}
          onClick={() => onChange(option.value)}
          className={twMerge(segmentClass, option.value === value && segmentChosen)}
        >
          {option.label}
        </Button>
      ))}

      {action && (
        <>
          <span className="my-1 w-px self-stretch bg-surface-600" aria-hidden />
          <span className="flex items-stretch *:h-full *:rounded-sm">{action}</span>
        </>
      )}
    </div>
  );
}
