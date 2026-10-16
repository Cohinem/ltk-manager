import { use, useMemo } from "react";

import { ProblemMark } from "../../../problems/components/ProblemMark";
import { useProblemsAt } from "../../../problems/utils/runCatalogue";
import { LinkAssetContext } from "../../links/hooks/useLinkTargets";

/** The rule whose findings `KindTag` marks from the schema. */
const PROPERTY_TYPE_RULE = "bin/property-type";

/** The Problems mark of the row under `rowKey`, for a document read from a layer file. */
export function RowProblemMark({ rowKey }: { rowKey: string }) {
  const asset = use(LinkAssetContext);
  if (asset?.kind !== "layer") return null;

  return <LayerRowProblemMark layer={asset.layer} path={asset.path} rowKey={rowKey} />;
}

function LayerRowProblemMark({
  layer,
  path,
  rowKey,
}: {
  layer: string;
  path: string;
  rowKey: string;
}) {
  const problems = useProblemsAt(layer, path, rowKey);
  const shown = useMemo(
    () => problems.filter((problem) => problem.rule !== PROPERTY_TYPE_RULE),
    [problems],
  );

  return <ProblemMark problems={shown} />;
}
