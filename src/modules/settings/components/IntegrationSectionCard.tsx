import { ArchiveIcon, ImageIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";

import { ExternalLink, SectionCard } from "@/components";
import { m } from "@/i18n";
import type { Tool } from "@/lib/tauri";
import { twMerge } from "@/utils";

import { useSettingMark } from "./SettingFocus";
import { SettingGutter } from "./SettingGutter";

/** An addressable tool section and its shareable settings link. */
export function IntegrationSectionCard({
  tool,
  title,
  children,
}: {
  tool: Tool;
  title: string;
  children: ReactNode;
}) {
  const id = `integrations.${tool}`;
  const mark = useSettingMark(id);
  const Icon = tool === "wadtools" ? ArchiveIcon : ImageIcon;
  const repo = tool === "wadtools" ? "wadtools" : "ltk-tex-utils";
  const description =
    tool === "wadtools"
      ? m.settings_integrations_wad_description()
      : m.settings_integrations_tex_description();

  return (
    <SettingGutter target={{ id, title }}>
      <section
        ref={mark.ref}
        tabIndex={mark.tabIndex}
        aria-label={title}
        data-ui="IntegrationSectionCard"
        className={twMerge("min-w-0 scroll-mt-6 outline-none", mark.className)}
      >
        <SectionCard
          title={title}
          description={description}
          icon={<Icon weight="duotone" className="h-5 w-5" />}
          action={
            <ExternalLink href={`https://github.com/LeagueToolkit/${repo}`} className="text-row">
              {m.settings_integrations_repository_action()}
            </ExternalLink>
          }
        >
          {children}
        </SectionCard>
      </section>
    </SettingGutter>
  );
}
