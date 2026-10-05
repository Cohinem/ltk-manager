import { Radio } from "@base-ui/react/radio";
import { RadioGroup as BaseRadioGroup, type RadioGroupProps } from "@base-ui/react/radio-group";
import { forwardRef, type ReactNode, useId } from "react";

import { twMerge } from "@/utils";

import { focusRing } from "./focus";

export interface RadioGroupRootProps extends Omit<RadioGroupProps, "className"> {
  /** Drawn above the options, and the group's accessible name. */
  label?: ReactNode;
  className?: string;
  children?: ReactNode;
}

/**
 * A choice of one among options that are all on screen.
 *
 * The options are `Card`s, each with a title and a line of description, or `Item`s, each a
 * mark beside a label. `Options` lays them out. A group without a `label` takes `aria-label`,
 * or its name from the `Field.Root` it sits in.
 */
export const RadioGroupRoot = forwardRef<HTMLDivElement, RadioGroupRootProps>(
  ({ label, className, children, ...props }, ref) => {
    const labelId = useId();

    return (
      <BaseRadioGroup
        ref={ref}
        {...(label && { "aria-labelledby": labelId })}
        className={twMerge("flex flex-col gap-2", className)}
        {...props}
      >
        {label && (
          <span id={labelId} className="text-sm font-medium text-surface-200">
            {label}
          </span>
        )}
        {children}
      </BaseRadioGroup>
    );
  },
);
RadioGroupRoot.displayName = "RadioGroup.Root";

export interface RadioGroupOptionsProps {
  className?: string;
  children?: ReactNode;
  orientation?: "horizontal" | "vertical";
}

export function RadioGroupOptions({
  className,
  children,
  orientation = "horizontal",
}: RadioGroupOptionsProps) {
  return (
    <div className={twMerge("flex gap-3", orientation === "vertical" && "flex-col", className)}>
      {children}
    </div>
  );
}

export interface RadioGroupCardProps extends Omit<Radio.Root.Props, "className" | "children"> {
  title: string;
  description?: string;
  /** Sits beside the title - a status chip on the option itself, not on its text. */
  badge?: ReactNode;
  className?: string;
}

export const RadioGroupCard = forwardRef<HTMLButtonElement, RadioGroupCardProps>(
  ({ title, description, badge, className, ...props }, ref) => {
    return (
      <Radio.Root
        ref={ref}
        className={twMerge(
          "flex-1 cursor-pointer rounded-lg border p-3 text-left transition-colors",
          /* DS-HOVER */
          "border-surface-600 hover:border-accent-hover",
          "data-[checked]:border-accent-500 data-[checked]:bg-accent-500/10",
          focusRing,
          "data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50",
          className,
        )}
        {...props}
      >
        <div className="flex items-center gap-2">
          <span className="font-medium text-surface-100">{title}</span>
          {badge}
        </div>
        {description && <div className="text-xs text-surface-400">{description}</div>}
      </Radio.Root>
    );
  },
);
RadioGroupCard.displayName = "RadioGroup.Card";

export interface RadioGroupItemProps extends Omit<Radio.Root.Props, "className" | "children"> {
  label?: ReactNode;
  description?: string;
  className?: string;
}

export const RadioGroupItem = forwardRef<HTMLButtonElement, RadioGroupItemProps>(
  ({ label, description, className, ...props }, ref) => {
    return (
      <Radio.Root
        ref={ref}
        className={twMerge(
          "group flex cursor-pointer items-start gap-3",
          "focus-visible:outline-none",
          "data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50",
          className,
        )}
        {...props}
      >
        <Radio.Indicator
          keepMounted
          className={twMerge(
            "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors",
            "border-surface-600 bg-surface-800",
            /* DS-HOVER */
            "group-hover:border-accent-hover",
            /* DS-FOCUS, drawn on the mark while the row holds the focus. */
            "outline-accent-500 group-focus-visible:outline-2 group-focus-visible:outline-offset-2",
            "group-data-[checked]:border-accent-600 group-data-[checked]:bg-accent-600",
          )}
        >
          <span className="hidden size-2 rounded-full bg-on-accent group-data-[checked]:block" />
        </Radio.Indicator>
        {(label || description) && (
          <div className="flex flex-col">
            {label && <span className="text-sm text-surface-100">{label}</span>}
            {description && <span className="text-xs text-surface-400">{description}</span>}
          </div>
        )}
      </Radio.Root>
    );
  },
);
RadioGroupItem.displayName = "RadioGroup.Item";

/**
 * One choice from a few options that each take a line of their own.
 *
 * Options short enough to share a row are a `SegmentedControl`, and a longer list is a
 * `Select`.
 */
export const RadioGroup = {
  Root: RadioGroupRoot,
  Options: RadioGroupOptions,
  Card: RadioGroupCard,
  Item: RadioGroupItem,
};
