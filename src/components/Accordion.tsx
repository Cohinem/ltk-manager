import { Accordion as BaseAccordion } from "@base-ui/react/accordion";
import { CaretDownIcon } from "@phosphor-icons/react";
import { createContext, forwardRef, type ReactNode, useContext } from "react";

import { twMerge } from "@/utils";

import { focusRingInset } from "./focus";

/**
 * `band` divides items with a rule and adds no surface, the shape a settings
 * group takes (DS-SETTING-LEVEL). `filled` recesses its header and panel below
 * the surface it sits on - depth from fills alone, no box - for a group list
 * inside a dialog.
 */
export type AccordionVariant = "band" | "filled";

const VariantContext = createContext<AccordionVariant>("band");

// Root
export interface AccordionRootProps extends Omit<BaseAccordion.Root.Props, "className"> {
  /** Reaches the triggers and panels inside the root too. */
  variant?: AccordionVariant;
  className?: string;
}

const AccordionRoot = forwardRef<HTMLDivElement, AccordionRootProps>(
  ({ variant = "band", className, ...props }, ref) => {
    return (
      <VariantContext.Provider value={variant}>
        <BaseAccordion.Root
          ref={ref}
          className={twMerge("flex flex-col overflow-hidden rounded-lg", className)}
          {...props}
        />
      </VariantContext.Provider>
    );
  },
);
AccordionRoot.displayName = "Accordion.Root";

// Item
export interface AccordionItemProps extends Omit<BaseAccordion.Item.Props, "className"> {
  className?: string;
}

const AccordionItem = forwardRef<HTMLDivElement, AccordionItemProps>(
  ({ className, ...props }, ref) => {
    return (
      <BaseAccordion.Item
        ref={ref}
        className={twMerge("border-t border-surface-700/40 first:border-t-0", className)}
        {...props}
      />
    );
  },
);
AccordionItem.displayName = "Accordion.Item";

// Trigger
export interface AccordionTriggerProps extends Omit<BaseAccordion.Trigger.Props, "className"> {
  className?: string;
  children?: ReactNode;
}

const triggerClasses: Record<AccordionVariant, string> = {
  band: "",
  filled: "bg-surface-900/50",
};

/**
 * The whole header row is the press, with the caret drawn on its far end.
 *
 * Wraps base-ui's Header so a call site writes one element, and the heading
 * semantics cannot be forgotten.
 */
const AccordionTrigger = forwardRef<HTMLButtonElement, AccordionTriggerProps>(
  ({ className, children, ...props }, ref) => {
    const variant = useContext(VariantContext);

    return (
      <BaseAccordion.Header className="m-0">
        <BaseAccordion.Trigger
          ref={ref}
          className={twMerge(
            "group/accordion flex w-full items-center gap-2 px-3 py-2 text-left select-none",
            "hover:bg-surface-veil-soft",
            focusRingInset,
            triggerClasses[variant],
            className,
          )}
          {...props}
        >
          {children}
          <CaretDownIcon
            weight="bold"
            className="ml-auto size-3.5 shrink-0 text-surface-400 transition-transform group-data-[panel-open]/accordion:rotate-180"
          />
        </BaseAccordion.Trigger>
      </BaseAccordion.Header>
    );
  },
);
AccordionTrigger.displayName = "Accordion.Trigger";

// Panel
export interface AccordionPanelProps extends Omit<BaseAccordion.Panel.Props, "className"> {
  className?: string;
}

/* The body's wash fades out over a fixed run rather than filling the panel,
   because the panel's height breathes with its rows and a solid fill would
   drag a hard bottom edge around on every fold. */
const panelClasses: Record<AccordionVariant, string> = {
  band: "",
  filled:
    "border-t border-surface-700/50 bg-linear-to-b from-surface-900/40 to-transparent to-[8rem]",
};

const AccordionPanel = forwardRef<HTMLDivElement, AccordionPanelProps>(
  ({ className, ...props }, ref) => {
    const variant = useContext(VariantContext);

    return (
      <BaseAccordion.Panel
        ref={ref}
        className={twMerge(
          "h-[var(--accordion-panel-height)] overflow-hidden transition-[height]",
          "data-[ending-style]:h-0 data-[starting-style]:h-0",
          panelClasses[variant],
          className,
        )}
        {...props}
      />
    );
  },
);
AccordionPanel.displayName = "Accordion.Panel";

/**
 * Sections that fold under their own headers, as one list.
 *
 * One section that folds on its own is a `Disclosure`.
 */
export const Accordion = {
  Root: AccordionRoot,
  Item: AccordionItem,
  Trigger: AccordionTrigger,
  Panel: AccordionPanel,
};
