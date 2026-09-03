import { useLocation } from "@tanstack/react-router";
import { useEffect } from "react";

import { useUpdaterDialogOpener, useUpdaterDropCheckOpening, useUpdaterUpdate } from "@/stores";

import { UpdateChangelogDialog } from "./UpdateChangelogDialog";

/** Home draws the notes the dialog would cover. */
const HOME_PATH = "/";

/** The update dialog, mounted once for the app. Its claim is conditional on the route, per ADR-0022. */
export function UpdateNotification() {
  const update = useUpdaterUpdate();
  const opener = useUpdaterDialogOpener();
  const dropCheckOpening = useUpdaterDropCheckOpening();
  const { pathname } = useLocation();
  const withheld = opener === "check" && pathname === HOME_PATH;

  useEffect(() => {
    if (withheld) dropCheckOpening();
  }, [withheld, dropCheckOpening]);

  if (!update || withheld) return null;
  return <UpdateChangelogDialog />;
}
