import type { SandboxRef } from "@/lib/tauri";

/** The installed game alone, which is read-only. ADR-0056. */
export const GAME_SANDBOX: SandboxRef = { kind: "game" };

/** Every layer of the project at `project` over the game. */
export function projectSandbox(project: string): SandboxRef {
  return { kind: "project", project };
}

/** What identifies a sandbox, for a document id or a query key. */
export function sandboxKey(sandbox: SandboxRef): string {
  if (sandbox.kind === "game") return "game";
  if (sandbox.kind === "project") return `project:${sandbox.project}`;
  return `layer:${sandbox.project}:${sandbox.layer}`;
}

export function sameSandbox(a: SandboxRef, b: SandboxRef): boolean {
  return sandboxKey(a) === sandboxKey(b);
}

/** The project a sandbox reads, or null for the game. */
export function sandboxProject(sandbox: SandboxRef): string | null {
  return sandbox.kind === "game" ? null : sandbox.project;
}
