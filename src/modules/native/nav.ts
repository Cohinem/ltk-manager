import type { ComponentType } from "react";

import { LayerIcon } from "@/components";

type NavItem = {
  to: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  exact: boolean;
};

const nativeItem: NavItem = { to: "/native", label: "Native", icon: LayerIcon, exact: true };

/**
 * The fork's tab, injected after the Library tab (appended if that route is
 * ever renamed upstream) so the upstream navItems array stays untouched.
 */
export function withNativeNav(items: readonly NavItem[]): NavItem[] {
  const after = items.findIndex((item) => item.to === "/mods");
  if (after === -1) return [...items, nativeItem];
  return [...items.slice(0, after + 1), nativeItem, ...items.slice(after + 1)];
}
