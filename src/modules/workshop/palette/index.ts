export {
  compileQuery,
  letterMask,
  maskCovers,
  type Match,
  matchQuery,
  type MatchRange,
  type Query,
  startsQuery,
} from "./matcher";
export { NavigationArrows } from "./NavigationArrows";
export { ProjectBar } from "./ProjectBar";
export { compareRows, rankCandidate, rankCandidates, type RankContext } from "./rank";
export {
  GROUP_CAP,
  HELP_PREFIX,
  PALETTE_SOURCES,
  type PaletteSource,
  paletteSource,
  type ParsedQuery,
  parseQuery,
  prefixScope,
  SCOPED_CAP,
} from "./sources";
export type {
  OpenIntent,
  PaletteCandidate,
  PaletteGroup,
  PaletteSourceId,
  PaletteTarget,
  ProjectCommand,
  RankedRow,
} from "./types";
export { type ProjectCandidates, useProjectCandidates } from "./useProjectCandidates";
export { useProjectCommands } from "./useProjectCommands";
export { type PaletteSearchResult, useProjectSearch } from "./useProjectSearch";
