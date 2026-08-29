import { z } from "zod";

import type { AppError, ErrorCode, OverlayErrorCategory } from "@/lib/bindings";

export type { AppError, ErrorCode, OverlayErrorCategory } from "@/lib/bindings";

/**
 * Type guard to check if an error has a specific code.
 */
export function hasErrorCode<T extends ErrorCode>(
  error: AppError,
  code: T,
): error is AppError & { code: T } {
  return error.code === code;
}

/**
 * Schema for INVALID_PATH error context
 */
const InvalidPathContextSchema = z.object({
  path: z.string(),
});

/**
 * Context type for INVALID_PATH errors
 */
export type InvalidPathContext = z.infer<typeof InvalidPathContextSchema>;

/**
 * Schema for MOD_NOT_FOUND error context
 */
const ModNotFoundContextSchema = z.object({
  modId: z.string(),
});

/**
 * Context type for MOD_NOT_FOUND errors
 */
export type ModNotFoundContext = z.infer<typeof ModNotFoundContextSchema>;

/**
 * Get typed and validated context from an INVALID_PATH error.
 * Returns undefined if the error code doesn't match or context validation fails.
 */
export function getInvalidPathContext(error: AppError): InvalidPathContext | undefined {
  if (error.code !== "INVALID_PATH" || !error.context) {
    return undefined;
  }
  const result = InvalidPathContextSchema.safeParse(error.context);
  return result.success ? result.data : undefined;
}

/**
 * Get typed and validated context from a MOD_NOT_FOUND error.
 * Returns undefined if the error code doesn't match or context validation fails.
 */
export function getModNotFoundContext(error: AppError): ModNotFoundContext | undefined {
  if (error.code !== "MOD_NOT_FOUND" || !error.context) {
    return undefined;
  }
  const result = ModNotFoundContextSchema.safeParse(error.context);
  return result.success ? result.data : undefined;
}

/**
 * Schema for OVERLAY error context
 */
const overlayErrorCategories = [
  "GAME_DIR",
  "MOD_CONTENT",
  "WAD_LIMIT",
  "CORRUPT",
  "BUG",
  "OTHER",
] as const satisfies readonly OverlayErrorCategory[];

const OverlayContextSchema = z.object({
  category: z.enum(overlayErrorCategories),
});

/**
 * Get the failure category from an OVERLAY error.
 * Returns undefined if the error code doesn't match or context validation fails.
 */
export function getOverlayErrorCategory(error: AppError): OverlayErrorCategory | undefined {
  if (error.code !== "OVERLAY" || !error.context) {
    return undefined;
  }
  const result = OverlayContextSchema.safeParse(error.context);
  return result.success ? result.data.category : undefined;
}
