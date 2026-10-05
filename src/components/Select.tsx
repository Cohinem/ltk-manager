import { Select as BaseSelect } from "@base-ui/react/select";
import { CaretDownIcon, CheckIcon } from "@phosphor-icons/react";
import { forwardRef, type ReactNode } from "react";

import { twMerge } from "@/utils";

import { fieldFrame, type FieldSize, fieldSizeClasses } from "./fieldFrame";
import { Field } from "./FormField";
import {
  popupGroupLabel,
  popupItem,
  popupItemLabel,
  popupItemMark,
  popupItemTone,
  popupMotion,
  popupSeparator,
  popupSurface,
} from "./popup";

// Root
export interface SelectRootProps extends BaseSelect.Root.Props<string> {
  children?: ReactNode;
}

const SelectRoot = ({ children, ...props }: SelectRootProps) => {
  return <BaseSelect.Root<string> {...props}>{children}</BaseSelect.Root>;
};
SelectRoot.displayName = "Select.Root";

// Trigger
export interface SelectTriggerProps extends Omit<BaseSelect.Trigger.Props, "className"> {
  /** `md`, 32px, unless told otherwise. */
  size?: FieldSize;
  /** Marks a trigger standing outside a `Field.Root` invalid. */
  hasError?: boolean;
  className?: string;
  children?: ReactNode;
}

const SelectTrigger = forwardRef<HTMLButtonElement, SelectTriggerProps>(
  ({ size = "md", className, hasError, children, ...props }, ref) => {
    return (
      <BaseSelect.Trigger
        ref={ref}
        {...(hasError && { "aria-invalid": true })}
        className={twMerge(
          "flex items-center justify-between gap-2",
          fieldFrame,
          fieldSizeClasses[size],
          "data-[placeholder]:text-surface-400",
          className,
        )}
        {...props}
      >
        {children}
      </BaseSelect.Trigger>
    );
  },
);
SelectTrigger.displayName = "Select.Trigger";

// Value
export interface SelectValueProps extends Omit<BaseSelect.Value.Props, "className" | "children"> {
  className?: string;
  prefix?: string;
  children?: BaseSelect.Value.Props["children"];
}

const SelectValue = ({ className, prefix, children, ...props }: SelectValueProps) => {
  if (prefix) {
    return (
      <span className={className}>
        <span className="text-surface-400">{prefix} </span>
        <BaseSelect.Value {...props}>{children}</BaseSelect.Value>
      </span>
    );
  }

  return (
    <BaseSelect.Value className={className} {...props}>
      {children}
    </BaseSelect.Value>
  );
};
SelectValue.displayName = "Select.Value";

// Icon
export interface SelectIconProps extends Omit<BaseSelect.Icon.Props, "className"> {
  className?: string;
}

const SelectIcon = forwardRef<HTMLSpanElement, SelectIconProps>(({ className, ...props }, ref) => {
  return (
    <BaseSelect.Icon
      ref={ref}
      className={twMerge(
        "text-surface-400 transition-transform",
        "data-[popup-open]:rotate-180",
        className,
      )}
      {...props}
    >
      <CaretDownIcon weight="bold" className="size-3.5" />
    </BaseSelect.Icon>
  );
});
SelectIcon.displayName = "Select.Icon";

// Portal
export interface SelectPortalProps extends BaseSelect.Portal.Props {
  children?: ReactNode;
}

const SelectPortal = ({ children, ...props }: SelectPortalProps) => {
  return <BaseSelect.Portal {...props}>{children}</BaseSelect.Portal>;
};
SelectPortal.displayName = "Select.Portal";

// Positioner
export interface SelectPositionerProps extends Omit<BaseSelect.Positioner.Props, "className"> {
  className?: string;
  children?: ReactNode;
}

const SelectPositioner = forwardRef<HTMLDivElement, SelectPositionerProps>(
  (
    {
      className,
      children,
      side = "bottom",
      sideOffset = 4,
      alignItemWithTrigger = false,
      ...props
    },
    ref,
  ) => {
    return (
      <BaseSelect.Positioner
        ref={ref}
        side={side}
        sideOffset={sideOffset}
        alignItemWithTrigger={alignItemWithTrigger}
        className={twMerge("z-50", className)}
        {...props}
      >
        {children}
      </BaseSelect.Positioner>
    );
  },
);
SelectPositioner.displayName = "Select.Positioner";

// Popup
export interface SelectPopupProps extends Omit<BaseSelect.Popup.Props, "className"> {
  className?: string;
  children?: ReactNode;
}

const SelectPopup = forwardRef<HTMLDivElement, SelectPopupProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <BaseSelect.Popup
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
      </BaseSelect.Popup>
    );
  },
);
SelectPopup.displayName = "Select.Popup";

// Content
export interface SelectContentProps
  extends
    SelectPopupProps,
    Pick<
      SelectPositionerProps,
      | "side"
      | "align"
      | "sideOffset"
      | "alignOffset"
      | "anchor"
      | "collisionPadding"
      | "alignItemWithTrigger"
    > {
  positionerClassName?: string;
}

