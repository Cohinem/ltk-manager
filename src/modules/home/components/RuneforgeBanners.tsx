import { ArrowUpRightIcon } from "@phosphor-icons/react";

import anima from "@/assets/runeforge-anima.webp";
import ignis from "@/assets/runeforge-ignis.webp";
import { ExternalLink } from "@/components";
import { m } from "@/i18n";

/** The community's mods and creation guides, per "Runeforge" in docs/ux/HOME.md. */
export function RuneforgeBanners() {
  const destinations = [
    {
      title: m.home_runeforge_title(),
      description: m.home_runeforge_description(),
      action: m.home_runeforge_action(),
      href: "https://runeforge.dev/",
      artwork: ignis,
    },
    {
      title: m.home_runeforge_wiki_title(),
      description: m.home_runeforge_wiki_description(),
      action: m.home_runeforge_wiki_action(),
      href: "https://wiki.runeforge.dev/core-guides/get-started/",
      artwork: anima,
    },
  ];

  return (
    <div
      data-ui="RuneforgeBanners"
      className="grid shrink-0 grid-cols-2 overflow-hidden rounded-lg border border-surface-700/50 select-none"
    >
      {destinations.map(({ title, description, action, href, artwork }) => (
        <ExternalLink
          key={href}
          href={href}
          hideIcon
          className="group relative isolate flex min-w-0 items-stretch gap-0 overflow-hidden text-surface-100 last:flex-row-reverse hover:text-surface-100 focus-visible:z-10 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent-400"
        >
          <div className="relative w-2/5 shrink-0 overflow-hidden" aria-hidden="true">
            <img
              src={artwork}
              alt=""
              className="absolute inset-0 h-full w-full object-cover object-center"
            />
          </div>
          {/* DS-GLASS. */}
          <div className="relative -ml-3 flex min-w-0 flex-1 group-last:-mr-3 group-last:ml-0">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 right-0 -left-16 bg-(--ltk-glass-panel-fill) [mask-image:linear-gradient(to_right,transparent,var(--color-brand-on)_4rem)] backdrop-filter-(--ltk-glass-panel-blur) group-last:-right-16 group-last:left-0 group-last:[mask-image:linear-gradient(to_left,transparent,var(--color-brand-on)_4rem)]"
            >
              <div className="absolute inset-0 bg-surface-900/40" />
            </div>
            <div className="relative flex flex-1 flex-col items-start gap-1.5 p-3">
              <h2 className="text-sm font-semibold">{title}</h2>
              <p className="text-xs leading-relaxed text-surface-300">{description}</p>
              <span className="mt-auto inline-flex items-center gap-1.5 pt-1 text-sm font-semibold text-accent-400 group-hover:text-accent-300">
                {action}
                <ArrowUpRightIcon weight="bold" className="h-4 w-4 shrink-0" aria-hidden="true" />
              </span>
            </div>
          </div>
        </ExternalLink>
      ))}
    </div>
  );
}
