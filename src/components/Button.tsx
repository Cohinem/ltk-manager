import { Button as BaseButton } from "@base-ui/react";
import { IconContext } from "@phosphor-icons/react";
import { forwardRef, type ReactNode } from "react";

import { twMerge } from "@/utils";

import { focusRing } from "./focus";
import { Spinner, type SpinnerSize } from "./Spinner";
import { Tooltip, type TooltipProps } from "./Tooltip";

/** How much the button asks for attention, from a solid fill down to bare text. */
export type ButtonVariant = "filled" | "tonal" | "outline" | "ghost";

export type ButtonTone = "neutral" | "accent" | "danger";

/** The control heights of DS-SIZE: 24, 28, 32 and 36px. */
export type ButtonSize = "xs" | "sm" | "md" | "lg";

/** A fill always carries a hue, so `neutral` exists on `outline` and `ghost` alone. */
export type ButtonLook =
  | { variant?: "outline" | "ghost"; tone?: ButtonTone }
  | { variant: "filled" | "tonal"; tone?: Exclude<ButtonTone, "neutral"> };

export interface ButtonBaseProps extends Omit<BaseButton.Props, "className" | "children"> {
  size?: ButtonSize;
  /** Shows a spinner over the label and disables the button, at the width it already has. */
  loading?: boolean;
  /**
   * Why the button is disabled, shown as its tooltip.
   *
   * A disabled button with a reason stays focusable, so the reason reaches the keyboard too.
   */
  disabledReason?: ReactNode;
  left?: ReactNode;
  right?: ReactNode;
  children?: ReactNode;
  className?: string;
}

export type ButtonProps = ButtonBaseProps & ButtonLook;

const sizeClasses: Record<ButtonSize, string> = {
  xs: "h-6 px-1.5 text-xs gap-1",
  sm: "h-7 px-2 text-xs gap-1",
  md: "h-8 px-3 text-sm gap-1.5",
  lg: "h-9 px-4 text-sm gap-2",
};

const iconOnlySizeClasses: Record<ButtonSize, string> = {
  xs: "size-6",
  sm: "size-7",
  md: "size-8",
  lg: "size-9",
};

const DEFAULT_TONE: Record<ButtonVariant, ButtonTone> = {
  filled: "accent",
  tonal: "accent",
  outline: "neutral",
  ghost: "neutral",
};

interface ButtonLookClasses {
  rest: string;
  /** Hover and press, left off a disabled button: one with a reason keeps its pointer events. */
  live: string;
}

const lookClasses: Record<ButtonVariant, Partial<Record<ButtonTone, ButtonLookClasses>>> = {
  filled: {
    accent: {
      rest: "bg-accent-600 text-on-accent",
      live: "hover:bg-accent-500 active:bg-accent-700",
    },
    danger: {
      rest: "bg-danger-strong text-brand-on",
      live: "hover:bg-danger active:brightness-90",
    },
  },
  /* A wash and an edge of one hue, so two joined halves keep a seam between them. */
  tonal: {
    accent: {
      rest: "border border-accent-400/50 bg-accent-500/15 text-accent-400",
      live: "hover:bg-accent-500/25 active:bg-accent-500/35",
    },
    danger: {
      rest: "border border-danger/40 bg-danger/15 text-danger-text",
      live: "hover:bg-danger/25 active:bg-danger/35",
    },
  },
  /* Edge and hover both from the veil: DS-VEIL. */
  outline: {
    neutral: {
      rest: "border border-surface-veil-strong bg-transparent text-surface-200",
      live: "hover:bg-surface-veil active:bg-surface-veil-strong",
    },
    accent: {
      rest: "border border-accent-400/50 bg-transparent text-accent-300",
      live: "hover:bg-accent-500/15 active:bg-accent-500/25",
    },
    danger: {
      rest: "border border-danger/40 bg-transparent text-danger-text",
      live: "hover:bg-danger/10 active:bg-danger/20",
    },
  },
  /* DS-VEIL */
  ghost: {
    neutral: {
      rest: "bg-transparent text-surface-200",
      live: "hover:bg-surface-veil active:bg-surface-veil-strong",
    },
    accent: {
      rest: "bg-transparent text-accent-300",
      live: "hover:bg-accent-500/15 active:bg-accent-500/25",
    },
    danger: {
      rest: "bg-transparent text-danger-text",
      live: "hover:bg-danger/15 active:bg-danger/25",
    },
  },
};

