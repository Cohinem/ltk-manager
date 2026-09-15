import { contentQueries } from "../content/api/queries";
import { ignoreRuleQueries } from "../ignore-rules/api/queries";
import { layerQueries } from "../layers/api/queries";
import { problemQueries } from "../problems/api/queries";
import { projectDetailsQueries } from "../projects/api/queries";
import { projectTextQueries } from "../text-files/api/queries";

export const projectQueries = {
  all: projectDetailsQueries.all,
  byPath: projectDetailsQueries.byPath,
  contentTree: contentQueries.contentTree,
  problems: problemQueries.problems,
  thumbnail: projectDetailsQueries.thumbnail,
  ignoreRules: ignoreRuleQueries.ignoreRules,
  projectText: projectTextQueries.projectText,
  recommendedIgnoreRules: ignoreRuleQueries.recommendedIgnoreRules,
  validation: problemQueries.validation,
  layerInfo: layerQueries.layerInfo,
} as const;

export { stringQueries } from "../string-overrides/api/queries";
