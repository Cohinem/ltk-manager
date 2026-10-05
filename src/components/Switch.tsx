import { Switch as BaseSwitch } from "@base-ui/react/switch";
import { forwardRef, type ReactNode, use, useId } from "react";

import { twMerge } from "@/utils";

import { focusRing } from "./focus";
import { InputDefaultContext } from "./InputDefaultContext";

export interface SwitchProps extends Omit<BaseSwitch.Root.Props, "className"> {
  /** Drawn beside the switch, and its accessible name. */
  label?: ReactNode;
  /** A line under the label. */
  description?: ReactNode;
  className?: string;
}

const trackClass = "h-5 w-9";
const thumbClass = "top-1 left-1 size-3 data-[checked]:translate-x-4";

/**
 * A setting that is on or off, and takes effect as it is flipped.
 *
 * With a `label` the switch draws inside a `label` element, the text after it, as `Checkbox`
 * does. Without one it is the bare track, named by `aria-label` or by the `Field.Root` it sits
 * in.
 */
export const Switch = forwardRef<HTMLSpanElement, SwitchProps>(
  ({ label, description, className, disabled, ...props }, ref) => {
    const implicit = use(InputDefaultContext);
    const labelId = useId();

    const track = (
      <BaseSwitch.Root
        ref={ref}
        disabled={disabled}
        {...(label && { "aria-labelledby": labelId })}
        className={twMerge(
          "relative inline-flex shrink-0 cursor-pointer rounded-md transition-colors",
          "bg-surface-700 data-[checked]:bg-accent-500",
          focusRing,
          "data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50",
          trackClass,
          implicit &&
            "border border-dashed border-surface-veil bg-transparent hover:border-accent-hover data-[checked]:bg-transparent",
          /* The label dims the whole line, so the track does not dim twice. */
          label && "data-[disabled]:opacity-100",
          !label && className,
        )}
        {...props}
      >
        {/* The knob inverts with the theme on purpose: DS-INVARIANT. The scale is
            optical, not a size change: DS-POLARITY. */}
        <BaseSwitch.Thumb
          className={twMerge(
            "absolute rounded-md transition",
            "bg-surface-400 data-[checked]:scale-110 data-[checked]:bg-surface-900",
            thumbClass,
            implicit && "data-[checked]:bg-surface-400",
          )}
        />
      </BaseSwitch.Root>
    );

    if (!label) return track;

    return (
      <label
        className={twMerge(
          "inline-flex cursor-pointer items-start gap-3",
          disabled && "cursor-not-allowed opacity-50",
          className,
        )}
      >
        {track}
        <span className="flex min-w-0 flex-col">
          <span id={labelId} className="text-sm text-surface-100">
            {label}
          </span>
          {description && <span className="mt-0.5 text-xs text-surface-400">{description}</span>}
        </span>
      </label>
    );
  },
);
Switch.displayName = "Switch";
