import { createFileRoute } from "@tanstack/react-router";

import { NativePage } from "@/modules/native";

export const Route = createFileRoute("/native")({
  component: NativePage,
});
