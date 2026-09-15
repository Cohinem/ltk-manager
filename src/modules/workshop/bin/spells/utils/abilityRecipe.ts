import { z } from "zod";

const seconds = z.number().finite().min(0).max(30);
const reference = z.string().min(1).max(256);

/** An authored visual cast, stored independently of open document handles. */
export const abilityRecipeSchema = z
  .object({
    version: z.literal(1),
    id: reference,
    name: z.string().trim().min(1).max(100),
    character: reference,
    clip: reference.nullable(),
    bone: z.string().max(256),
    release: seconds,
    missileDelay: seconds.optional(),
    timingConflict: z.tuple([seconds, seconds]).optional(),
    guides: z
      .object({
        range: z.number().finite().min(0).max(100000),
        radius: z.number().finite().min(0).max(100000),
        secondaryRadius: z.number().finite().min(0).max(100000),
        coneAngle: z.number().finite().min(0).max(360),
        coneDistance: z.number().finite().min(0).max(100000),
      })
      .optional(),
    castEffect: reference.nullable(),
    projectileEffect: reference.nullable(),
    flightDuration: seconds.positive(),
    impactEffect: reference.nullable(),
    impactDuration: seconds.positive(),
    target: z.tuple([
      z.number().finite().min(-100000).max(100000),
      z.number().finite().min(-100000).max(100000),
      z.number().finite().min(-100000).max(100000),
    ]),
  })
  .refine(
    (recipe) =>
      recipe.timingConflict === undefined &&
      arrivalOf(recipe) + (recipe.impactEffect === null ? 0 : recipe.impactDuration) <= 30,
  );

export type AbilityRecipe = z.infer<typeof abilityRecipeSchema>;

export function launchOf(recipe: {
  release: number;
  missileDelay?: number;
  projectileEffect: string | null;
}): number {
  return recipe.release + (recipe.projectileEffect === null ? 0 : (recipe.missileDelay ?? 0));
}

export function arrivalOf(recipe: {
  release: number;
  projectileEffect: string | null;
  flightDuration: number;
  missileDelay?: number;
}): number {
  return launchOf(recipe) + (recipe.projectileEffect === null ? 0 : recipe.flightDuration);
}

export function readAbilities(value: unknown): AbilityRecipe[] {
  if (!Array.isArray(value)) return [];
  const recipes = new Map<string, AbilityRecipe>();
  for (const entry of value) {
    const read = abilityRecipeSchema.safeParse(entry);
    if (read.success) recipes.set(read.data.id, read.data);
  }
  return [...recipes.values()];
}
