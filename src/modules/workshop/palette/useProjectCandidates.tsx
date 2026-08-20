import { TranslateIcon } from "@phosphor-icons/react";
import { type ReactNode, useMemo } from "react";

import { useProjectContentTree } from "../api/useProjectContentTree";
import { LayerGlyph } from "../components/LayerGlyph";
import { useProjectContext } from "../components/ProjectContext";
import {
  filesDocument,
  layerTitle,
  previewDocumentId,
  stringsDocument,
  useContentEditors,
} from "../documents";
import { useOpenDocuments } from "../state";
import { describeFileKind } from "../utils/fileKindIcon";
import { letterMask } from "./matcher";
import type { PaletteCandidate, PaletteSourceId, ProjectCommand } from "./types";
import { useProjectCommands } from "./useProjectCommands";

/**
 * What each locally-matched source contributes, memoized apart so one rebuild
 * is not four.
 *
 * The game is absent: its rows are ranked in Rust and arrive through
 * `useGameRows`, which is what keeps 819,136 paths off the frontend heap.
 */
export type ProjectCandidates = Readonly<
  Record<Exclude<PaletteSourceId, "game">, readonly PaletteCandidate[]>
>;

const NONE: readonly PaletteCandidate[] = [];

/**
 * Every row the project bar can match, source by source.
 *
 * A source's array is rebuilt only when its own data moves, so a keystroke
 * costs a scan and nothing else. The lowercase forms and the letter mask are
 * built here for the same reason - lowercasing a few thousand rows per
 * keystroke is the cost that shows up in a search of this size.
 *
 * `enabled` is false while the bar is idle. A project of a few thousand files
 * is a few thousand rows to build, and the content scan refetches on each trip
 * back to the window, so a user who never opens the bar would otherwise pay for
 * those rows all day.
 */
export function useProjectCandidates(enabled: boolean): ProjectCandidates {
  return {
    documents: useDocumentCandidates(enabled),
    files: useFileCandidates(enabled),
    layers: useLayerCandidates(enabled),
    strings: useStringCandidates(enabled),
    commands: useCommandCandidates(enabled),
  };
}

type CandidateSeed = Omit<PaletteCandidate, "nameLower" | "fullLower" | "mask">;

function candidate(seed: CandidateSeed): PaletteCandidate {
  const nameLower = seed.name.toLowerCase();
  const fullLower = seed.path.length > 0 ? `${seed.path.toLowerCase()}/${nameLower}` : nameLower;

  /* A row that already carries the document it opens names itself by that, so
     only a source whose target is built at the last moment passes one in. */
  const documentId =
    seed.documentId ?? (seed.target.kind === "document" ? seed.target.document.id : undefined);

  return {
    ...seed,
    documentId,
    nameLower,
    fullLower,
    mask: letterMask(seed.keywords === undefined ? fullLower : `${fullLower} ${seed.keywords}`),
  };
}

function useDocumentCandidates(enabled: boolean): readonly PaletteCandidate[] {
  const documents = useOpenDocuments();
  const editors = useContentEditors();

  return useMemo(() => {
    if (!enabled) return NONE;

    return documents.flatMap((document) => {
      const definition = editors[document.kind];
      if (!definition) return [];

      /* The registry narrows to one kind per key, which a lookup by a union's
         own kind cannot express. The key comes off the document, so the two
         agree. */
      const entry = definition as {
        icon: (document: never) => ReactNode;
        label: (document: never) => { title: string; context?: string };
      };
      const label = entry.label(document as never);

      return [
        candidate({
          id: document.id,
          source: "documents",
          name: label.title,
          path: "",
          trailing: label.context,
          icon: entry.icon(document as never),
          target: { kind: "document", document },
        }),
      ];
    });
  }, [documents, editors, enabled]);
}

function useFileCandidates(enabled: boolean): readonly PaletteCandidate[] {
  const project = useProjectContext();
  const { data } = useProjectContentTree(project.path);
  const layers = data?.layers;

  return useMemo(() => {
    if (!enabled || !layers) return NONE;

    return layers.flatMap((layer) => {
      const title = layerTitle(project, layer.name);

      return layer.entries.map((entry) => {
        const cut = entry.relativePath.lastIndexOf("/");
        const descriptor = describeFileKind(entry.kind);
        const Glyph = descriptor.icon;

        return candidate({
          id: `file:${layer.name}:${entry.relativePath}`,
          source: "files",
          name: cut < 0 ? entry.relativePath : entry.relativePath.slice(cut + 1),
          path: cut < 0 ? "" : entry.relativePath.slice(0, cut),
          trailing: title,
          layerName: layer.name,
          documentId: previewDocumentId({
            kind: "layer",
            project: project.path,
            layer: layer.name,
            path: entry.relativePath,
          }),
          icon: (
            <span style={{ color: `var(${descriptor.tintToken})` }}>
              <Glyph className="h-4 w-4" strokeWidth={1.75} />
            </span>
          ),
          target: { kind: "layerFile", layerName: layer.name, path: entry.relativePath },
        });
      });
    });
  }, [enabled, layers, project]);
}

function useLayerCandidates(enabled: boolean): readonly PaletteCandidate[] {
  const project = useProjectContext();

  return useMemo(() => {
    if (!enabled) return NONE;

    return project.layers.map((layer) =>
      candidate({
        id: `layer:${layer.name}`,
        source: "layers",
        name: layer.displayName,
        path: "",
        trailing: layer.displayName === layer.name ? undefined : layer.name,
        layerName: layer.name,
        keywords: layer.description?.toLowerCase(),
        icon: <LayerGlyph layerName={layer.name} className="h-4 w-4" />,
        target: { kind: "document", document: filesDocument(layer.name) },
      }),
    );
  }, [enabled, project.layers]);
}

function useStringCandidates(enabled: boolean): readonly PaletteCandidate[] {
  const project = useProjectContext();

  return useMemo(() => {
    if (!enabled) return NONE;

    return project.layers.flatMap((layer) =>
      Object.entries(layer.stringOverrides).flatMap(([locale, entries]) =>
        Object.entries(entries).map(([key, value]) =>
          candidate({
            id: `string:${layer.name}:${locale}:${key}`,
            source: "strings",
            name: key,
            path: value,
            trailing: locale,
            layerName: layer.name,
            icon: <TranslateIcon className="h-4 w-4 text-doc-strings-text" />,
            target: { kind: "document", document: stringsDocument(layer.name, locale) },
          }),
        ),
      ),
    );
  }, [enabled, project.layers]);
}

function useCommandCandidates(enabled: boolean): readonly PaletteCandidate[] {
  const commands = useProjectCommands();

  return useMemo(() => (enabled ? commands.map(commandCandidate) : NONE), [commands, enabled]);
}

function commandCandidate(command: ProjectCommand): PaletteCandidate {
  const words = [command.group, ...(command.keywords ?? [])].join(" ").toLowerCase();

  return candidate({
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
