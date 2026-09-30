import { useOptionalProjectContext } from "../../../projects/state/ProjectContext";
import { useSandbox } from "../../../sandbox/state/SandboxContext";
import { sandboxProject } from "../../../sandbox/utils/sandboxRef";

/** The folder a new object's suggested name starts in when no project names one. */
const NO_MOD = "mod";

/** The folder a new object's suggested name starts in: `Mods/`, then the project's name. */
export function useModFolder(): string {
  const project = useOptionalProjectContext();
  const sandbox = sandboxProject(useSandbox());
  const name = project?.name ?? (sandbox === null ? null : leafOf(sandbox)) ?? NO_MOD;
  return `Mods/${name}/`;
}

function leafOf(path: string): string {
  const normalized = path.replace(/\\/g, "/").replace(/\/+$/, "");
  return normalized.slice(normalized.lastIndexOf("/") + 1);
}
