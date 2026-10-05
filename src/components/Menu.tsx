import { Menu as BaseMenu } from "@base-ui/react/menu";
import { CaretRightIcon, CheckIcon } from "@phosphor-icons/react";
import { forwardRef, type ReactNode } from "react";

import { twMerge } from "@/utils";

import { Kbd } from "./Kbd";
import {
  popupGroupLabel,
  popupItem,
  popupItemLabel,
  popupItemMark,
  type PopupItemTone,
  popupItemTone,
  popupMotion,
  popupSeparator,
  popupSurface,
} from "./popup";

// Root
export interface MenuRootProps extends BaseMenu.Root.Props {
  children?: ReactNode;
}

const MenuRoot = ({ children, ...props }: MenuRootProps) => {
  return <BaseMenu.Root {...props}>{children}</BaseMenu.Root>;
};
MenuRoot.displayName = "Menu.Root";

// Trigger
export interface MenuTriggerProps extends Omit<BaseMenu.Trigger.Props, "className"> {
  className?: string;
  children?: ReactNode;
}

const MenuTrigger = forwardRef<HTMLButtonElement, MenuTriggerProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <BaseMenu.Trigger ref={ref} className={className} {...props}>
        {children}
      </BaseMenu.Trigger>
    );
  },
);
MenuTrigger.displayName = "Menu.Trigger";

// Portal
export interface MenuPortalProps extends BaseMenu.Portal.Props {
  children?: ReactNode;
}

const MenuPortal = ({ children, ...props }: MenuPortalProps) => {
  return <BaseMenu.Portal {...props}>{children}</BaseMenu.Portal>;
};
MenuPortal.displayName = "Menu.Portal";

// Positioner
export interface MenuPositionerProps extends Omit<BaseMenu.Positioner.Props, "className"> {
  className?: string;
  children?: ReactNode;
}

const MenuPositioner = forwardRef<HTMLDivElement, MenuPositionerProps>(
  ({ className, children, side = "bottom", align = "end", sideOffset = 4, ...props }, ref) => {
    return (
      <BaseMenu.Positioner
        ref={ref}
        side={side}
        align={align}
        sideOffset={sideOffset}
        className={twMerge("z-50", className)}
        {...props}
      >
        {children}
      </BaseMenu.Positioner>
    );
  },
);
MenuPositioner.displayName = "Menu.Positioner";

// Popup
export interface MenuPopupProps extends Omit<BaseMenu.Popup.Props, "className"> {
  className?: string;
  children?: ReactNode;
}

const MenuPopup = forwardRef<HTMLDivElement, MenuPopupProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <BaseMenu.Popup
        ref={ref}
        className={twMerge("min-w-40 p-1", popupSurface, popupMotion, className)}
        {...props}
      >
        {children}
      </BaseMenu.Popup>
    );
  },
);
MenuPopup.displayName = "Menu.Popup";

// Item
export type MenuItemVariant = PopupItemTone;

export interface MenuItemProps extends Omit<BaseMenu.Item.Props, "className"> {
  icon?: ReactNode;
  shortcut?: string;
  variant?: MenuItemVariant;
  className?: string;
  children?: ReactNode;
}

/** The leading slot, sized so rows with and without an icon still line up. */
const MenuItemIcon = ({ children }: { children: ReactNode }) => (
  <span className="size-4 shrink-0 opacity-70">{children}</span>
);

const MenuItem = forwardRef<HTMLDivElement, MenuItemProps>(
  ({ icon, shortcut, variant = "default", className, children, ...props }, ref) => {
    return (
      <BaseMenu.Item
        ref={ref}
        className={twMerge(popupItem, popupItemTone[variant], className)}
        {...props}
      >
        {icon && <MenuItemIcon>{icon}</MenuItemIcon>}
        <span className={popupItemLabel(children)}>{children}</span>
        {shortcut && <Kbd shortcut={shortcut} />}
      </BaseMenu.Item>
    );
  },
);
MenuItem.displayName = "Menu.Item";

// SubmenuRoot
export interface MenuSubmenuRootProps extends BaseMenu.SubmenuRoot.Props {
  children?: ReactNode;
}

const MenuSubmenuRoot = ({ children, ...props }: MenuSubmenuRootProps) => {
  return <BaseMenu.SubmenuRoot {...props}>{children}</BaseMenu.SubmenuRoot>;
};
MenuSubmenuRoot.displayName = "Menu.SubmenuRoot";

