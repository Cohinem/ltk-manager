import { Line } from "@react-three/drei";
import { useMemo } from "react";

import { AXIS_SIGN, useSceneColors } from "@/modules/viewport";

import type { AbilityRecipe } from "../utils/abilityRecipe";
import { guideLines } from "../utils/guideLines";

export function AbilityGuides({ recipe }: { recipe: AbilityRecipe }) {
  const colors = useSceneColors();
  const lines = useMemo(
    () =>
      recipe.guides === undefined
        ? []
        : guideLines(recipe.guides, recipe.target).map((line) =>
            line.map(
              (point) =>
                point.map((value, axis) => value * AXIS_SIGN[axis]) as [number, number, number],
            ),
          ),
    [recipe],
  );
  return (
    <>
      {lines.map((points, index) => (
        <Line key={index} points={points} color={colors.gizmo} lineWidth={1} />
      ))}
    </>
  );
}
