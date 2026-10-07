import { ArchiveIcon, type Icon, ImageIcon, TreeStructureIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";

import { ExternalLink, SectionCard } from "@/components";
import { m } from "@/i18n";
import type { Tool } from "@/lib/tauri";
import { twMerge } from "@/utils";

import { useSettingMark } from "./SettingFocus";
import { SettingGutter } from "./SettingGutter";

const TOOL_ICONS: Record<Tool, Icon> = {
  wadtools: ArchiveIcon,
  "tex-toolz": ImageIcon,
  "ritobin-tools": TreeStructureIcon,
};

/** The repository of each tool, under the LeagueToolkit organization. */
const TOOL_REPOSITORIES: Record<Tool, string> = {
  wadtools: "wadtools",
  "tex-toolz": "ltk-tex-utils",
  "ritobin-tools": "ritobin-tools",
};

function toolDescription(tool: Tool): string {
  const descriptions: Record<Tool, string> = {
    wadtools: m.settings_integrations_wad_description(),
    "tex-toolz": m.settings_integrations_tex_description(),
    "ritobin-tools": m.settings_integrations_ritobin_description(),
  };
  return descriptions[tool];
}

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
  const ToolIcon = TOOL_ICONS[tool];

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
          description={toolDescription(tool)}
          icon={<ToolIcon weight="duotone" className="size-5" />}
          action={
            <ExternalLink
              href={`https://github.com/LeagueToolkit/${TOOL_REPOSITORIES[tool]}`}
              className="text-row"
            >
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
