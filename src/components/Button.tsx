import { Button as BaseButton } from "@base-ui/react";
import { IconContext } from "@phosphor-icons/react";
import { Loader2 } from "lucide-react";
import { forwardRef, type ReactNode } from "react";
import { match } from "ts-pattern";

import { twMerge } from "@/utils";

import { Tooltip, type TooltipProps } from "./Tooltip";

export type ButtonVariant =
  | "default"
  | "filled"
  | "danger" // TODO: `danger` should not be a variant, it should be a color modifier over any of the other ones
  | "light"
  | "duotone"
  | "outline"
  | "ghost"
  | "transparent";

export type ButtonSize = "xs" | "sm" | "md" | "lg" | "xl";

export interface ButtonProps extends Omit<BaseButton.Props, "className" | "children"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  compact?: boolean;
  left?: ReactNode;
  right?: ReactNode;
  children?: ReactNode;
  className?: string;
}

const sizeClasses: Record<ButtonSize, string> = {
  xs: "h-7 px-2 text-xs gap-1",
  sm: "h-8 px-3 text-sm gap-1.5",
  md: "h-9 px-4 text-sm gap-2",
  lg: "h-10 px-5 text-base gap-2",
  xl: "h-12 px-6 text-lg gap-2.5",
};

const compactSizeClasses: Record<ButtonSize, string> = {
  xs: "h-6 px-1.5 text-xs gap-1",
  sm: "h-7 px-2 text-xs gap-1",
  md: "h-8 px-3 text-sm gap-1.5",
  lg: "h-9 px-4 text-sm gap-2",
  xl: "h-10 px-5 text-base gap-2",
};

const iconOnlySizeClasses: Record<ButtonSize, string> = {
  xs: "size-7",
  sm: "size-8",
  md: "size-9",
  lg: "size-10",
  xl: "size-12",
};

const compactIconOnlySizeClasses: Record<ButtonSize, string> = {
  xs: "size-6",
  sm: "size-7",
  md: "size-8",
  lg: "size-9",
  xl: "size-10",
};

const variantClasses: Record<ButtonVariant, string> = {
  default: "bg-surface-700 text-surface-100 hover:bg-surface-600 active:bg-surface-800",
  filled: "bg-accent-600 text-on-accent hover:bg-accent-500 active:bg-accent-700",
  danger: "bg-danger-strong text-brand-on hover:bg-danger active:brightness-90",
  light: "bg-accent-500/25 text-accent-300 hover:bg-accent-500/35 active:bg-accent-500/45",
  /* Two tints of one hue: a wash to sit in, and an edge to be found by. */
  duotone:
    "bg-accent-500/15 text-accent-400 border border-accent-400/50 hover:bg-accent-500/25 active:bg-accent-500/35",
  /* Edge and hover both from the veil: DS-VEIL. */
  outline:
    "bg-transparent text-surface-200 border border-surface-veil-strong hover:bg-surface-veil active:bg-surface-veil-strong",
  ghost: "bg-transparent text-surface-200 hover:bg-surface-veil active:bg-surface-veil-strong",
  transparent: "bg-transparent text-surface-300 hover:text-surface-100",
};

const baseClasses =
  "inline-flex items-center justify-center font-medium rounded-md transition-colors duration-150 cursor-pointer select-none focus-visible:outline-accent-500 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none";

const spinnerSizeClasses: Record<ButtonSize, string> = {
  xs: "text-sm",
  sm: "text-base",
  md: "text-lg",
  lg: "text-xl",
  xl: "text-2xl",
};

const iconSlotSizeClasses: Record<ButtonSize, string> = {
  xs: "size-4",
  sm: "size-4",
  md: "size-4",
  lg: "size-5",
  xl: "size-5",
};

