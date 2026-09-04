import { createFileRoute } from "@tanstack/react-router";

import { Library } from "@/pages/Library";

/* Under `/mods` in the address and beside it in the tree, so the folder page
   is the library page and not a child drawn inside it. */
export const Route = createFileRoute("/mods_/folder/$folderId")({
  component: FolderRoute,
});

function FolderRoute() {
  const { folderId } = Route.useParams();
  return <Library folderId={folderId} />;
}
