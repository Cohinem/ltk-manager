import type { Extension } from "@codemirror/state";

type LanguageLoader = () => Promise<Extension>;

/* Each language is its own import, so a file pulls in the one grammar it reads. */
const LANGUAGE_BY_EXTENSION: Readonly<Record<string, LanguageLoader>> = {
  json: () => import("@codemirror/lang-json").then(({ json }) => json()),
  js: () => import("@codemirror/lang-javascript").then(({ javascript }) => javascript()),
  mjs: () => import("@codemirror/lang-javascript").then(({ javascript }) => javascript()),
  css: () => import("@codemirror/lang-css").then(({ css }) => css()),
  html: () => import("@codemirror/lang-html").then(({ html }) => html()),
  htm: () => import("@codemirror/lang-html").then(({ html }) => html()),
  xml: () => import("@codemirror/lang-xml").then(({ xml }) => xml()),
  svg: () => import("@codemirror/lang-xml").then(({ xml }) => xml()),
  yaml: () => import("@codemirror/lang-yaml").then(({ yaml }) => yaml()),
  yml: () => import("@codemirror/lang-yaml").then(({ yaml }) => yaml()),
  md: () => import("@codemirror/lang-markdown").then(({ markdown }) => markdown()),
};

/** The grammar a file name's extension names, or null for text with none. */
export function codeLanguageOf(name: string): LanguageLoader | null {
  const dot = name.lastIndexOf(".");
  if (dot < 0) return null;
  return LANGUAGE_BY_EXTENSION[name.slice(dot + 1).toLowerCase()] ?? null;
}