function IconSlot({ children, size }: { children: ReactNode; size: ButtonSize }) {
  return (
    <span
      className={twMerge(
        "inline-flex shrink-0 items-center justify-center",
        iconSlotSizeClasses[size],
      )}
    >
      {children}
    </span>
  );
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "default",
      size = "md",
      loading = false,
      compact = false,
      left: leftIcon,
      right: rightIcon,
      children,
      className,
      disabled,
      ...props
    },
    ref,
  ) => {
    const isIconOnly = !children && !!(leftIcon || rightIcon);
    const icon = isIconOnly ? leftIcon || rightIcon : null;

    const sizeClass = match([isIconOnly, compact] as const)
      .with([true, true], () => compactIconOnlySizeClasses[size])
      .with([true, false], () => iconOnlySizeClasses[size])
      .with([false, true], () => compactSizeClasses[size])
      .with([false, false], () => sizeClasses[size])
      .exhaustive();

    const classes = twMerge(baseClasses, variantClasses[variant], sizeClass, className);

    const content = match([loading, isIconOnly] as const)
      .with([true, true], [true, false], () => (
        <>
          <span className="animate-fade-in">
            <Loader2 className={twMerge("animate-spin", spinnerSizeClasses[size])} />
          </span>
          {children}
        </>
      ))
      .with([false, true], () => <IconSlot size={size}>{icon}</IconSlot>)
      .with([false, false], () => (
        <>
          {leftIcon && <IconSlot size={size}>{leftIcon}</IconSlot>}
          {children}
          {rightIcon && <IconSlot size={size}>{rightIcon}</IconSlot>}
        </>
      ))
      .exhaustive();

    return (
      <BaseButton ref={ref} className={classes} disabled={disabled || loading} {...props}>
        {content}
      </BaseButton>
    );
  },
);

Button.displayName = "Button";

export type IconButtonSize = ButtonSize | "row";

export interface IconButtonProps extends Omit<ButtonProps, "children" | "left" | "right" | "size"> {
  icon: ReactNode;
  size?: IconButtonSize;
  /** The accessible name, shown as the tooltip unless `tooltip` replaces it. */
  label?: string;
  /** Tooltip content in place of `label`, or `false` for none. */
  tooltip?: ReactNode;
  tooltipSide?: TooltipProps["side"];
  /** A toggle's state, set as `aria-pressed` and shown as the accent fill. */
  pressed?: boolean;
}

const iconPixels: Record<IconButtonSize, number> = {
  row: 14,
  xs: 16,
  sm: 16,
  md: 16,
  lg: 20,
  xl: 20,
};

/* A button inside a row: smaller than any toolbar size, DS-VEIL and DS-RADIUS. */
const rowClasses = "size-5 rounded-sm";

const pressedClasses =
  "aria-pressed:bg-accent-500/15 aria-pressed:text-accent-300 aria-pressed:hover:bg-accent-500/25";

/**
 * A square button showing one icon, ghost and compact `xs` unless told otherwise.
 *
 * The icon takes the bold weight and the size's pixel size from phosphor's `IconContext`, so a
 * call site passes the bare glyph. `label` is both the accessible name and the tooltip. `row` is
 * the 20px size for actions inside a tree or list row.
 */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  (
    {
      icon,
      variant = "ghost",
      size = "xs",
      compact = true,
      label,
      tooltip,
      tooltipSide,
      pressed,
      className,
      "aria-label": ariaLabel,
      ...props
    },
    ref,
  ) => {
    const glyph = (
      <IconContext.Provider value={{ weight: "bold", size: iconPixels[size] }}>
        {icon}
      </IconContext.Provider>
    );

    const button = (
      <Button
        ref={ref}
        variant={variant}
        size={size === "row" ? "xs" : size}
        compact={compact}
        left={glyph}
        aria-label={label ?? ariaLabel}
        aria-pressed={pressed}
        className={twMerge(
          size === "row" && rowClasses,
          pressed !== undefined && pressedClasses,
          className,
        )}
        {...props}
      />
    );

    const tip = tooltip ?? label;
    if (tip === undefined || tip === false) return button;

    return (
      <Tooltip content={tip} side={tooltipSide}>
        {button}
      </Tooltip>
    );
  },
);

IconButton.displayName = "IconButton";
