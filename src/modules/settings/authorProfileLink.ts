import type { AuthorProfile, ConnectedAccount } from "@/lib/tauri";

/** An action that ties an author profile to the connected RuneForge account. */
export type AccountProfileSuggestion =
  | { kind: "add"; name: string }
  | { kind: "link"; profile: AuthorProfile };

/**
 * Returns the action that ties `profiles` to `account`.
 *
 * Returns `null` if no account is connected, if the account has no name, if a profile is already
 * linked to the account, or if `atLimit` blocks a new profile and no profile has the account's name.
 */
export function accountProfileSuggestion(
  profiles: AuthorProfile[],
  account: ConnectedAccount | null | undefined,
  atLimit: boolean,
): AccountProfileSuggestion | null {
  if (!account) return null;

  const name = (account.displayName || account.username).trim();
  if (!name) return null;

  if (profiles.some((profile) => profile.runeforgeUserId === account.userId)) return null;

  const lowered = name.toLowerCase();
  const sameName = profiles.find((profile) => profile.name.toLowerCase() === lowered);
  if (sameName) return { kind: "link", profile: sameName };

  if (atLimit) return null;

  return { kind: "add", name };
}
