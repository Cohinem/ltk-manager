import { FolderOpenIcon } from "@phosphor-icons/react";

import { Accordion, FilesystemPath, type FilesystemPathProps } from "@/components";
import { m } from "@/i18n";
import type { IntegrationStatus } from "@/lib/tauri";

/** The managed, external and handler installation paths. */
export function IntegrationPaths({
  status,
  externalPaths,
}: {
  status: IntegrationStatus;
  externalPaths: string[];
}) {
  const pathGroups: { title: string; kind: FilesystemPathProps["kind"]; paths: string[] }[] = [
    {
      title: m.settings_integrations_managed_path_label(),
      kind: "directory",
      paths: status.directory ? [status.directory] : [],
    },
    { title: m.settings_integrations_external_label(), kind: "executable", paths: externalPaths },
    {
      title: m.settings_integrations_handler_title(),
      kind: "library",
      paths: status.handlerPath ? [status.handlerPath] : [],
    },
  ];
  const populatedGroups = pathGroups.filter((group) => group.paths.length > 0);
  if (populatedGroups.length === 0) return null;
  return (
    <Accordion.Root variant="filled" data-ui="IntegrationPaths" className="-mx-3">
      <Accordion.Item variant="filled">
        <Accordion.Trigger variant="filled" className="text-row font-medium text-surface-200">
          <FolderOpenIcon weight="duotone" className="h-4 w-4 shrink-0 text-surface-400" />
          {m.settings_integrations_paths_label()}
          {externalPaths.length > 0 && (
            <span className="text-meta font-normal text-surface-400">
              {m.settings_integrations_external_count_label({ count: externalPaths.length })}
            </span>
          )}
        </Accordion.Trigger>
        <Accordion.Panel variant="filled">
          <div className="flex min-w-0 flex-col gap-3 p-3">
            {populatedGroups.map((group) => (
              <div key={group.title} className="flex min-w-0 flex-col gap-2">
                <p className="text-meta font-medium text-surface-400">{group.title}</p>
                <ul aria-label={group.title} className="flex min-w-0 flex-col gap-2">
                  {group.paths.map((path) => (
                    <li key={path} className="min-w-0">
                      <FilesystemPath value={path} kind={group.kind} aria-label={group.title} />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Accordion.Panel>
      </Accordion.Item>
    </Accordion.Root>
  );
}
