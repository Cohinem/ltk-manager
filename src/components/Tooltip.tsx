import { Tooltip as BaseTooltip } from "@base-ui/react/tooltip";
import { forwardRef, type ReactElement, type ReactNode } from "react";

import { twMerge } from "@/utils";

// Root/Provider
export interface TooltipProviderProps extends BaseTooltip.Provider.Props {
  children?: ReactNode;
}

const TooltipProvider = ({ children, ...props }: TooltipProviderProps) => {
  return <BaseTooltip.Provider {...props}>{children}</BaseTooltip.Provider>;
};
TooltipProvider.displayName = "Tooltip.Provider";

// Root
export interface TooltipRootProps extends BaseTooltip.Root.Props {
  children?: ReactNode;
}

const TooltipRoot = ({ children, ...props }: TooltipRootProps) => {
  return <BaseTooltip.Root {...props}>{children}</BaseTooltip.Root>;
};
TooltipRoot.displayName = "Tooltip.Root";

// Trigger
export interface TooltipTriggerProps extends Omit<BaseTooltip.Trigger.Props, "className"> {
  className?: string;
  children?: ReactNode;
}

const TooltipTrigger = forwardRef<HTMLButtonElement, TooltipTriggerProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <BaseTooltip.Trigger ref={ref} className={className} {...props}>
        {children}
      </BaseTooltip.Trigger>
    );
  },
);
TooltipTrigger.displayName = "Tooltip.Trigger";

// Portal
export interface TooltipPortalProps extends BaseTooltip.Portal.Props {
  children?: ReactNode;
}

const TooltipPortal = ({ children, ...props }: TooltipPortalProps) => {
  return <BaseTooltip.Portal {...props}>{children}</BaseTooltip.Portal>;
};
TooltipPortal.displayName = "Tooltip.Portal";

// Positioner
export interface TooltipPositionerProps extends Omit<BaseTooltip.Positioner.Props, "className"> {
  className?: string;
  children?: ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  sideOffset?: number;
}

const TooltipPositioner = forwardRef<HTMLDivElement, TooltipPositionerProps>(
  ({ className, children, side = "top", align = "center", sideOffset = 8, ...props }, ref) => {
    return (
      <BaseTooltip.Positioner
        ref={ref}
        side={side}
        align={align}
        sideOffset={sideOffset}
        className={twMerge("z-50", className)}
        {...props}
      >
        {children}
      </BaseTooltip.Positioner>
    );
  },
);
TooltipPositioner.displayName = "Tooltip.Positioner";

// Popup (content)
export interface TooltipPopupProps extends Omit<BaseTooltip.Popup.Props, "className"> {
  className?: string;
  children?: ReactNode;
}

/* Solid where a popup is glass: a line of text this small needs a ground that does not move
   under it. DS-GROUND, DS-RADIUS. */
const popupClasses =
  "rounded-md border border-surface-700 bg-surface-800 px-2 py-1 text-xs text-surface-100 shadow-lg animate-fade-in data-[ending-style]:opacity-0 data-[starting-style]:opacity-0";

const TooltipPopup = forwardRef<HTMLDivElement, TooltipPopupProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <BaseTooltip.Popup ref={ref} className={twMerge(popupClasses, className)} {...props}>
        {children}
      </BaseTooltip.Popup>
    );
  },
);
TooltipPopup.displayName = "Tooltip.Popup";

// Compound export (primitives for advanced/custom tooltip layouts)
export const TooltipPrimitives = {
  Provider: TooltipProvider,
  Root: TooltipRoot,
  Trigger: TooltipTrigger,
  Portal: TooltipPortal,
  Positioner: TooltipPositioner,
  Popup: TooltipPopup,
};

export interface TooltipProps {
  content: ReactNode;
  children: ReactElement<Record<string, unknown>>;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  sideOffset?: number;
  /** Hover delay in ms before opening. Base UI's own default is 600. */
  delay?: number;
}

/**
 * A line that names or explains the element it wraps, shown on hover and on keyboard focus.
 *
 * `content` is short text or a small block of it. Anything a reader has to reach with the
 * pointer, such as a link or a scrolling list, is a `HoverCard` or a `Popover`.
 */
export function Tooltip({
  content,
  children,
  side = "top",
  align = "center",
  sideOffset = 8,
  delay,
}: TooltipProps) {
  return (
    <BaseTooltip.Root>
      <BaseTooltip.Trigger delay={delay} render={children} />
      <BaseTooltip.Portal>
        <BaseTooltip.Positioner side={side} align={align} sideOffset={sideOffset} className="z-50">
          <BaseTooltip.Popup className={popupClasses}>{content}</BaseTooltip.Popup>
        </BaseTooltip.Positioner>
      </BaseTooltip.Portal>
    </BaseTooltip.Root>
  );
}
