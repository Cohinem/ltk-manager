import { ContextMenu as BaseContextMenu } from "@base-ui/react/context-menu";
import { forwardRef, type ReactNode } from "react";

import { twMerge } from "@/utils";

import {
  MenuCheckboxItem,
  type MenuCheckboxItemProps,
  MenuGroup,
  MenuGroupLabel,
  type MenuGroupLabelProps,
  type MenuGroupProps,
  MenuItem,
  type MenuItemProps,
  type MenuItemVariant,
  MenuRadioGroup,
  type MenuRadioGroupProps,
  MenuRadioItem,
  type MenuRadioItemProps,
  MenuSeparator,
  type MenuSeparatorProps,
  MenuSubmenuRoot,
  type MenuSubmenuRootProps,
  MenuSubmenuTrigger,
  type MenuSubmenuTriggerProps,
} from "./Menu";
import { popupMotion, popupSurface } from "./popup";

// Root
export interface ContextMenuRootProps extends BaseContextMenu.Root.Props {
  children?: ReactNode;
}

export const ContextMenuRoot = ({ children, ...props }: ContextMenuRootProps) => {
  return <BaseContextMenu.Root {...props}>{children}</BaseContextMenu.Root>;
};
ContextMenuRoot.displayName = "ContextMenu.Root";

// Trigger
export interface ContextMenuTriggerProps extends Omit<BaseContextMenu.Trigger.Props, "className"> {
  className?: string;
  children?: ReactNode;
}

export const ContextMenuTrigger = forwardRef<HTMLDivElement, ContextMenuTriggerProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <BaseContextMenu.Trigger ref={ref} className={className} {...props}>
        {children}
      </BaseContextMenu.Trigger>
    );
  },
);
ContextMenuTrigger.displayName = "ContextMenu.Trigger";

// Portal
export interface ContextMenuPortalProps extends BaseContextMenu.Portal.Props {
  children?: ReactNode;
}

export const ContextMenuPortal = ({ children, ...props }: ContextMenuPortalProps) => {
  return <BaseContextMenu.Portal {...props}>{children}</BaseContextMenu.Portal>;
};
ContextMenuPortal.displayName = "ContextMenu.Portal";

// Positioner
export interface ContextMenuPositionerProps extends Omit<
  BaseContextMenu.Positioner.Props,
  "className"
> {
  className?: string;
  children?: ReactNode;
}

export const ContextMenuPositioner = forwardRef<HTMLDivElement, ContextMenuPositionerProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <BaseContextMenu.Positioner ref={ref} className={twMerge("z-50", className)} {...props}>
        {children}
      </BaseContextMenu.Positioner>
    );
  },
);
ContextMenuPositioner.displayName = "ContextMenu.Positioner";

// Popup
export interface ContextMenuPopupProps extends Omit<BaseContextMenu.Popup.Props, "className"> {
  className?: string;
  children?: ReactNode;
}

export const ContextMenuPopup = forwardRef<HTMLDivElement, ContextMenuPopupProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <BaseContextMenu.Popup
        ref={ref}
        className={twMerge("min-w-40 p-1", popupSurface, popupMotion, className)}
        {...props}
      >
        {children}
      </BaseContextMenu.Popup>
    );
  },
);
ContextMenuPopup.displayName = "ContextMenu.Popup";

/*
 * Base UI's context menu draws its rows with the menu's own parts, so the rows here are the
 * `Menu` ones under the context menu's names. A row added to one is in the other.
 */
export type ContextMenuItemVariant = MenuItemVariant;
export type ContextMenuItemProps = MenuItemProps;
export type ContextMenuSeparatorProps = MenuSeparatorProps;
export type ContextMenuSubmenuRootProps = MenuSubmenuRootProps;
export type ContextMenuSubmenuTriggerProps = MenuSubmenuTriggerProps;
export type ContextMenuRadioGroupProps = MenuRadioGroupProps;
export type ContextMenuRadioItemProps = MenuRadioItemProps;
export type ContextMenuCheckboxItemProps = MenuCheckboxItemProps;
export type ContextMenuGroupProps = MenuGroupProps;
export type ContextMenuGroupLabelProps = MenuGroupLabelProps;

