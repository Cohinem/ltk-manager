import type { VfxValue } from "@/lib/tauri";

import { DIAGNOSTIC_LEVEL, type DriverDiagnostic } from "./diagnostics";
import type { DriverKind, DriverNode } from "./node";
import { type DriverReader, driverClass } from "./registry";

/** A graph as `readDriver` types it, and every guess or gap found on the way. */
export interface DriverRead {
  readonly node: DriverNode;
  readonly diagnostics: readonly DriverDiagnostic[];
}

/**
 * The driver graph at `value`, read as a slot of `kind` at `path`.
 *
 * Never throws. A class the registry does not know, a class of another kind, a slot
 * holding no struct and an empty pointer each read as a node that evaluates to the
 * kind's zero, and each is reported.
 */
export function readDriver(value: VfxValue | null, kind: DriverKind, path: string): DriverRead {
  const diagnostics: DriverDiagnostic[] = [];
  const reader: DriverReader = {
    child: (held, childKind, at) => readNode(held, childKind, at, reader),
    report(code, classHash, at) {
      diagnostics.push({ code, level: DIAGNOSTIC_LEVEL[code], classHash, path: at });
    },
  };

  return { node: readNode(value, kind, path, reader), diagnostics };
}

function readNode(
  value: VfxValue | null,
  kind: DriverKind,
  path: string,
  reader: DriverReader,
): DriverNode {
  if (value === null || value.type === "null" || value.type === "none") {
    reader.report("emptyDriver", null, path);
    return { type: "empty", kind, path };
  }
  if (value.type !== "struct") {
    reader.report("notADriver", null, path);
    return { type: "unknown", kind, path, classHash: null, value };
  }

  const known = driverClass(value.classHash);
  if (known === undefined) {
    reader.report("unknownClass", value.classHash, path);
    return { type: "unknown", kind, path, classHash: value.classHash, value };
  }
  if (known.kind !== kind) {
    reader.report("kindMismatch", value.classHash, path);
    return { type: "unknown", kind, path, classHash: value.classHash, value };
  }

  return known.read(value, path, reader);
}
