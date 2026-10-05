import { Combobox as BaseCombobox } from "@base-ui/react/combobox";
import { CaretDownIcon, CheckIcon, XIcon } from "@phosphor-icons/react";
import { forwardRef, type ReactNode } from "react";

import { twMerge } from "@/utils";

import { fieldFrame, type FieldSize, fieldSizeClasses } from "./fieldFrame";
import {
  popupGroupLabel,
  popupItem,
  popupItemMark,
  popupItemTone,
  popupMotion,
  popupSurface,
} from "./popup";

// Re-export the filter hook for consumers
export const useComboboxFilter = BaseCombobox.useFilter;

/** The items the filter keeps, which a `virtualized` root's list renders a window of. */
export const useComboboxFilteredItems = BaseCombobox.useFilteredItems;

// Root
export interface ComboboxRootProps<
  Value = string,
  Multiple extends boolean | undefined = false,
> extends BaseCombobox.Root.Props<Value, Multiple> {
  children?: ReactNode;
}

function ComboboxRoot<Value = string, Multiple extends boolean | undefined = false>({
  children,
  ...props
}: ComboboxRootProps<Value, Multiple>) {
  return <BaseCombobox.Root<Value, Multiple> {...props}>{children}</BaseCombobox.Root>;
}
ComboboxRoot.displayName = "Combobox.Root";

// Input
export interface ComboboxInputProps extends Omit<BaseCombobox.Input.Props, "className" | "size"> {
  /** `md`, 32px, unless told otherwise. */
  size?: FieldSize;
  /** Marks an input standing outside a `Field.Root` invalid. */
  hasError?: boolean;
  className?: string;
}

const ComboboxInput = forwardRef<HTMLInputElement, ComboboxInputProps>(
  ({ size = "md", className, hasError, ...props }, ref) => {
    return (
      <BaseCombobox.Input
        ref={ref}
        {...(hasError && { "aria-invalid": true })}
        className={twMerge(fieldFrame, fieldSizeClasses[size], className)}
        {...props}
      />
    );
  },
);
ComboboxInput.displayName = "Combobox.Input";

// Trigger
export interface ComboboxTriggerProps extends Omit<BaseCombobox.Trigger.Props, "className"> {
  className?: string;
  children?: ReactNode;
}

const ComboboxTrigger = forwardRef<HTMLButtonElement, ComboboxTriggerProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <BaseCombobox.Trigger
        ref={ref}
        className={twMerge(
          "inline-flex items-center justify-center text-surface-400 transition-colors hover:text-surface-200",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        {...props}
      >
        {children}
      </BaseCombobox.Trigger>
    );
  },
);
ComboboxTrigger.displayName = "Combobox.Trigger";

// Icon
export interface ComboboxIconProps extends Omit<BaseCombobox.Icon.Props, "className"> {
  className?: string;
}

const ComboboxIcon = forwardRef<HTMLDivElement, ComboboxIconProps>(
  ({ className, ...props }, ref) => {
    return (
      <BaseCombobox.Icon ref={ref} className={twMerge("text-surface-400", className)} {...props}>
        <CaretDownIcon weight="bold" className="size-3.5" />
      </BaseCombobox.Icon>
    );
  },
);
ComboboxIcon.displayName = "Combobox.Icon";

// Portal
export interface ComboboxPortalProps extends BaseCombobox.Portal.Props {
  children?: ReactNode;
}

const ComboboxPortal = ({ children, ...props }: ComboboxPortalProps) => {
  return <BaseCombobox.Portal {...props}>{children}</BaseCombobox.Portal>;
};
ComboboxPortal.displayName = "Combobox.Portal";

// Positioner
export interface ComboboxPositionerProps extends Omit<BaseCombobox.Positioner.Props, "className"> {
  className?: string;
  children?: ReactNode;
}

const ComboboxPositioner = forwardRef<HTMLDivElement, ComboboxPositionerProps>(
  ({ className, children, side = "bottom", sideOffset = 4, ...props }, ref) => {
    return (
      <BaseCombobox.Positioner
        ref={ref}
        side={side}
        sideOffset={sideOffset}
        className={twMerge("z-50", className)}
        {...props}
      >
        {children}
      </BaseCombobox.Positioner>
    );
  },
);
ComboboxPositioner.displayName = "Combobox.Positioner";

// Popup
export interface ComboboxPopupProps extends Omit<BaseCombobox.Popup.Props, "className"> {
  className?: string;
  children?: ReactNode;
}