// SubmenuTrigger
export interface MenuSubmenuTriggerProps extends Omit<BaseMenu.SubmenuTrigger.Props, "className"> {
  icon?: ReactNode;
  className?: string;
  children?: ReactNode;
}

const MenuSubmenuTrigger = forwardRef<HTMLDivElement, MenuSubmenuTriggerProps>(
  ({ icon, openOnHover = true, className, children, ...props }, ref) => {
    return (
      <BaseMenu.SubmenuTrigger
        ref={ref}
        // Base UI leaves this off, which makes a submenu a two-click affair.
        // Pointing at the row is how a desktop menu opens one.
        openOnHover={openOnHover}
        className={twMerge(
          popupItem,
          popupItemTone.default,
          // An open submenu keeps its trigger lit, or the row the pointer left
          // to reach the submenu reads as no longer chosen.
          "data-[popup-open]:bg-surface-veil data-[popup-open]:text-surface-50",
          className,
        )}
        {...props}
      >
        {icon && <MenuItemIcon>{icon}</MenuItemIcon>}
        <span className={popupItemLabel(children)}>{children}</span>
        <CaretRightIcon className="size-3.5 shrink-0 opacity-70" weight="bold" />
      </BaseMenu.SubmenuTrigger>
    );
  },
);
MenuSubmenuTrigger.displayName = "Menu.SubmenuTrigger";

// SubmenuPositioner
export interface MenuSubmenuPositionerProps extends Omit<BaseMenu.Positioner.Props, "className"> {
  className?: string;
  children?: ReactNode;
}

/**
 * [`MenuPositioner`] aimed sideways, which is the only thing a submenu changes
 * about where its popup lands.
 */
const MenuSubmenuPositioner = forwardRef<HTMLDivElement, MenuSubmenuPositionerProps>(
  ({ side = "inline-end", align = "start", sideOffset = 4, ...props }, ref) => {
    return (
      <MenuPositioner ref={ref} side={side} align={align} sideOffset={sideOffset} {...props} />
    );
  },
);
MenuSubmenuPositioner.displayName = "Menu.SubmenuPositioner";

// RadioGroup
export interface MenuRadioGroupProps extends Omit<BaseMenu.RadioGroup.Props, "className"> {
  className?: string;
  children?: ReactNode;
}

const MenuRadioGroup = ({ className, children, ...props }: MenuRadioGroupProps) => {
  return (
    <BaseMenu.RadioGroup className={className} {...props}>
      {children}
    </BaseMenu.RadioGroup>
  );
};
MenuRadioGroup.displayName = "Menu.RadioGroup";

// RadioItem
export interface MenuRadioItemProps extends Omit<BaseMenu.RadioItem.Props, "className"> {
  icon?: ReactNode;
  className?: string;
  children?: ReactNode;
}

/**
 * One choice in a [`MenuRadioGroup`]. `icon` says what the choice is and the
 * trailing check says whether it is the current one, so a row that carries both
 * answers two questions rather than overloading one slot.
 */
const MenuRadioItem = forwardRef<HTMLDivElement, MenuRadioItemProps>(
  ({ icon, className, children, ...props }, ref) => {
    return (
      <BaseMenu.RadioItem
        ref={ref}
        className={twMerge(popupItem, popupItemTone.default, className)}
        {...props}
      >
        {icon && <MenuItemIcon>{icon}</MenuItemIcon>}
        <span className={popupItemLabel(children)}>{children}</span>
        <BaseMenu.RadioItemIndicator className={popupItemMark}>
          <CheckIcon className="size-3.5" weight="bold" />
        </BaseMenu.RadioItemIndicator>
      </BaseMenu.RadioItem>
    );
  },
);
MenuRadioItem.displayName = "Menu.RadioItem";

// CheckboxItem
export interface MenuCheckboxItemProps extends Omit<BaseMenu.CheckboxItem.Props, "className"> {
  icon?: ReactNode;
  className?: string;
  children?: ReactNode;
}

/** A switch in a popup, whose trailing check says whether it is on. */
const MenuCheckboxItem = forwardRef<HTMLDivElement, MenuCheckboxItemProps>(
  ({ icon, className, children, ...props }, ref) => {
    return (
      <BaseMenu.CheckboxItem
        ref={ref}
        className={twMerge(popupItem, popupItemTone.default, className)}
        {...props}
      >
        {icon && <MenuItemIcon>{icon}</MenuItemIcon>}
        <span className={popupItemLabel(children)}>{children}</span>
        <BaseMenu.CheckboxItemIndicator className={popupItemMark}>
          <CheckIcon className="size-3.5" weight="bold" />
        </BaseMenu.CheckboxItemIndicator>
      </BaseMenu.CheckboxItem>
    );
  },
);
MenuCheckboxItem.displayName = "Menu.CheckboxItem";

