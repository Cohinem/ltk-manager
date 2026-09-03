import { open } from "@tauri-apps/plugin-shell";
import type { MouseEvent } from "react";

import { Button, ExternalLink } from "@/components";
import { m } from "@/i18n";

import { useAnnouncements } from "../api";
import { Tile } from "./Tile";

/** How many posts the card has room for. The link under them is the rest. */
const POSTS_SHOWN = 5;

const WIKI = "https://wiki.leaguetoolkit.dev";

/** A standing link: what it is called, and where it opens. */
interface StandingLink {
  label: () => string;
  href: string;
}

/** The standing links, so the card is never empty. */
const LEARN_LINKS: StandingLink[] = [
  { label: () => m.home_learn_getting_started_label(), href: `${WIKI}/start-here/` },
  { label: () => m.home_learn_managing_mods_label(), href: `${WIKI}/mod-management/` },
  { label: () => m.home_learn_troubleshooting_label(), href: `${WIKI}/start-here/faq/` },
];

const COMMUNITY_LINKS: StandingLink[] = [
  { label: () => m.home_learn_discord_label(), href: "https://discord.gg/yhzDVRyQex" },
  {
    label: () => m.home_learn_repository_label(),
    href: "https://github.com/LeagueToolkit/ltk-manager",
  },
];

/** The link opens in the browser through the shell plugin, which is where every outside link goes. */
function openInBrowser(event: MouseEvent<HTMLAnchorElement>) {
  event.preventDefault();
  void open(event.currentTarget.href);
}

/** The project's posts, then the links that stand whether or not it has posted. */
export function NewsTile() {
  const { data: posts, error, refetch } = useAnnouncements();
  const shown = (posts ?? []).slice(0, POSTS_SHOWN);

  return (
    <Tile
      title={m.home_news_title()}
      data-ui="NewsTile"
      action={
        error !== null && (
          <Button variant="ghost" size="xs" compact onClick={() => void refetch()}>
            {m.common_retry_action()}
          </Button>
        )
      }
    >
      <div className="flex flex-col gap-3 px-4 pb-4">
        {shown.length > 0 && (
          <ul data-ui="NewsTile:posts" className="flex flex-col gap-1.5">
            {shown.map((post) => (
              <li key={post.id} className="flex items-baseline gap-2 text-sm">
                <time
                  dateTime={post.publishedAt ?? undefined}
                  className="w-12 shrink-0 text-xs text-surface-500 tabular-nums select-none"
                >
                  {postDate(post.publishedAt)}
                </time>
                <ExternalLink
                  href={post.url}
                  hideIcon
                  onClick={openInBrowser}
                  className="min-w-0 truncate text-surface-200 hover:text-accent-300"
                >
                  {post.title}
                </ExternalLink>
              </li>
            ))}
          </ul>
        )}

        <nav data-ui="NewsTile:learn" className="flex flex-col gap-1 text-sm select-none">
          {LEARN_LINKS.map((link) => (
            <ExternalLink key={link.href} href={link.href} onClick={openInBrowser}>
              {link.label()}
            </ExternalLink>
          ))}
          <div className="mt-1 flex items-center gap-3">
            {COMMUNITY_LINKS.map((link) => (
              <ExternalLink key={link.href} href={link.href} onClick={openInBrowser}>
                {link.label()}
              </ExternalLink>
            ))}
          </div>
        </nav>
      </div>
    </Tile>
  );
}

/** The day a post went up, short, or nothing for a post without one. */
function postDate(publishedAt: string | null): string {
  if (!publishedAt) return "";
  const date = new Date(publishedAt);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
