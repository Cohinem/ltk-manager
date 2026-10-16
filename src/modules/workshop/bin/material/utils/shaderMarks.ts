import type { SchemaSwitch, ShaderProgram, Sidecar } from "@/lib/tauri";

/**
 * The reason that a shader def's row does not change the preview: `unread` if the drawn
 * permutation does not read it, `absent` if the shader's TOCs declare no define of a
 * compile-time switch, and `material` if the preview material sets its own value.
 */
export type ShaderMark = "unread" | "absent" | "material";

/** The mark of each row of a shader def's tables, by the row's name. */
export interface ShaderMarks {
  readonly params: ReadonlyMap<string, ShaderMark>;
  readonly textures: ReadonlyMap<string, ShaderMark>;
  readonly switches: ReadonlyMap<string, ShaderMark>;
}

const NO_MARKS: ShaderMarks = { params: new Map(), textures: new Map(), switches: new Map() };

/** Returns the `$Globals` members of `sidecars` that either stage reads. */
function readGlobals(sidecars: readonly Sidecar[]): Set<string> {
  return new Set(
    sidecars.flatMap((sidecar) =>
      sidecar.blocks
        .filter((block) => block.name === "$Globals")
        .flatMap((block) => block.members.filter((member) => member.used))
        .map((member) => member.name),
    ),
  );
}

/**
 * Returns the marks of the first pass of `read`: its parameters by physical name, its textures
 * and its switches. If the pass did not build, only the rows that the preview material sets are
 * marked, since no bytecode was read.
 */
export function shaderMarks(read: ShaderProgram, switches: readonly SchemaSwitch[]): ShaderMarks {
  const pass = read.program.passes[0];
  if (pass === undefined) return NO_MARKS;

  const ready = pass.program.kind === "ready" ? pass.program : null;
  const sidecars = ready === null ? [] : [ready.vertex.sidecar, ready.pixel.sidecar];
  const globals = readGlobals(sidecars);
  const bound = new Set(
    sidecars.flatMap((sidecar) => sidecar.textures.map((texture) => texture.name)),
  );
  const declared = new Set(read.declared.map((define) => define.name));

  const params = new Map<string, ShaderMark>();
  for (const param of pass.pass.params) {
    if (ready !== null && !globals.has(param.name)) {
      params.set(param.name, "unread");
    } else if (param.source !== "shaderDefault") {
      params.set(param.name, "material");
    }
  }

  const textures = new Map<string, ShaderMark>();
  for (const texture of pass.pass.textures) {
    if (ready !== null && !bound.has(`${texture.name}__TX`)) {
      textures.set(texture.name, "unread");
    } else if (texture.source === "material") {
      textures.set(texture.name, "material");
    }
  }

  const switchMarks = new Map<string, ShaderMark>();
  for (const each of switches) {
    if (each.runtime) {
      if (ready !== null && !globals.has(`switch_${each.name}`)) {
        switchMarks.set(each.name, "unread");
      }
    } else if (read.declared.length > 0 && !declared.has(each.name)) {
      switchMarks.set(each.name, "absent");
    }
  }

  return { params, textures, switches: switchMarks };
}
