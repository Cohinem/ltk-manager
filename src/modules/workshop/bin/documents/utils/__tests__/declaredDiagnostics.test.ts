import { describe, expect, it } from "vitest";

import type { DeclaredDiagnostic } from "@/lib/tauri";

import { diagnosticSeverity, diagnosticText } from "../declaredDiagnostics";

function diagnostic(overrides: Partial<DeclaredDiagnostic>): DeclaredDiagnostic {
  return {
    entry: "0x2a1f3c7d",
    path: "0000000a",
    layer: "base",
    key: "tags",
    kind: "propertyEditSkipped",
    reason: null,
    detail: null,
    ...overrides,
  };
}

describe("diagnosticText", () => {
  it("says why a key was skipped", () => {
    expect(diagnosticText(diagnostic({ reason: "removalUnmatched" }))).toBe(
      "The game's copy holds nothing this removal names.",
    );
    expect(diagnosticText(diagnostic({ reason: "indexOutOfRange" }))).toBe(
      "The list in the game's copy holds no item at that index.",
    );
  });

  it("names the category of a diagnostic that skipped no key", () => {
    expect(diagnosticText(diagnostic({ kind: "overrideInvalid" }))).toBe(
      "The override file is not a PTCH.",
    );
  });
});

describe("diagnosticSeverity", () => {
  it("reads a typing from the game's copy as information, and the rest as a warning", () => {
    expect(diagnosticSeverity(diagnostic({ kind: "schemaFallback" }))).toBe("info");
    expect(diagnosticSeverity(diagnostic({ reason: "kindMismatch" }))).toBe("warning");
  });
});