// Separator
export interface MenuSeparatorProps extends Omit<BaseMenu.Separator.Props, "className"> {
  className?: string;
}

const MenuSeparator = forwardRef<HTMLDivElement, MenuSeparatorProps>(
  ({ className, ...props }, ref) => {
    return (
      <BaseMenu.Separator ref={ref} className={twMerge(popupSeparator, className)} {...props} />
    );
  },
);
MenuSeparator.displayName = "Menu.Separator";

// Group
export interface MenuGroupProps extends Omit<BaseMenu.Group.Props, "className"> {
  className?: string;
  children?: ReactNode;
}

const MenuGroup = forwardRef<HTMLDivElement, MenuGroupProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <BaseMenu.Group ref={ref} className={className} {...props}>
        {children}
      </BaseMenu.Group>
    );
  },
);
MenuGroup.displayName = "Menu.Group";

// GroupLabel
export interface MenuGroupLabelProps extends Omit<BaseMenu.GroupLabel.Props, "className"> {
  className?: string;
  children?: ReactNode;
}

const MenuGroupLabel = forwardRef<HTMLDivElement, MenuGroupLabelProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <BaseMenu.GroupLabel ref={ref} className={twMerge(popupGroupLabel, className)} {...props}>
        {children}
      </BaseMenu.GroupLabel>
    );
  },
);
MenuGroupLabel.displayName = "Menu.GroupLabel";

// Content
export interface MenuContentProps
  extends
    MenuPopupProps,
    Pick<
      MenuPositionerProps,
      "side" | "align" | "sideOffset" | "alignOffset" | "anchor" | "collisionPadding"
    > {
  positionerClassName?: string;
}

/** Portal, Positioner and Popup as one part, taking the positioning props itself. */
const MenuContent = forwardRef<HTMLDivElement, MenuContentProps>(
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
      <MenuPortal>
        <MenuPositioner
          side={side}
          align={align}
          sideOffset={sideOffset}
          alignOffset={alignOffset}
          anchor={anchor}
          collisionPadding={collisionPadding}
          className={positionerClassName}
        >
          <MenuPopup ref={ref} {...props} />
        </MenuPositioner>
      </MenuPortal>
    );
  },
);
MenuContent.displayName = "Menu.Content";

// SubmenuContent
export interface MenuSubmenuContentProps
  extends
    MenuPopupProps,
    Pick<
      MenuPositionerProps,
      "side" | "align" | "sideOffset" | "alignOffset" | "anchor" | "collisionPadding"
    > {
  positionerClassName?: string;
}

/** The submenu's Portal, Positioner and Popup as one part, aimed sideways. */
const MenuSubmenuContent = forwardRef<HTMLDivElement, MenuSubmenuContentProps>(
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
      <MenuPortal>
        <MenuSubmenuPositioner
          side={side}
          align={align}
          sideOffset={sideOffset}
          alignOffset={alignOffset}
          anchor={anchor}
          collisionPadding={collisionPadding}
          className={positionerClassName}
        >
          <MenuPopup ref={ref} {...props} />
        </MenuSubmenuPositioner>
      </MenuPortal>
    );
  },
);
MenuSubmenuContent.displayName = "Menu.SubmenuContent";

/**
 * A list of actions opened from a button.
 *
 * The same list on a right click is a `ContextMenu`, and a choice kept as a value is a
 * `Select`.
 */
export const Menu = {
  Root: MenuRoot,
  Trigger: MenuTrigger,
  Portal: MenuPortal,
  Positioner: MenuPositioner,
  Popup: MenuPopup,
  Content: MenuContent,
  SubmenuContent: MenuSubmenuContent,
  Item: MenuItem,
  SubmenuRoot: MenuSubmenuRoot,
  SubmenuTrigger: MenuSubmenuTrigger,
  SubmenuPositioner: MenuSubmenuPositioner,
  RadioGroup: MenuRadioGroup,
  RadioItem: MenuRadioItem,
  CheckboxItem: MenuCheckboxItem,
  Separator: MenuSeparator,
  Group: MenuGroup,
  GroupLabel: MenuGroupLabel,
};
