import { Collapsible } from "@base-ui/react/collapsible";
import { CaretRightIcon } from "@phosphor-icons/react";
import { forwardRef } from "react";

import { twMerge } from "@/utils";

/**
 * A section whose panel a trigger shows and hides, on base-ui's Collapsible.
 *
 * The trigger carries `aria-expanded` and `data-panel-open`, so `Disclosure.Caret` inside it
 * turns without the caller tracking the open state. The panel mounts only while open. Where
 * the caller does hold the state, `Root` takes `open` and `onOpenChange`.
 */
export const DisclosureRoot = Collapsible.Root;

export interface DisclosureTriggerProps extends Omit<Collapsible.Trigger.Props, "className"> {
  className?: string;
}

export const DisclosureTrigger = forwardRef<HTMLButtonElement, DisclosureTriggerProps>(
  ({ className, ...props }, ref) => (
    <Collapsible.Trigger
      ref={ref}
      className={twMerge("group/disclosure cursor-pointer text-left", className)}
      {...props}
    />
  ),
);
DisclosureTrigger.displayName = "Disclosure.Trigger";

export interface DisclosureCaretProps {
  className?: string;
}

/** The trigger's caret, pointing at the label while shut and down while open. */
export function DisclosureCaret({ className }: DisclosureCaretProps) {
  return (
    <CaretRightIcon
      weight="bold"
      aria-hidden
      className={twMerge(
        "size-3.5 shrink-0 text-surface-400 transition-transform duration-150 group-data-[panel-open]/disclosure:rotate-90",
        className,
      )}
    />
  );
}

export interface DisclosurePanelProps extends Omit<Collapsible.Panel.Props, "className"> {
  className?: string;
}

export const DisclosurePanel = forwardRef<HTMLDivElement, DisclosurePanelProps>(
  ({ className, ...props }, ref) => (
    <Collapsible.Panel ref={ref} className={className} {...props} />
  ),
);
DisclosurePanel.displayName = "Disclosure.Panel";

export const Disclosure = {
  Root: DisclosureRoot,
  Trigger: DisclosureTrigger,
  Caret: DisclosureCaret,
  Panel: DisclosurePanel,
};
