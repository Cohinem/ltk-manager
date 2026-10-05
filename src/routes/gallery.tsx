import { createFileRoute, redirect } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

import { LoadingState } from "@/components";

/* The import sits behind the flag, so a release build never emits the gallery's chunk. */
const GalleryLazy = import.meta.env.DEV
  ? lazy(() => import("@/modules/gallery").then((module) => ({ default: module.Gallery })))
  : null;

function GalleryRoute() {
  if (GalleryLazy === null) return null;

  return (
    <Suspense fallback={<LoadingState />}>
      <GalleryLazy />
    </Suspense>
  );
}

export const Route = createFileRoute("/gallery")({
  beforeLoad: () => {
    if (!import.meta.env.DEV) throw redirect({ to: "/" });
  },
  component: GalleryRoute,
});