const ComboboxPopup = forwardRef<HTMLDivElement, ComboboxPopupProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <BaseCombobox.Popup
        ref={ref}
        className={twMerge(
          "max-h-60 min-w-(--anchor-width) overflow-y-auto p-1",
          popupSurface,
          popupMotion,
          className,
        )}
        {...props}
      >
        {children}
      </BaseCombobox.Popup>
    );
  },
);
ComboboxPopup.displayName = "Combobox.Popup";

// Content
export interface ComboboxContentProps
  extends
    ComboboxPopupProps,
    Pick<
      ComboboxPositionerProps,
      "side" | "align" | "sideOffset" | "alignOffset" | "anchor" | "collisionPadding"
    > {
  positionerClassName?: string;
}

/** Portal, Positioner and Popup as one part, taking the positioning props itself. */
const ComboboxContent = forwardRef<HTMLDivElement, ComboboxContentProps>(
  (
    {
      side,
      align,
      sideOffset,
      alignOffset,
      anchor,
      collisionPadding,
      positionerClassName,
      ...props
    },
    ref,
  ) => {
    return (
      <ComboboxPortal>
        <ComboboxPositioner
          side={side}
          align={align}
          sideOffset={sideOffset}
          alignOffset={alignOffset}
          anchor={anchor}
          collisionPadding={collisionPadding}
          className={positionerClassName}
        >
          <ComboboxPopup ref={ref} {...props} />
        </ComboboxPositioner>
      </ComboboxPortal>
    );
  },
);
ComboboxContent.displayName = "Combobox.Content";

// List
export interface ComboboxListProps extends Omit<BaseCombobox.List.Props, "className"> {
  className?: string;
}

const ComboboxList = forwardRef<HTMLDivElement, ComboboxListProps>(
  ({ className, ...props }, ref) => {
    return <BaseCombobox.List ref={ref} className={className} {...props} />;
  },
);
ComboboxList.displayName = "Combobox.List";

// Item
export interface ComboboxItemProps extends Omit<BaseCombobox.Item.Props, "className"> {
  className?: string;
  children?: ReactNode;
}

const ComboboxItem = forwardRef<HTMLDivElement, ComboboxItemProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <BaseCombobox.Item
        ref={ref}
        className={twMerge(popupItem, popupItemTone.default, className)}
        {...props}
      >
        {children}
        <BaseCombobox.ItemIndicator className={twMerge(popupItemMark, "ml-auto")}>
          <CheckIcon weight="bold" className="size-3.5" />
        </BaseCombobox.ItemIndicator>
      </BaseCombobox.Item>
    );
  },
);
ComboboxItem.displayName = "Combobox.Item";

// Empty
export interface ComboboxEmptyProps extends Omit<BaseCombobox.Empty.Props, "className"> {
  className?: string;
  children?: ReactNode;
}

const ComboboxEmpty = forwardRef<HTMLDivElement, ComboboxEmptyProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <BaseCombobox.Empty
        ref={ref}
        /* The live region stays mounted while items show, so it must take no space then. */
        className={twMerge("px-2 py-6 text-center text-sm text-surface-400 empty:p-0", className)}
        {...props}
      >
        {children ?? "No results found"}
      </BaseCombobox.Empty>
    );
  },
);
ComboboxEmpty.displayName = "Combobox.Empty";

// Clear
export interface ComboboxClearProps extends Omit<BaseCombobox.Clear.Props, "className"> {
  className?: string;
  children?: ReactNode;
}

const ComboboxClear = forwardRef<HTMLButtonElement, ComboboxClearProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <BaseCombobox.Clear
        ref={ref}
        className={twMerge(
          "inline-flex items-center justify-center text-surface-400 transition-colors hover:text-surface-200",
          className,
        )}
        {...props}
      >
        {children ?? <XIcon weight="bold" className="size-4" />}
      </BaseCombobox.Clear>
    );
  },
);
ComboboxClear.displayName = "Combobox.Clear";

// Value
export type ComboboxValueProps = BaseCombobox.Value.Props;

/** The selected value, drawn by `children`, such as a multiple root's chips. Adds no DOM element. */
function ComboboxValue(props: ComboboxValueProps) {
  return <BaseCombobox.Value {...props} />;
}
ComboboxValue.displayName = "Combobox.Value";

// Chips
export interface ComboboxChipsProps extends Omit<BaseCombobox.Chips.Props, "className"> {
  className?: string;
}

