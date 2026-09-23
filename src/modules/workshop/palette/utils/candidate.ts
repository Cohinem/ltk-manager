import { letterMask } from "./matcher";
import type { PaletteCandidate, ProjectCommand } from "./types";

type CandidateInput = Omit<PaletteCandidate, "nameLower" | "fullLower" | "mask">;

/** Builds a candidate, precomputing the lowercase forms and mask the matcher reads. */
export function buildCandidate(input: CandidateInput): PaletteCandidate {
  const nameLower = input.name.toLowerCase();
  const fullLower = input.path.length > 0 ? `${input.path.toLowerCase()}/${nameLower}` : nameLower;

  /* A layerFile target names its file instead of carrying a built document, so
     that source works the id out itself and passes it in. */
  const documentId =
    input.documentId ?? (input.target.kind === "document" ? input.target.document.id : undefined);

  return {
    ...input,
    documentId,
    nameLower,
    fullLower,
    mask: letterMask(input.keywords === undefined ? fullLower : `${fullLower} ${input.keywords}`),
  };
}

/** Builds a candidate from a command, matched on its title, group and keywords. */
export function buildCommandCandidate(command: ProjectCommand): PaletteCandidate {
  const words = [command.group, ...(command.keywords ?? [])].join(" ").toLowerCase();

  return buildCandidate({
    id: command.id,
    source: "commands",
    name: command.title,
    path: "",
    trailing:
      command.enabled === false ? command.disabledReason : (command.shortcut ?? command.group),
    disabled: command.enabled === false,
    keywords: words,
    icon: command.icon,
    target: { kind: "command", command },
  });
}
