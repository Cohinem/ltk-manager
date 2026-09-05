import { CubeIcon } from "@phosphor-icons/react";
import { useMemo } from "react";

import { errorSummary, m } from "@/i18n";
import type { ObjectClassHit, ObjectSearchHit } from "@/lib/tauri";
import { useSearchObjects } from "@/stores";

import { useObjectSearch, wadBasename } from "../gameBrowser";
import { completeClassTerm } from "./classTerm";
import type { PaletteGroup, RankedRow } from "./types";

/**
 * The group the install's bin objects contribute, or null when they contribute none.
 *
 * The backend ranks these as it ranks the game's files, so this dresses them
 * as rows and says what the index is doing when it cannot answer yet: a build
 * in flight, a build that failed, and a table that names nothing each get a
 * row rather than a group that quietly does not appear. `query` is the text as
 * typed, which a completion rewrites.
 */
export function useObjectRows(term: string, query: string, enabled: boolean): PaletteGroup | null {
  const setting = useSearchObjects();
  const wanted = enabled && setting;

  const { data, isFetching, error } = useObjectSearch(term, wanted);

  return useMemo(() => {
    if (!wanted || term.length === 0) return null;

    const label = m.workshop_objects_game_label();

    if (error) return group(label, [noticeRow("objects:error", errorSummary(error))]);
    if (!data) return { ...group(label, []), pending: isFetching };

    /* Absent reads as building: the switch is on, so a warm is on its way from
       the lifecycle hook, and the query asks again until it lands. */
    if (data.status === "absent" || data.status === "building") {
      return group(label, [noticeRow("objects:building", m.workshop_objects_building_label())]);
    }
    if (data.status === "failed") {
      return group(label, [noticeRow("objects:failed", errorSummary(data.error))]);
    }

    if (data.superseded) return null;

    if (data.classes.length > 0) {
      return {
        source: "objects",
        label: m.workshop_objects_classes_label(),
        rows: data.classes.map((hit) => toClassRow(hit, query)),
        total: data.classes.length,
        pending: isFetching,
      };
    }

    /* A hash finds its object with no table at all, so the notice waits for a
       query that came back empty. */
    if (data.hits.length === 0) {
      if (data.unnamed) {
        return group(label, [noticeRow("objects:unnamed", m.workshop_objects_unnamed_label())]);
      }
      return null;
    }

    return {
      source: "objects",
      label,
      rows: data.hits.map(toRow),
      total: data.total,
      pending: isFetching,
    };
  }, [data, error, isFetching, query, term, wanted]);
}

function group(label: string, rows: readonly RankedRow[]): PaletteGroup {
  return { source: "objects", label, rows, total: 0 };
}

/**
 * One declaration as a row: the object's path on the title line, its class and
 * declaring file under it, and the archive at the trailing edge.
 */
function toRow(hit: ObjectSearchHit): RankedRow {
  return {
    row: {
      id: `object:${hit.wad}:${hit.fileHash}:${hit.objectHash}`,
      source: "objects",
      name: hit.path,
      path: `${hit.class} · ${hit.file}`,
      trailing: wadBasename(hit.wad),
      icon: <CubeIcon className="h-4 w-4 text-surface-400" />,
      target: {
        kind: "object",
        wad: hit.wad,
        pathHash: hit.fileHash,
        path: hit.file,
        objectHash: hit.objectHash,
      },
    },
    band: hit.band,
    score: hit.score,
    nameRanges: hit.ranges,
    pathRanges: [],
  };
}

/** One class as a completion: choosing it writes the class term out in full. */
function toClassRow(hit: ObjectClassHit, query: string): RankedRow {
  return {
    row: {
      id: `class:${hit.classHash}`,
      source: "objects",
      name: hit.class,
      path: "",
      trailing: m.workshop_objects_class_count_label({ count: hit.rows }),
      icon: <CubeIcon className="h-4 w-4 text-surface-400" />,
      target: { kind: "query", query: completeClassTerm(query, hit.class) },
    },
    band: 0,
    score: 0,
    nameRanges: [],
    pathRanges: [],
  };
}

/**
 * A row that reports rather than opens, the way the game group's do.
 *
 * Disabled, so the arrows step over it and `Enter` never reaches its target.
 */
function noticeRow(id: string, text: string): RankedRow {
  return {
    band: Number.MAX_SAFE_INTEGER,
    score: 0,
    row: {
      id,
      source: "objects",
      name: text,
      path: "",
      disabled: true,
      icon: null,
      target: { kind: "prefix", prefix: "" },
    },
    nameRanges: [],
    pathRanges: [],
  };
}
