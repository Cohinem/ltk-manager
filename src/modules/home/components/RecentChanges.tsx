import { Button } from "@/components";
import { m } from "@/i18n";
import { useAppInfo } from "@/modules/settings";
import { ReleaseHistory, ReleaseSection } from "@/modules/updater";
import { useUpdaterSetDialogOpen, useUpdaterUpdate } from "@/stores";

import { bundledReleaseNote } from "../api";
import { Tile } from "./Tile";

/** The notes the build ships, read once: they cannot change while it runs. */
const BUNDLED = bundledReleaseNote();

/**
 * The release feed, with the installed version marked and the pending one first.
 *
 * Per "Recent changes" in docs/ux/HOME.md. The install itself stays on the
 * dialog, which the Update button opens as the title bar cell does.
 */
export function RecentChanges() {
  const { data: appInfo } = useAppInfo();
  const update = useUpdaterUpdate();
  const setDialogOpen = useUpdaterSetDialogOpen();

  return (
    <Tile title={m.home_changes_title()} data-ui="RecentChanges" className="min-h-0 flex-1">
      <div className="min-h-0 flex-1 overflow-y-auto px-4 select-none">
        {update && (
          <ReleaseSection
            pending
            version={update.version}
            body={update.body}
            action={
              <Button variant="filled" size="xs" onClick={() => setDialogOpen(true)}>
                {m.home_release_update_action()}
              </Button>
            }
          />
        )}
        <ReleaseHistory
          enabled
          excludeVersion={update?.version}
          installedVersion={appInfo?.version}
          placeholder={BUNDLED}
        />
      </div>
    </Tile>
  );
}
