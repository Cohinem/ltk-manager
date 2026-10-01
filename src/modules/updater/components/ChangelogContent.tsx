import type { Components } from "react-markdown";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { Code, ExternalLink, isLeavable } from "@/components";
import { m } from "@/i18n";

interface ChangelogContentProps {
  body: string | undefined;
}

const components: Components = {
  h2: ({ children }) => (
    <h2 className="mt-5 mb-2 text-sm font-semibold text-accent-300 first:mt-0">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="mt-3 mb-1.5 text-sm font-semibold text-surface-200 first:mt-0">{children}</h3>
  ),
  ul: ({ children }) => <ul className="mb-3 flex flex-col gap-1 pl-1">{children}</ul>,
  li: ({ children }) => (
    <li className="flex gap-2.5 text-sm leading-relaxed text-surface-300">
      <span className="mt-2.5 h-1 w-1 shrink-0 rounded-full bg-accent-400" />
      <span className="min-w-0">{children}</span>
    </li>
  ),
  p: ({ children }) => <p className="mb-2 text-sm leading-relaxed text-surface-300">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold text-surface-100">{children}</strong>,
  code: ({ children }) => <Code>{children}</Code>,
  a: ({ href, children }) => {
    if (!href || !isLeavable(href)) return <span>{children}</span>;
    return <ExternalLink href={href}>{children}</ExternalLink>;
  },
};

export function ChangelogContent({ body }: ChangelogContentProps) {
  if (!body?.trim()) {
    return (
      <p className="py-4 text-center text-sm text-surface-400">{m.updater_changelog_empty()}</p>
    );
  }

  return (
    <Markdown remarkPlugins={[remarkGfm]} components={components}>
      {body}
    </Markdown>
  );
}
