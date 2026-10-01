import { describe, expect, it } from "vitest";

import { codeLanguageOf } from "../codeLanguage";
import { webViewerOf } from "../viewer";

describe("webViewerOf", () => {
  it("plays video and audio, and reads source as text", () => {
    expect(webViewerOf("plugins/rcp-fe-lol-loot/assets/intro.webm")).toBe("video");
    expect(webViewerOf("sfx/click.OGG")).toBe("audio");
    expect(webViewerOf("plugins/rcp-be-lol-game-data/global/default/v1/champions/1.json")).toBe(
      "text",
    );
    expect(webViewerOf("index.html")).toBe("text");
    expect(webViewerOf("fonts/beaufort.otf")).toBe("font");
  });

  /* An image, a League format and a chunk named by its hash all go to the image viewer,
     which settles a nameless chunk by its bytes. */
  it("leaves every other file to the image viewer", () => {
    expect(webViewerOf("icon.svg")).toBeNull();
    expect(webViewerOf("aatrox.tex")).toBeNull();
    expect(webViewerOf("0123456789abcdef")).toBeNull();
  });
});

describe("codeLanguageOf", () => {
  it("names a grammar for source with one, and none for plain text", () => {
    expect(codeLanguageOf("a.json")).not.toBeNull();
    expect(codeLanguageOf("b.CSS")).not.toBeNull();
    expect(codeLanguageOf("readme.txt")).toBeNull();
    expect(codeLanguageOf("noextension")).toBeNull();
  });

  it("loads the grammar it names", async () => {
    await expect(codeLanguageOf("a.json")!()).resolves.toBeTruthy();
  });
});
