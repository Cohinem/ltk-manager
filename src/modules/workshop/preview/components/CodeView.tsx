import { defaultKeymap } from "@codemirror/commands";
import {
  bracketMatching,
  foldGutter,
  foldKeymap,
  HighlightStyle,
  syntaxHighlighting,
} from "@codemirror/language";
import {
  highlightSelectionMatches,
  openSearchPanel,
  search,
  searchKeymap,
} from "@codemirror/search";
import { Compartment, EditorState, type Extension } from "@codemirror/state";
import {
  drawSelection,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
} from "@codemirror/view";
import { tags } from "@lezer/highlight";
import { type Ref, useEffect, useImperativeHandle, useRef } from "react";

/** What a host reaches on a mounted view. */
export interface CodeViewHandle {
  /** Open the search panel with its field focused. */
  openSearch: () => void;
}

interface CodeViewProps {
  value: string;
  /** The grammar the text is highlighted by, or null for plain text. */
  language: Extension | null;
  wrap: boolean;
  /** The view's accessible name. */
  label: string;
  ref?: Ref<CodeViewHandle>;
}

/* DS-TOKEN: every color below is a token, read through its custom property. */
const syntaxColors = HighlightStyle.define([
  {
    tag: [tags.keyword, tags.bool, tags.null, tags.atom, tags.self, tags.tagName],
    color: "var(--ltk-syntax-keyword-text)",
  },
  {
    tag: [tags.controlKeyword, tags.moduleKeyword, tags.operatorKeyword],
    color: "var(--ltk-syntax-control-text)",
  },
  {
    tag: [tags.string, tags.special(tags.string), tags.regexp, tags.attributeValue],
    color: "var(--ltk-syntax-string-text)",
  },
  {
    tag: [tags.number, tags.integer, tags.float, tags.unit],
    color: "var(--ltk-syntax-number-text)",
  },
  { tag: [tags.propertyName, tags.attributeName], color: "var(--ltk-syntax-property-text)" },
  {
    tag: [tags.function(tags.variableName), tags.function(tags.propertyName)],
    color: "var(--ltk-syntax-function-text)",
  },
  {
    tag: [tags.typeName, tags.className, tags.namespace],
    color: "var(--ltk-syntax-type-text)",
  },
  { tag: tags.comment, color: "var(--surface-400)", fontStyle: "italic" },
  { tag: [tags.punctuation, tags.bracket, tags.separator], color: "var(--surface-300)" },
  { tag: tags.heading, color: "var(--ltk-syntax-keyword-text)", fontWeight: "bold" },
  { tag: tags.link, color: "var(--ltk-syntax-string-text)", textDecoration: "underline" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strong, fontWeight: "bold" },
  { tag: tags.invalid, color: "var(--ltk-danger-text)" },
]);

const accentWash = (share: number) =>
  `color-mix(in srgb, var(--accent-500) ${share}%, transparent)`;

const chrome = EditorView.theme({
  "&": {
    height: "100%",
    color: "var(--surface-200)",
    backgroundColor: "var(--surface-950)",
  },
  ".cm-scroller": { fontFamily: "var(--face-mono)", lineHeight: "1.5" },
  ".cm-content": { caretColor: "var(--accent-400)" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--accent-400)" },
  "&.cm-focused": { outline: "none" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
    backgroundColor: accentWash(30),
  },
  ".cm-activeLine": { backgroundColor: "color-mix(in srgb, var(--surface-800) 60%, transparent)" },
  ".cm-selectionMatch": { backgroundColor: accentWash(15) },
  ".cm-searchMatch": { backgroundColor: accentWash(25), outline: `1px solid ${accentWash(60)}` },
  ".cm-searchMatch.cm-searchMatch-selected": { backgroundColor: accentWash(50) },
  "&.cm-focused .cm-matchingBracket": { backgroundColor: accentWash(25) },
  ".cm-gutters": {
    color: "var(--surface-500)",
    backgroundColor: "var(--surface-950)",
    borderRight: "1px solid color-mix(in srgb, var(--surface-700) 50%, transparent)",
  },
  ".cm-activeLineGutter": { color: "var(--surface-300)", backgroundColor: "transparent" },
  ".cm-foldPlaceholder": {
    color: "var(--surface-300)",
    backgroundColor: "var(--surface-800)",
    border: "1px solid var(--surface-600)",
    borderRadius: "var(--radius-001)",
  },
  ".cm-panels": {
    color: "var(--surface-200)",
    backgroundColor: "var(--surface-800)",
  },
  ".cm-panels.cm-panels-top": { borderBottom: "1px solid var(--surface-600)" },
  ".cm-panel.cm-search": { fontFamily: "var(--face-sans)", padding: "4px 8px" },
  ".cm-textfield": {
    color: "var(--surface-100)",
    backgroundColor: "var(--surface-700)",
    border: "1px solid var(--surface-600)",
    borderRadius: "var(--radius-002)",
  },
  ".cm-textfield:focus": { outline: "none", borderColor: "var(--accent-500)" },
  ".cm-button": {
    color: "var(--surface-200)",
    backgroundColor: "var(--surface-700)",
    backgroundImage: "none",
    border: "1px solid var(--surface-600)",
    borderRadius: "var(--radius-002)",
  },
  ".cm-button:hover": { borderColor: "var(--accent-hover)" },
  ".cm-panel.cm-search [name=close]": { color: "var(--surface-400)" },
});

/**
 * Source text in a read-only CodeMirror view: highlighted, numbered, foldable and
 * searchable, drawing only the lines on screen.
 *
 * The text can be selected and searched but not changed. `Ctrl+F` inside the view opens
 * its own search, and a host reaches the same panel through the handle.
 */
export default function CodeView({ value, language, wrap, label, ref }: CodeViewProps) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const languageSlot = useRef(new Compartment());
  const wrapSlot = useRef(new Compartment());

  useImperativeHandle(ref, () => ({
    openSearch: () => {
      if (view.current) openSearchPanel(view.current);
    },
  }));

  useEffect(() => {
    const mounted = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: "",
        extensions: [
          EditorState.readOnly.of(true),
          EditorView.contentAttributes.of({ "aria-label": label }),
          lineNumbers(),
          foldGutter(),
          highlightActiveLine(),
          highlightActiveLineGutter(),
          drawSelection(),
          bracketMatching(),
          highlightSelectionMatches(),
          search({ top: true }),
          keymap.of([...searchKeymap, ...foldKeymap, ...defaultKeymap]),
          syntaxHighlighting(syntaxColors),
          chrome,
          languageSlot.current.of([]),
          wrapSlot.current.of([]),
        ],
      }),
    });
    view.current = mounted;

    return () => {
      mounted.destroy();
      view.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const mounted = view.current;
    if (!mounted || mounted.state.doc.toString() === value) return;

    mounted.dispatch({ changes: { from: 0, to: mounted.state.doc.length, insert: value } });
  }, [value]);

  useEffect(() => {
    view.current?.dispatch({ effects: languageSlot.current.reconfigure(language ?? []) });
  }, [language]);

  useEffect(() => {
    view.current?.dispatch({
      effects: wrapSlot.current.reconfigure(wrap ? EditorView.lineWrapping : []),
    });
  }, [wrap]);

  return <div ref={host} data-ui="CodeView" className="min-h-0 flex-1 text-code select-text" />;
}
