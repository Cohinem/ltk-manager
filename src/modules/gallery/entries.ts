import type { GalleryEntry, GalleryFamily } from "@/components";

const modules = import.meta.glob<{ default: GalleryEntry }>("../../components/**/*.gallery.tsx", {
  eager: true,
});

/** The families, in the order the gallery lists them. */
export const FAMILIES: ReadonlyArray<{ id: GalleryFamily; label: string }> = [
  { id: "buttons", label: "Buttons" },
  { id: "fields", label: "Fields" },
  { id: "floating", label: "Floating surfaces" },
  { id: "feedback", label: "Feedback" },
  { id: "dialogs", label: "Dialogs" },
  { id: "navigation", label: "Navigation" },
  { id: "data", label: "Data" },
];

/** Every `*.gallery.tsx` beside a shared component, by name. */
export const ENTRIES: GalleryEntry[] = Object.values(modules)
  .map((module) => module.default)
  .sort((a, b) => a.name.localeCompare(b.name));
