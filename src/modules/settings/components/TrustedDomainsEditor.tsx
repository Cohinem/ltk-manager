import { PlusIcon, XIcon } from "@phosphor-icons/react";
import { useRef, useState } from "react";

import { Button, Field, ListEditor, type ListEditorAction, useToast } from "@/components";

import { useLoadedSettings, useUpdateSettings } from "../api";

export function TrustedDomainsEditor() {
  const settings = useLoadedSettings();
  const update = useUpdateSettings();
  const [newDomain, setNewDomain] = useState("");
  const { toast } = useToast();

  const domains = settings.trustedDomains ?? [];

  /* Undo fires long after the save that armed it, so it reads settings as they are by then. */
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const trimmed = newDomain.trim().toLowerCase();
  const alreadyTrusted = !!trimmed && domains.includes(trimmed);

  function addDomain() {
    if (!trimmed || alreadyTrusted) return;
    update({ trustedDomains: [...domains, trimmed] });
    setNewDomain("");
  }

  function removeDomain(domain: string) {
    const index = domains.indexOf(domain);
    update({ trustedDomains: domains.filter((d) => d !== domain) });

    toast({
      title: `Removed ${domain}`,
      type: "info",
      action: {
        label: "Undo",
        onClick: () => {
          const current = settingsRef.current;
          const restored = [...(current.trustedDomains ?? [])];
          restored.splice(index, 0, domain);
          update({ trustedDomains: restored });
        },
      },
    });
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      addDomain();
    }
  }

  const actions: ListEditorAction<string>[] = [
    {
      icon: <XIcon weight="bold" className="size-3.5" />,
      label: (domain) => `Remove ${domain}`,
      variant: "danger",
      onSelect: removeDomain,
    },
  ];

  return (
    <ListEditor
      items={domains}
      itemKey={(domain) => domain}
      layout="wrap"
      actions={actions}
      renderItem={(domain) => (
        <span className="truncate font-mono text-sm text-surface-200 select-text">{domain}</span>
      )}
      empty={
        <p className="rounded-lg border border-dashed border-surface-700 px-3 py-4 text-center text-xs text-surface-500">
          No trusted domains, so one-click links install from any source.
        </p>
      }
      footer={
        <div className="flex flex-col gap-1">
          <div className="flex gap-2">
            <Field.Control
              type="text"
              value={newDomain}
              onChange={(e) => setNewDomain(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="e.g. example.com"
              hasError={alreadyTrusted}
              className="min-w-0 flex-1"
            />
            <Button
              variant="outline"
              left={<PlusIcon weight="bold" className="size-4" />}
              onClick={addDomain}
              disabled={!trimmed || alreadyTrusted}
              className="shrink-0"
            >
              Add
            </Button>
          </div>
          {alreadyTrusted && (
            <p className="px-1 text-xs text-danger-text">That domain is already trusted.</p>
          )}
        </div>
      }
    />
  );
}