const baseClasses =
  "relative inline-flex items-center justify-center font-medium rounded-md transition-colors cursor-pointer select-none data-[disabled]:opacity-50 data-[disabled]:cursor-not-allowed";

const spinnerSize: Record<ButtonSize, SpinnerSize> = {
  xs: 14,
  sm: 14,
  md: 16,
  lg: 16,
};

function IconSlot({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex size-4 shrink-0 items-center justify-center">{children}</span>
  );
}

const ButtonCore = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "outline",
      tone,
      size = "md",
      loading = false,
      disabledReason,
      left,
      right,
      children,
      className,
      disabled,
      ...props
    },
    ref,
  ) => {
    const isIconOnly = !children && !!(left || right);
    const isDisabled = disabled || loading;
    const explains = isDisabled && !loading && disabledReason !== undefined;
    const look = lookClasses[variant][tone ?? DEFAULT_TONE[variant]];

    const classes = twMerge(
      baseClasses,
      focusRing,
      !explains && "data-[disabled]:pointer-events-none",
      look?.rest,
      !isDisabled && look?.live,
      isIconOnly ? iconOnlySizeClasses[size] : sizeClasses[size],
      className,
    );

    const content = (
      <>
        {left && <IconSlot>{left}</IconSlot>}
        {children}
        {right && <IconSlot>{right}</IconSlot>}
      </>
    );

    return (
      <BaseButton
        ref={ref}
        className={classes}
        disabled={isDisabled}
        focusableWhenDisabled={explains}
        {...props}
      >
        {!loading && content}
        {/* Still laid out, so the button keeps the width of its label. */}
        {loading && <span className="invisible contents">{content}</span>}
        {loading && (
          <span className="absolute inset-0 flex animate-fade-in items-center justify-center">
            <Spinner size={spinnerSize[size]} className="text-current" />
          </span>
        )}
      </BaseButton>
    );
  },
);

ButtonCore.displayName = "ButtonCore";

/**
 * A press that does something, at one of four levels of emphasis.
 *
 * `variant` is the emphasis and `tone` the hue. An unstyled button is `outline` and neutral.
 * `filled` is the one primary action of a view, `tonal` an action that should be found without
 * leading, and `ghost` anything in a toolbar or a row. `left` and `right` take icons, and a
 * button with an icon and no children draws square.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>((props, ref) => {
  const button = <ButtonCore ref={ref} {...props} />;
  if (!props.disabled || props.loading || props.disabledReason === undefined) return button;

  return <Tooltip content={props.disabledReason}>{button}</Tooltip>;
});

Button.displayName = "Button";

export type IconButtonSize = ButtonSize | "row";

export type IconButtonProps = Omit<ButtonBaseProps, "children" | "left" | "right" | "size"> &
  ButtonLook & {
    icon: ReactNode;
    size?: IconButtonSize;
    /** The accessible name, shown as the tooltip unless `tooltip` replaces it. */
    label?: string;
    /** Tooltip content in place of `label`, or `false` for none. */
    tooltip?: ReactNode;
    tooltipSide?: TooltipProps["side"];
    /** A toggle's state, set as `aria-pressed` and shown as the accent fill. */
    pressed?: boolean;
    /** Rests the glyph at `surface-400`, and gives it the tone's colour under the pointer. */
    muted?: boolean;
    /**
     * Hides the button until its row is hovered or holds keyboard focus: DS-REVEAL.
     *
     * The row is the nearest ancestor carrying `group/reveal`.
     */
    reveal?: boolean;
    /** Narrower than it is tall, for the caret half of a split button. */
    narrow?: boolean;
  };