/** Portal, Positioner and Popup as one part, taking the positioning props itself. */
const SelectContent = forwardRef<HTMLDivElement, SelectContentProps>(
  (
    {
      side,
      align,
      sideOffset,
      alignOffset,
      anchor,
      collisionPadding,
      alignItemWithTrigger,
      positionerClassName,
      ...props
    },
    ref,
  ) => {
    return (
      <SelectPortal>
        <SelectPositioner
          side={side}
          align={align}
          sideOffset={sideOffset}
          alignOffset={alignOffset}
          anchor={anchor}
          collisionPadding={collisionPadding}
          alignItemWithTrigger={alignItemWithTrigger}
          className={positionerClassName}
        >
          <SelectPopup ref={ref} {...props} />
        </SelectPositioner>
      </SelectPortal>
    );
  },
);
SelectContent.displayName = "Select.Content";

// Item
export interface SelectItemProps extends Omit<BaseSelect.Item.Props, "className"> {
  className?: string;
  children?: ReactNode;
  /** A line under the item's text, which the trigger does not repeat. */
  description?: ReactNode;
}

const SelectItem = forwardRef<HTMLDivElement, SelectItemProps>(
  ({ className, children, description, ...props }, ref) => {
    return (
      <BaseSelect.Item
        ref={ref}
        className={twMerge(popupItem, popupItemTone.default, className)}
        {...props}
      >
        {description === undefined && (
          <BaseSelect.ItemText className={popupItemLabel(children)}>{children}</BaseSelect.ItemText>
        )}
        {description !== undefined && (
          <span className="flex min-w-0 flex-1 flex-col">
            <BaseSelect.ItemText className="truncate">{children}</BaseSelect.ItemText>
            <span className="text-xs text-surface-400">{description}</span>
          </span>
        )}
        <BaseSelect.ItemIndicator className={popupItemMark}>
          <CheckIcon weight="bold" className="size-3.5" />
        </BaseSelect.ItemIndicator>
      </BaseSelect.Item>
    );
  },
);
SelectItem.displayName = "Select.Item";

// Separator
export interface SelectSeparatorProps extends Omit<BaseSelect.Separator.Props, "className"> {
  className?: string;
}

const SelectSeparator = forwardRef<HTMLDivElement, SelectSeparatorProps>(
  ({ className, ...props }, ref) => {
    return (
      <BaseSelect.Separator ref={ref} className={twMerge(popupSeparator, className)} {...props} />
    );
  },
);
SelectSeparator.displayName = "Select.Separator";

// Group
export interface SelectGroupProps extends Omit<BaseSelect.Group.Props, "className"> {
  className?: string;
  children?: ReactNode;
}

const SelectGroup = forwardRef<HTMLDivElement, SelectGroupProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <BaseSelect.Group ref={ref} className={className} {...props}>
        {children}
      </BaseSelect.Group>
    );
  },
);
SelectGroup.displayName = "Select.Group";

// GroupLabel
export interface SelectGroupLabelProps extends Omit<BaseSelect.GroupLabel.Props, "className"> {
  className?: string;
  children?: ReactNode;
}

const SelectGroupLabel = forwardRef<HTMLDivElement, SelectGroupLabelProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <BaseSelect.GroupLabel ref={ref} className={twMerge(popupGroupLabel, className)} {...props}>
        {children}
      </BaseSelect.GroupLabel>
    );
  },
);
SelectGroupLabel.displayName = "Select.GroupLabel";

/**
 * One choice from a list short enough to read at a glance.
 *
 * A list the reader has to search is a `Combobox`, and two to four choices that fit a row
 * are a `SegmentedControl`.
 */
export const Select = {
  Root: SelectRoot,
  Trigger: SelectTrigger,
  Value: SelectValue,
  Icon: SelectIcon,
  Portal: SelectPortal,
  Positioner: SelectPositioner,
  Popup: SelectPopup,
  Content: SelectContent,
  Item: SelectItem,
  Separator: SelectSeparator,
  Group: SelectGroup,
  GroupLabel: SelectGroupLabel,
};

/** A labelled select over a flat option list in one tag: `Field.Root` around the parts. */

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectFieldProps {
  label?: ReactNode;
  description?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  options: SelectOption[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string | null) => void;
  disabled?: boolean;
  name?: string;
  className?: string;
  triggerClassName?: string;
}

export function SelectField({
  label,
  description,
  error,
  required,
  options,
  value,
  defaultValue,
  onValueChange,
  disabled,
  name,
  className,
  triggerClassName,
}: SelectFieldProps) {
  return (
    <Field.Root
      label={label}
      description={description}
      error={error}
      required={required}
      className={className}
    >
      <SelectRoot
        value={value}
        defaultValue={defaultValue}
        onValueChange={onValueChange}
        disabled={disabled}
        name={name}
      >
        <SelectTrigger className={triggerClassName}>
          <SelectValue>
            {(current) =>
              options.find((o) => o.value === current)?.label ?? (current as string | null) ?? ""
            }
          </SelectValue>
          <SelectIcon />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value} disabled={option.disabled}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </SelectRoot>
    </Field.Root>
  );
}
SelectField.displayName = "SelectField";
