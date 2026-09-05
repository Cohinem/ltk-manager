import { CubeIcon } from "@phosphor-icons/react";
import type { ComponentType } from "react";

import { ChampionIcon, SkinIcon } from "@/components";

/** A glyph sized and tinted by its caller. */
export type ObjectIcon = ComponentType<{ className?: string }>;

/**
 * The mark for an object of `objectClass`, per "The object block" in
 * docs/ux/BIN_EDITOR.md: the champion mark for a `Champion`, the skin mark for a
 * `SkinCharacterDataProperties`, and the cube for every other class.
 */
export function objectIcon(objectClass: string | null | undefined): ObjectIcon {
  switch (objectClass) {
    case "Champion":
      return ChampionIcon;
    case "SkinCharacterDataProperties":
      return SkinIcon;
    default:
      return CubeIcon;
  }
}

interface ObjectGlyphProps {
  /** The class the object declares, or null where nothing names one. */
  objectClass: string | null | undefined;
  className?: string;
}

/** An object's mark, by the class it declares. */
export function ObjectGlyph({ objectClass, className }: ObjectGlyphProps) {
  const Icon = objectIcon(objectClass);
  return <Icon className={className} />;
}
