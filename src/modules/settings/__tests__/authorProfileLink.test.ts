import { describe, expect, it } from "vitest";

import type { AuthorProfile, ConnectedAccount } from "@/lib/tauri";

import { accountProfileSuggestion } from "../authorProfileLink";

const account: ConnectedAccount = {
  userId: "user-1",
  username: "crauzer",
  displayName: "Crauzer",
  tokenPrefix: "BmuoIFAi",
  scopes: [],
};

function profile(name: string, runeforgeUserId: string | null = null): AuthorProfile {
  return { id: name, name, role: null, runeforgeUserId };
}

describe("accountProfileSuggestion", () => {
  it("returns null if no account is connected", () => {
    expect(accountProfileSuggestion([], null, false)).toBeNull();
  });

  it("returns null if the account has no name", () => {
    const unnamed = { ...account, displayName: null, username: "" };

    expect(accountProfileSuggestion([], unnamed, false)).toBeNull();
  });

  it("returns null if a profile is linked to the account", () => {
    expect(accountProfileSuggestion([profile("Other", "user-1")], account, false)).toBeNull();
  });

  it("adds a profile if no profile has the account name", () => {
    expect(accountProfileSuggestion([profile("Other")], account, false)).toEqual({
      kind: "add",
      name: "Crauzer",
    });
  });

  it("falls back to the username if the display name is missing", () => {
    expect(accountProfileSuggestion([], { ...account, displayName: null }, false)).toEqual({
      kind: "add",
      name: "crauzer",
    });
  });

  it("links the profile that has the account name, ignoring case", () => {
    const existing = profile("CRAUZER");

    expect(accountProfileSuggestion([existing], account, false)).toEqual({
      kind: "link",
      profile: existing,
    });
  });

  it("links an existing profile at the limit", () => {
    const existing = profile("Crauzer");

    expect(accountProfileSuggestion([existing], account, true)).toEqual({
      kind: "link",
      profile: existing,
    });
  });

  it("returns null at the limit if no profile has the account name", () => {
    expect(accountProfileSuggestion([profile("Other")], account, true)).toBeNull();
  });
});
