import { AlertBox } from "@/components";
import type { RuleInfo } from "@/lib/tauri";

import { useDormantRules } from "./runCatalogue";

/**
 * The checks looking ahead of the game this machine has installed.
 *
 * Their findings are in the list below, muted, because a change Riot has not
 * deployed has broken nothing yet and repairing it early breaks the mod on the
 * client the user has. This is what says why those rows are dim, and it draws
 * only while the forward-looking linter is on - with it off there are no such
 * rows to explain.
 */
export function DormantRules() {
  const waiting = useDormantRules();
  if (waiting.length === 0) return null;

  return (
    <div className="flex shrink-0 flex-col gap-2 pb-2">
      {waiting.map((info) => (
        <DormantRule key={info.id} info={info} />
      ))}
    </div>
  );
}

interface DormantRuleProps {
  /** Narrowed by the caller, which filtered on the dormant state. */
  info: RuleInfo;
}

function DormantRule({ info }: DormantRuleProps) {
  if (info.state.kind !== "dormant") return null;

  return (
    <AlertBox variant="info" title={`${info.title} is looking ahead`}>
      <span className="flex flex-col gap-0.5">
        <span className="select-text">{info.state.reason}</span>
        <span className="text-meta text-surface-500">
          Forward-looking Meta Linter, in the project editor settings
        </span>
      </span>
    </AlertBox>
  );
}
