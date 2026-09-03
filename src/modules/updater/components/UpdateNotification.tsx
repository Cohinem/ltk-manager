import { useLocation } from "@tanstack/react-router";
import { useEffect } from "react";

import { useUpdaterDialogOpener, useUpdaterDropCheckOpening, useUpdaterUpdate } from "@/stores";

import { UpdateChangelogDialog } from "./UpdateChangelogDialog";

/** Home draws the notes the dialog would cover. */
const HOME_PATH = "/";

/**
 * The update dialog, mounted once for the app.
 *
 * The check's opening is dropped over Home rather than deferred: the notes are
 * on the page under it and the title bar cell keeps the way back, so the claim
 * on the screen is conditional on the route while its place in the order stays
 * what ADR-0022 decided. A press opens the dialog on any route.
 */
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
