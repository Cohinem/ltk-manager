/** `text` with the first place it holds `query` marked, ignoring case. */
export function MatchedText({ text, query }: { text: string; query: string }) {
  const needle = query.trim().toLowerCase();
  const at = needle === "" ? -1 : text.toLowerCase().indexOf(needle);
  if (at < 0) return text;

  return (
    <>
      {text.slice(0, at)}
      <mark className="rounded-xs bg-accent-500/30 text-inherit">
        {text.slice(at, at + needle.length)}
      </mark>
      {text.slice(at + needle.length)}
    </>
  );
}
