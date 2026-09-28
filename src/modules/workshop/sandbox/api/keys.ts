/** The query keys of reads that depend on a sandbox's files. */
export const sandboxKeys = {
  /** The install's copy of each chunk path a tab can switch to. */
  gameCopies: ["sandbox-game-copy"] as const,
  gameCopy: (path: string | null) => ["sandbox-game-copy", path] as const,
};
