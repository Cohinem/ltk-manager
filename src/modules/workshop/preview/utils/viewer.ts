/** Which viewer draws a file the League formats leave to the webview. */
export type WebViewer = "video" | "audio" | "text" | "font";

/* The extensions the game and the League client ship that a webview plays or reads. An
   image goes through the image viewer, which the backend serves every image to. */
const VIEWER_BY_EXTENSION: Readonly<Record<string, WebViewer>> = {
  webm: "video",
  mp4: "video",
  ogg: "audio",
  wav: "audio",
  mp3: "audio",
  json: "text",
  js: "text",
  mjs: "text",
  css: "text",
  html: "text",
  htm: "text",
  txt: "text",
  csv: "text",
  xml: "text",
  ini: "text",
  cfg: "text",
  atlas: "text",
  spineatlas: "text",
  filter: "text",
  lua: "text",
  md: "text",
  yaml: "text",
  yml: "text",
  log: "text",
  otf: "font",
  ttf: "font",
};

/** The web viewer a file name's extension asks for, or null for one the image viewer takes. */
export function webViewerOf(name: string): WebViewer | null {
  const dot = name.lastIndexOf(".");
  if (dot < 0) return null;
  return VIEWER_BY_EXTENSION[name.slice(dot + 1).toLowerCase()] ?? null;
}
