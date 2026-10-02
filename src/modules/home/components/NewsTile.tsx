import {
  BookOpenIcon,
  CompassIcon,
  DiscordLogoIcon,
  GithubLogoIcon,
  GraduationCapIcon,
  type Icon,
  LifebuoyIcon,
  StackIcon,
} from "@phosphor-icons/react";
import { open } from "@tauri-apps/plugin-shell";

import { Button, ExternalLink } from "@/components";
import { m } from "@/i18n";
import { twMerge } from "@/utils";

import { useAnnouncements } from "../api";
import { Tile } from "./Tile";

/** How many posts the card has room for. The link under them is the rest. */
const POSTS_SHOWN = 5;

const WIKI = "https://wiki.leaguetoolkit.dev";
const DISCORD = "https://discord.gg/yhzDVRyQex";
const REPOSITORY = "https://github.com/LeagueToolkit/ltk-manager";
const RUNEFORGE = "https://runeforge.dev/";
const RUNEFORGE_WIKI = "https://wiki.runeforge.dev/core-guides/get-started/";

/* A row has no surface of its own: DS-VEIL. */
const ROW =
  "group rounded-md px-2 py-1.5 hover:bg-surface-veil hover:text-accent-300 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent-400";

/** A standing link: what it is called, what it is drawn with, and where it opens. */
interface StandingLink {
  label: () => string;
  icon: Icon;
  href: string;
}

/** The standing links, so the card is never empty. */
const LEARN_LINKS: StandingLink[] = [
  {
    label: () => m.home_learn_getting_started_label(),
    icon: BookOpenIcon,
    href: `${WIKI}/start-here/`,
  },
  {
    label: () => m.home_learn_managing_mods_label(),
    icon: StackIcon,
    href: `${WIKI}/mod-management/`,
  },
  {
    label: () => m.home_learn_troubleshooting_label(),
    icon: LifebuoyIcon,
    href: `${WIKI}/start-here/faq/`,
  },
  {
    label: () => m.home_runeforge_title(),
    icon: CompassIcon,
    href: RUNEFORGE,
  },
  {
    label: () => m.home_runeforge_wiki_title(),
    icon: GraduationCapIcon,
    href: RUNEFORGE_WIKI,
  },
];

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
      foot={<Community />}
    >
      <div className="-mx-2 flex flex-col gap-3">
        {shown.length > 0 && (
          <ul data-ui="NewsTile:posts" className="flex flex-col">
            {shown.map((post) => (
              <li key={post.id}>
                <ExternalLink
                  href={post.url}
                  hideIcon
                  className={twMerge(ROW, "flex flex-col items-start gap-0.5 text-surface-200")}
                >
                  <span className="line-clamp-2 text-sm leading-snug">{post.title}</span>
                  <time
                    dateTime={post.publishedAt ?? undefined}
                    className="text-xs text-surface-400 tabular-nums select-none"
                  >
                    {postDate(post.publishedAt)}
                  </time>
                </ExternalLink>
              </li>
            ))}
          </ul>
        )}

        {shown.length > 0 && <div className="mx-2 border-t border-surface-700/60" />}

        <nav data-ui="NewsTile:learn" className="flex flex-col select-none">
          {LEARN_LINKS.map(({ label, icon: Glyph, href }) => (
            <ExternalLink
              key={href}
              href={href}
              hideIcon
              className={twMerge(ROW, "gap-2 text-sm text-surface-200")}
            >
              <Glyph className="size-4 shrink-0 text-surface-400 group-hover:text-accent-300" />
              {label()}
            </ExternalLink>
          ))}
        </nav>
      </div>
    </Tile>
  );
}

/** Where the project answers, as two presses rather than two more links. */
function Community() {
  return (
    <div data-ui="NewsTile:community" className="grid grid-cols-2 gap-2">
      <Button
        variant="ghost"
        size="sm"
        left={<DiscordLogoIcon weight="duotone" className="size-4" />}
        onClick={() => void open(DISCORD)}
      >
        {m.home_learn_discord_label()}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        left={<GithubLogoIcon weight="duotone" className="size-4" />}
        onClick={() => void open(REPOSITORY)}
      >
        {m.home_learn_repository_label()}
      </Button>
    </div>
  );
}

/** The day a post went up, short, or nothing for a post without one. */
function postDate(publishedAt: string | null): string {
  if (!publishedAt) return "";
  const date = new Date(publishedAt);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
