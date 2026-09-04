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
import { buildCandidate, buildCommandCandidate } from "./candidate";
import { useProjectRows } from "./projectRows";
import type { PaletteCandidate, PaletteCandidates } from "./types";
import { useProjectCommands } from "./useProjectCommands";
import { useSettingRows } from "./useSettingRows";

const NONE: readonly PaletteCandidate[] = [];

/**
 * Every row the bar can match under a project, source by source.
 *
 * A source's array is rebuilt only when its own data moves, so a keystroke
 * costs a scan and nothing else.
 *
 * A project of a few thousand files is a few thousand rows to build, and the
 * content scan refetches on each trip back to the window. The palette is
 * mounted only while it is open, which is what keeps a user who never opens it
 * from paying for those rows all day.
 */
export function useProjectCandidates(): PaletteCandidates {
  return {
    projects: useProjectRows(),
    documents: useDocumentCandidates(),
    files: useFileCandidates(),
    layers: useLayerCandidates(),
    strings: useStringCandidates(),
    commands: useCommandCandidates(),
    settings: useSettingRows(),
  };
}

function useDocumentCandidates(): readonly PaletteCandidate[] {
  const documents = useOpenDocuments();
  const editors = useContentEditors();

  return useMemo(() => {
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
        buildCandidate({
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
  }, [documents, editors]);
}

function useFileCandidates(): readonly PaletteCandidate[] {
  const project = useProjectContext();
  const { data } = useProjectContentTree(project.path);
  const layers = data?.layers;

  return useMemo(() => {
    if (!layers) return NONE;

    return layers.flatMap((layer) => {
      const title = layerTitle(project, layer.name);

      return layer.entries.map((entry) => {
        const cut = entry.relativePath.lastIndexOf("/");
        const descriptor = describeFileKind(entry.kind);
        const Glyph = descriptor.icon;

        return buildCandidate({
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
  }, [layers, project]);
}

function useLayerCandidates(): readonly PaletteCandidate[] {
  const project = useProjectContext();

  return useMemo(() => {
    return project.layers.map((layer) =>
      buildCandidate({
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
  }, [project.layers]);
}

function useStringCandidates(): readonly PaletteCandidate[] {
  const project = useProjectContext();

  return useMemo(() => {
    return project.layers.flatMap((layer) =>
      Object.entries(layer.stringOverrides).flatMap(([locale, entries]) =>
        Object.entries(entries).map(([key, value]) =>
          buildCandidate({
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
  }, [project.layers]);
}

function useCommandCandidates(): readonly PaletteCandidate[] {
  const commands = useProjectCommands();

  return useMemo(() => commands.map(buildCommandCandidate), [commands]);
}
