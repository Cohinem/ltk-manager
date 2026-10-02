import type { VfxValue } from "@/lib/tauri";

import { nameHash } from "../../../../shared/utils/binHash";

/** A struct of `className`, or of a hex class hash, holding `fields` by name. */
export function struct(className: string, fields: Record<string, VfxValue> = {}): VfxValue {
  return {
    type: "struct",
    classHash: className.startsWith("0x") ? className : nameHash(className),
    class: null,
    object: null,
    fields: Object.entries(fields).map(([name, value]) => ({
      hash: name.startsWith("0x") ? name : nameHash(name),
      name,
      value,
    })),
  };
}

export function list(...items: VfxValue[]): VfxValue {
  return { type: "container", items };
}

export function number(value: number): VfxValue {
  return { type: "number", value };
}

export function vector(...values: number[]): VfxValue {
  return { type: "vector", values };
}

export function bool(value: boolean): VfxValue {
  return { type: "bool", value };
}

/** A value class with `constantValue`, and keys where `keys` holds any. */
export function valueCurve(
  className: string,
  constantValue: VfxValue,
  keys: readonly (readonly [number, VfxValue])[] = [],
): VfxValue {
  if (keys.length === 0) return struct(className, { constantValue });
  return struct(className, {
    constantValue,
    dynamics: struct("VfxAnimatedFloatVariableData", {
      times: { type: "container", items: keys.map(([time]) => number(time)) },
      values: { type: "container", items: keys.map(([, value]) => value) },
    }),
  });
}
