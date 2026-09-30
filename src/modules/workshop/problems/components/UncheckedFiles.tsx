import { useMemo, useState } from "react";

import { AlertBox, Button, Code, Tooltip } from "@/components";
import { m } from "@/i18n";

import { useProjectProblems } from "../../api";
import { previewDocument } from "../../documents";
import { useProjectContext } from "../../projects/state/ProjectContext";
import { useOpenDocumentTab } from "../../state";
import { splitWadPath, type UncheckedFile, uncheckedFiles } from "../utils/problemGroups";

/** How many files the notice lists before it starts out shut. */
const AUTO_OPEN_LIMIT = 3;

/** How long a row waits before it explains itself, in ms. */
const TIP_DELAY = 500;

/**
 * The files a rule could not check, as one notice above the list.
 *
 * Per "What a run does" in docs/ux/PROJECT_PROBLEMS.md.
 */
export function UncheckedFiles() {
  const project = useProjectContext();
  const { data: run } = useProjectProblems(project.path);
  const files = useMemo(() => uncheckedFiles(run?.failed ?? []), [run]);
  const [chosen, setChosen] = useState<boolean | null>(null);

  if (files.length === 0) return null;

  const open = chosen ?? files.length <= AUTO_OPEN_LIMIT;
  const toggleLabel = open
    ? m.workshop_problems_unchecked_hide_action()
    : m.workshop_problems_unchecked_show_action();

  return (
    <AlertBox
      data-ui="UncheckedFiles"
      variant="warning"
      className="items-start"
      title={m.workshop_problems_unchecked_title({ count: files.length })}
      actions={
        <Button variant="ghost" size="xs" aria-expanded={open} onClick={() => setChosen(!open)}>
          {toggleLabel}
        </Button>
      }
    >
      {open && (
        <ul className="mt-1 flex max-h-40 flex-col overflow-auto scrollbar-md">
          {files.map((file) => (
            <li key={file.id}>
              <UncheckedFileRow file={file} />
            </li>
          ))}
        </ul>
      )}
    </AlertBox>
  );
}

/** One file, the reason it was not checked, and the way into it. */
function UncheckedFileRow({ file }: { file: UncheckedFile }) {
  const project = useProjectContext();
  const openTab = useOpenDocumentTab();
  const { site } = file;
  const name = site ? splitWadPath(site.path).inner : file.rules[0];

  const line = (
    <span className="flex min-w-0 flex-1 items-baseline gap-2">
      {site && <span className="shrink-0 text-meta text-surface-400">{site.layer}</span>}
      <span className="max-w-3/5 min-w-0 shrink-0 truncate font-mono text-code text-surface-100">
        {name}
      </span>
      <span className="min-w-0 flex-1 truncate text-meta text-surface-400">{file.reasons[0]}</span>
    </span>
  );

  if (!site) {
    return (
      <Tooltip content={<UncheckedTip file={file} />} delay={TIP_DELAY}>
        <div className="flex h-6 items-center px-1">{line}</div>
      </Tooltip>
    );
  }

  const { layer, path } = site;

  function handleOpen() {
    openTab(previewDocument({ kind: "layer", project: project.path, layer, path }));
  }

  return (
    <Tooltip content={<UncheckedTip file={file} />} delay={TIP_DELAY}>
      <button
        type="button"
        onClick={handleOpen}
        /* DS-VEIL */
        className="flex h-6 w-full cursor-pointer items-center rounded-sm px-1 text-left outline-none hover:bg-surface-veil focus-visible:ring-1 focus-visible:ring-accent-500/60"
      >
        {line}
      </button>
    </Tooltip>
  );
}

function UncheckedTip({ file }: { file: UncheckedFile }) {
  return (
    <div className="flex max-w-md flex-col gap-2 py-1 text-meta">
      {file.reasons.map((reason) => (
        <span key={reason} className="text-surface-200">
          {reason}
        </span>
      ))}

      {file.site && (
        /* DS-CODE-CHIP */
        <span className="min-w-0">
          <Code>{`${file.site.layer} · ${file.site.path}`}</Code>
        </span>
      )}

      <span className="text-surface-500">{file.rules.join(", ")}</span>
    </div>
  );
}
