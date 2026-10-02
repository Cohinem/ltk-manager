import { stripReleasePreamble } from "@/modules/updater";

/** One area a release changed, as the digest draws it. */
export interface DigestSection {
  /** The area's heading, or `null` for changes listed under none. */
  title: string | null;
  /** How many changes the area lists, across its sub-groups. */
  count: number;
  /** One line saying what changed: the area's own lead sentence, else its first change. */
  summary: string;
}

interface Draft {
  title: string | null;
  count: number;
  lead: string;
  first: string;
}

const AREA = /^##\s+(.+)$/;
const GROUP = /^###\s+(.+)$/;
const ITEM = /^[-*]\s+(.+)$/;
const CONTINUATION = /^\s{2,}(\S.*)$/;

/** The areas a release's notes change, in the order the notes list them. */
export function releaseDigest(body: string | undefined): DigestSection[] {
  const drafts: Draft[] = [];
  let current: Draft | null = null;
  let wrapping = false;

  function open(title: string | null): Draft {
    const draft = { title, count: 0, lead: "", first: "" };
    drafts.push(draft);
    return draft;
  }

  for (const line of stripReleasePreamble(body).split(/\r?\n/)) {
    const area = AREA.exec(line);
    const group = GROUP.exec(line);
    const item = ITEM.exec(line);
    const continuation = CONTINUATION.exec(line);

    if (area) {
      current = open(area[1].trim());
      wrapping = false;
    } else if (group) {
      current ??= open(group[1].trim());
      wrapping = false;
    } else if (item) {
      current ??= open(null);
      current.count += 1;
      wrapping = current.count === 1;
      if (wrapping) current.first = item[1];
    } else if (continuation && wrapping && current) {
      current.first = `${current.first} ${continuation[1]}`;
    } else {
      const prose = line.trim();
      if (prose && current && current.count === 0 && !current.lead) current.lead = prose;
      wrapping = false;
    }
  }

  return drafts
    .filter((draft) => draft.count > 0 || draft.lead !== "")
    .map(({ title, count, lead, first }) => ({ title, count, summary: plainText(lead || first) }));
}

/** Markdown inline marks dropped, so a line reads as plain text. */
function plainText(markdown: string): string {
  return markdown
    .replace(/\[([^\]]+)\]\([^)]*\)/g, (_link, words: string) => words)
    .replace(/\*\*|__|`/g, "")
    .trim();
}