export const ContextMenuItem = MenuItem;
export const ContextMenuSeparator = MenuSeparator;
export const ContextMenuSubmenuRoot = MenuSubmenuRoot;
export const ContextMenuSubmenuTrigger = MenuSubmenuTrigger;
export const ContextMenuRadioGroup = MenuRadioGroup;
export const ContextMenuRadioItem = MenuRadioItem;
export const ContextMenuCheckboxItem = MenuCheckboxItem;
export const ContextMenuGroup = MenuGroup;
export const ContextMenuGroupLabel = MenuGroupLabel;

// SubmenuPositioner
/** `ContextMenuPositioner` aimed sideways, which is what a submenu changes about its popup. */
export const ContextMenuSubmenuPositioner = forwardRef<HTMLDivElement, ContextMenuPositionerProps>(
  ({ side = "inline-end", align = "start", sideOffset = 4, ...props }, ref) => {
    return (
      <ContextMenuPositioner
        ref={ref}
        side={side}
        align={align}
        sideOffset={sideOffset}
        {...props}
      />
    );
  },
);
ContextMenuSubmenuPositioner.displayName = "ContextMenu.SubmenuPositioner";

// Content
export interface ContextMenuContentProps
  extends
    ContextMenuPopupProps,
    Pick<
      ContextMenuPositionerProps,
      "side" | "align" | "sideOffset" | "alignOffset" | "anchor" | "collisionPadding"
    > {
  positionerClassName?: string;
}

/** Portal, Positioner and Popup as one part, taking the positioning props itself. */
export const ContextMenuContent = forwardRef<HTMLDivElement, ContextMenuContentProps>(
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
      <ContextMenuPortal>
        <ContextMenuPositioner
          side={side}
          align={align}
          sideOffset={sideOffset}
          alignOffset={alignOffset}
          anchor={anchor}
          collisionPadding={collisionPadding}
          className={positionerClassName}
        >
          <ContextMenuPopup ref={ref} {...props} />
        </ContextMenuPositioner>
      </ContextMenuPortal>
    );
  },
);
ContextMenuContent.displayName = "ContextMenu.Content";

// SubmenuContent
export interface ContextMenuSubmenuContentProps
  extends
    ContextMenuPopupProps,
    Pick<
      ContextMenuPositionerProps,
      "side" | "align" | "sideOffset" | "alignOffset" | "anchor" | "collisionPadding"
    > {
  positionerClassName?: string;
}

/** The submenu's Portal, Positioner and Popup as one part, aimed sideways. */
export const ContextMenuSubmenuContent = forwardRef<HTMLDivElement, ContextMenuSubmenuContentProps>(
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
      <ContextMenuPortal>
        <ContextMenuSubmenuPositioner
          side={side}
          align={align}
          sideOffset={sideOffset}
          alignOffset={alignOffset}
          anchor={anchor}
          collisionPadding={collisionPadding}
          className={positionerClassName}
        >
          <ContextMenuPopup ref={ref} {...props} />
        </ContextMenuSubmenuPositioner>
      </ContextMenuPortal>
    );
  },
);
ContextMenuSubmenuContent.displayName = "ContextMenu.SubmenuContent";

/**
 * The menu a right click opens on its trigger.
 *
 * It lists what `Menu` lists, with the same rows: `Item`, `RadioGroup` and `RadioItem`,
 * `CheckboxItem`, `Group` and `GroupLabel`, `Separator`, and a submenu.
 */
export const ContextMenu = {
  Root: ContextMenuRoot,
  Trigger: ContextMenuTrigger,
  Portal: ContextMenuPortal,
  Positioner: ContextMenuPositioner,
  Popup: ContextMenuPopup,
  Content: ContextMenuContent,
  SubmenuContent: ContextMenuSubmenuContent,
  Item: ContextMenuItem,
  RadioGroup: ContextMenuRadioGroup,
  RadioItem: ContextMenuRadioItem,
  CheckboxItem: ContextMenuCheckboxItem,
  Group: ContextMenuGroup,
  GroupLabel: ContextMenuGroupLabel,
  Separator: ContextMenuSeparator,
  SubmenuRoot: ContextMenuSubmenuRoot,
  SubmenuTrigger: ContextMenuSubmenuTrigger,
  SubmenuPositioner: ContextMenuSubmenuPositioner,
};
