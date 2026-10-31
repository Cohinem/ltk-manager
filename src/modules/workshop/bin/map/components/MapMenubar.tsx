import { use } from "react";

import { ClassMenubar } from "../../menus/components/ClassMenubar";
import { useObjectMenus } from "../../menus/hooks/useObjectMenus";
import { ObjectMenuContext } from "../../menus/state/objectMenu";
import { useMapMenus } from "../hooks/useMapMenus";
import { useMapTabSave } from "../hooks/useMapTabSave";

/** The menu bar of a `Map`, a `MapSkin` or a `MapContainer`. "Menu bar" in docs/ux/MAP_EDITOR.md. */
export function MapMenubar() {
  const base = useObjectMenus();
  const menu = use(ObjectMenuContext);
  const map = useMapMenus(menu?.mode === "properties");

  useMapTabSave(menu?.documentId ?? null);

  return (
    <>
      <ClassMenubar
        menus={[
          base.file(map.file),
          base.edit(map.edit),
          map.insert,
          map.tools,
          base.view(map.view),
          map.map,
        ]}
      />
      {map.dialogs}
    </>
  );
}
