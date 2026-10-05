import type { ReactNode } from "react";

/** The family a component is listed with in the dev gallery. */
export type GalleryFamily =
  | "buttons"
  | "fields"
  | "floating"
  | "feedback"
  | "dialogs"
  | "navigation"
  | "data";

/** One state of a component, as the gallery draws it. */
export interface GalleryCase {
  name: string;
  render: () => ReactNode;
}

/** A component's states in the dev gallery, default-exported from `<Component>.gallery.tsx`. */
export interface GalleryEntry {
  name: string;
  family: GalleryFamily;
  cases: GalleryCase[];
}
