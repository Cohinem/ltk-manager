import { Tabs as BaseTabs } from "@base-ui/react/tabs";
import {
  type ComponentPropsWithoutRef,
  createContext,
  forwardRef,
  type ReactNode,
  useContext,
} from "react";

import { twMerge } from "@/utils";

import { focusRingInset } from "./focus";
import { segmentRest, segmentThumb, segmentTrack, segmentTrackSize } from "./segment";

/**
 * How a list and its tabs draw.
 *
 * - `default` underlines the open tab, for the panels of a page or a pane
 * - `pills` is the `SegmentedControl` track, for a switch between a few small panels in a section
 * - `rail` is a column of rows, for the sections of a page
 * - `plain` draws nothing, for a strip whose tabs the call site draws
 */
export type TabsVariant = "default" | "pills" | "rail" | "plain";

const VariantContext = createContext<TabsVariant>("default");

// Root
export interface TabsRootProps extends Omit<BaseTabs.Root.Props, "className"> {
  className?: string;
}

/** A `rail` takes `orientation="vertical"`, which moves the arrow keys to Up and Down. */
const TabsRoot = forwardRef<HTMLDivElement, TabsRootProps>(({ className, ...props }, ref) => {
  return <BaseTabs.Root ref={ref} className={twMerge("flex flex-col", className)} {...props} />;
});
TabsRoot.displayName = "Tabs.Root";

// List
export interface TabsListProps extends Omit<ComponentPropsWithoutRef<"div">, "className"> {
  /** Reaches the tabs inside the list too. */
  variant?: TabsVariant;
  /** The hairline under a `default` list. Off where the row it sits in draws one. */
  divider?: boolean;
  className?: string;
  children?: ReactNode;
}

const listClasses: Record<TabsVariant, string> = {
  default: "gap-0 overflow-x-auto border-b border-surface-700",
  pills: `${segmentTrack} ${segmentTrackSize.md} w-fit`,
  rail: "flex-col items-stretch gap-1",
  plain: "",
};

const TabsList = forwardRef<HTMLDivElement, TabsListProps>(
  ({ variant = "default", divider = true, className, children, ...props }, ref) => {
    return (
      <VariantContext.Provider value={variant}>
        <BaseTabs.List
          ref={ref}
          className={twMerge(
            "flex items-center",
            listClasses[variant],
            variant === "default" && !divider && "border-b-0",
            className,
          )}
          {...props}
        >
          {variant === "pills" && (
            <BaseTabs.Indicator
              className={twMerge(
                segmentThumb,
                "w-(--active-tab-width) translate-x-(--active-tab-left)",
                "transition-[translate,width] duration-200",
              )}
            />
          )}
          {children}
        </BaseTabs.List>
      </VariantContext.Provider>
    );
  },
);
TabsList.displayName = "Tabs.List";

// Tab
export interface TabsTabProps extends Omit<BaseTabs.Tab.Props, "className"> {
  className?: string;
  children?: ReactNode;
}

/* A disabled tab stays focusable, so it carries `data-disabled` and never the attribute. */
const tabBase =
  "relative inline-flex shrink-0 cursor-pointer items-center font-medium whitespace-nowrap transition-colors data-[disabled]:pointer-events-none data-[disabled]:opacity-50";

const tabClasses: Record<TabsVariant, string> = {
  default: [
    "px-4 py-2 text-sm text-surface-400 hover:text-surface-200 data-[active]:text-accent-400",
    "data-[active]:after:absolute data-[active]:after:inset-x-0 data-[active]:after:bottom-0",
    "data-[active]:after:h-0.5 data-[active]:after:bg-accent-500",
  ].join(" "),
  pills: [
    "h-full justify-center rounded-sm px-2 text-xs",
    segmentRest,
    /* DS-VEIL */
    "hover:bg-surface-veil data-[active]:text-accent-300",
    "data-[active]:hover:bg-transparent data-[active]:hover:text-accent-300",
  ].join(" "),
  rail: [
    "gap-2.5 rounded-md px-4 py-2 text-left text-base text-surface-400",
    /* DS-VEIL */
    "hover:bg-surface-veil hover:text-surface-200",
    "data-[active]:bg-accent-500/15 data-[active]:text-accent-300",
    "data-[active]:hover:bg-accent-500/15 data-[active]:hover:text-accent-300",
  ].join(" "),
  plain: "",
};

/** One tab, drawn in the variant of the `Tabs.List` it sits in. */
const TabsTab = forwardRef<HTMLButtonElement, TabsTabProps>(
  ({ className, children, ...props }, ref) => {
    const variant = useContext(VariantContext);

    return (
      <BaseTabs.Tab
        ref={ref}
        className={twMerge(tabBase, focusRingInset, tabClasses[variant], className)}
        {...props}
      >
        {children}
      </BaseTabs.Tab>
    );
  },
);
TabsTab.displayName = "Tabs.Tab";

// Panel
export interface TabsPanelProps extends Omit<BaseTabs.Panel.Props, "className"> {
  className?: string;
  children?: ReactNode;
}

const TabsPanel = forwardRef<HTMLDivElement, TabsPanelProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <BaseTabs.Panel
        ref={ref}
        className={twMerge("focus-visible:outline-none", className)}
        {...props}
      >
        {children}
      </BaseTabs.Panel>
    );
  },
);
TabsPanel.displayName = "Tabs.Panel";

/**
 * A row of tabs, each of which shows a panel of its own.
 *
 * A choice that sets a value and shows no panel is a `SegmentedControl`.
 */
export const Tabs = {
  Root: TabsRoot,
  List: TabsList,
  Tab: TabsTab,
  Panel: TabsPanel,
};