const iconPixels: Record<IconButtonSize, number> = {
  row: 14,
  xs: 16,
  sm: 16,
  md: 16,
  lg: 20,
};

/* A button inside a row: smaller than any toolbar size, DS-VEIL and DS-RADIUS. The pseudo
   element pads the 20px box out to the 24px a target takes: DS-TARGET. */
const rowClasses = "size-5 rounded-sm after:absolute after:-inset-0.5";

const narrowClasses: Record<IconButtonSize, string> = {
  row: "w-4",
  xs: "w-5",
  sm: "w-6",
  md: "w-6",
  lg: "w-8",
};

const pressedClasses =
  "aria-pressed:border-accent-400/50 aria-pressed:bg-accent-500/15 aria-pressed:text-accent-300 aria-pressed:hover:bg-accent-500/25 aria-pressed:hover:text-accent-300";

/* The soft veil under a dim glyph: DS-VEIL. */
const mutedClasses: Record<ButtonTone, ButtonLookClasses> = {
  neutral: {
    rest: "text-surface-400",
    live: "hover:bg-surface-veil-soft hover:text-surface-200 active:bg-surface-veil",
  },
  accent: { rest: "text-surface-400", live: "hover:text-accent-300" },
  danger: { rest: "text-surface-400", live: "hover:text-danger-text" },
};

/* DS-REVEAL. A disabled button comes up to its dimmed strength rather than to full. */
const revealClasses = {
  enabled:
    "opacity-0 group-hover/reveal:opacity-100 group-focus-visible/reveal:opacity-100 group-has-focus-visible/reveal:opacity-100 focus-visible:opacity-100 aria-expanded:opacity-100 aria-pressed:opacity-100 data-[popup-open]:opacity-100",
  disabled:
    "data-[disabled]:opacity-0 group-hover/reveal:data-[disabled]:opacity-50 group-focus-visible/reveal:data-[disabled]:opacity-50 group-has-focus-visible/reveal:data-[disabled]:opacity-50 focus-visible:data-[disabled]:opacity-50",
};

/**
 * A square button showing one icon, `ghost` and 24px unless told otherwise.
 *
 * The icon takes the bold weight and the size's pixel size from phosphor's `IconContext`, so a
 * call site passes the bare glyph. `label` is both the accessible name and the tooltip, and a
 * `disabledReason` takes the tooltip over while the button is disabled. `row` is the 20px size
 * for actions inside a tree or list row. A loading button stays shown whatever `reveal` says.
 */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  (
    {
      icon,
      variant = "ghost",
      tone,
      size = "xs",
      label,
      tooltip,
      tooltipSide,
      pressed,
      muted = false,
      reveal = false,
      narrow = false,
      className,
      "aria-label": ariaLabel,
      ...props
    },
    ref,
  ) => {
    const isDisabled = props.disabled || props.loading;
    const mutedLook = mutedClasses[tone ?? DEFAULT_TONE[variant]];
    const revealLook = isDisabled ? revealClasses.disabled : revealClasses.enabled;

    const glyph = (
      <IconContext.Provider value={{ weight: "bold", size: iconPixels[size] }}>
        {icon}
      </IconContext.Provider>
    );

    const button = (
      <ButtonCore
        ref={ref}
        {...({ variant, tone } as ButtonLook)}
        size={size === "row" ? "xs" : size}
        left={glyph}
        aria-label={label ?? ariaLabel}
        aria-pressed={pressed}
        className={twMerge(
          size === "row" && rowClasses,
          narrow && narrowClasses[size],
          muted && mutedLook.rest,
          muted && !isDisabled && mutedLook.live,
          pressed !== undefined && pressedClasses,
          reveal && !props.loading && revealLook,
          className,
        )}
        {...props}
      />
    );

    const explains = props.disabled && !props.loading && props.disabledReason !== undefined;
    const tip = explains ? props.disabledReason : (tooltip ?? label);
    if (tip === undefined || tip === false) return button;

    return (
      <Tooltip content={tip} side={tooltipSide}>
        {button}
      </Tooltip>
    );
  },
);

IconButton.displayName = "IconButton";