const ComboboxChips = forwardRef<HTMLDivElement, ComboboxChipsProps>(
  ({ className, ...props }, ref) => {
    return (
      <BaseCombobox.Chips
        ref={ref}
        className={twMerge("flex flex-wrap gap-1", className)}
        {...props}
      />
    );
  },
);
ComboboxChips.displayName = "Combobox.Chips";

// Chip
export interface ComboboxChipProps extends Omit<BaseCombobox.Chip.Props, "className"> {
  className?: string;
  children?: ReactNode;
}

const ComboboxChip = forwardRef<HTMLDivElement, ComboboxChipProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <BaseCombobox.Chip
        ref={ref}
        className={twMerge(
          "inline-flex items-center gap-1 rounded-md bg-surface-600 px-2 py-0.5 text-sm text-surface-100",
          className,
        )}
        {...props}
      >
        {children}
      </BaseCombobox.Chip>
    );
  },
);
ComboboxChip.displayName = "Combobox.Chip";

// ChipRemove
export interface ComboboxChipRemoveProps extends Omit<BaseCombobox.ChipRemove.Props, "className"> {
  className?: string;
  children?: ReactNode;
}

const ComboboxChipRemove = forwardRef<HTMLButtonElement, ComboboxChipRemoveProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <BaseCombobox.ChipRemove
        ref={ref}
        className={twMerge(
          "inline-flex size-4 shrink-0 items-center justify-center rounded-sm",
          "text-surface-400 transition-colors hover:bg-surface-500 hover:text-surface-200",
          className,
        )}
        {...props}
      >
        {children ?? <XIcon weight="bold" className="size-3" />}
      </BaseCombobox.ChipRemove>
    );
  },
);
ComboboxChipRemove.displayName = "Combobox.ChipRemove";

// Group
export interface ComboboxGroupProps extends Omit<BaseCombobox.Group.Props, "className"> {
  className?: string;
  children?: ReactNode;
}

const ComboboxGroup = forwardRef<HTMLDivElement, ComboboxGroupProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <BaseCombobox.Group ref={ref} className={className} {...props}>
        {children}
      </BaseCombobox.Group>
    );
  },
);
ComboboxGroup.displayName = "Combobox.Group";

// GroupLabel
export interface ComboboxGroupLabelProps extends Omit<BaseCombobox.GroupLabel.Props, "className"> {
  className?: string;
  children?: ReactNode;
}

const ComboboxGroupLabel = forwardRef<HTMLDivElement, ComboboxGroupLabelProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <BaseCombobox.GroupLabel ref={ref} className={twMerge(popupGroupLabel, className)} {...props}>
        {children}
      </BaseCombobox.GroupLabel>
    );
  },
);
ComboboxGroupLabel.displayName = "Combobox.GroupLabel";

// Collection
export type ComboboxCollectionProps = BaseCombobox.Collection.Props;

/** Renders the `items` of one `Group`. Adds no DOM element. */
function ComboboxCollection(props: ComboboxCollectionProps) {
  return <BaseCombobox.Collection {...props} />;
}
ComboboxCollection.displayName = "Combobox.Collection";

// Status
export interface ComboboxStatusProps extends Omit<BaseCombobox.Status.Props, "className"> {
  className?: string;
  children?: ReactNode;
}

const ComboboxStatus = forwardRef<HTMLDivElement, ComboboxStatusProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <BaseCombobox.Status ref={ref} className={twMerge("sr-only", className)} {...props}>
        {children}
      </BaseCombobox.Status>
    );
  },
);
ComboboxStatus.displayName = "Combobox.Status";

/**
 * One choice from a list the reader narrows by typing.
 *
 * A list short enough to read at a glance is a `Select`, and several choices at once are a
 * `MultiSelect`.
 */
export const Combobox = {
  Root: ComboboxRoot,
  Input: ComboboxInput,
  Trigger: ComboboxTrigger,
  Icon: ComboboxIcon,
  Portal: ComboboxPortal,
  Positioner: ComboboxPositioner,
  Popup: ComboboxPopup,
  Content: ComboboxContent,
  List: ComboboxList,
  Item: ComboboxItem,
  Empty: ComboboxEmpty,
  Clear: ComboboxClear,
  Value: ComboboxValue,
  Chips: ComboboxChips,
  Chip: ComboboxChip,
  ChipRemove: ComboboxChipRemove,
  Group: ComboboxGroup,
  GroupLabel: ComboboxGroupLabel,
  Collection: ComboboxCollection,
  Status: ComboboxStatus,
};

/** One entry of a flat option list. */
export interface ComboboxOption {
  value: string;
  label: string;
  disabled?: boolean;
}
