import { describe, expect, it } from "vitest";

import type { VfxValue } from "@/lib/tauri";

import {
  bool,
  list,
  number,
  struct,
  valueCurve,
  vector,
} from "../../../engine/drivers/__tests__/driverFixture";
import { shimmerMeshesOf } from "../shimmerMeshes";

function asset(path: string): VfxValue {
  return { type: "asset", path, asset: { kind: "file", path } };
}

/** One cube-grid shimmer emitter as the Hall of Legends writes it. */
function cube(name: string, mesh: VfxValue): VfxValue {
  return struct("VfxShimmerEmitterDefinitionData", {
    emitterName: { type: "string", value: name },
    disabled: bool(true),
    VfxComponents: struct("VfxComponents", {
      PhysicsComponent: struct("VfxModularPhysicsComponent", {
        Modifiers: list(
          struct("0x710b2bc2", {
            InitialScale: struct("VfxVector3DynamicProperty", {
              Vector3: struct("VfxVector3ConstantDriver", { Vector3: vector(10, 10, 10) }),
            }),
            InitialRotation: struct("VfxVector3DynamicProperty", {
              Vector3: struct("VfxVector3ConstantDriver", { Vector3: vector(180, 0, 0) }),
            }),
          }),
        ),
      }),
      RenderComponent: struct("VfxMaterialRenderComponent", {
        Color: struct("0x12345678", {
          InitialColor: struct("VfxVector4DynamicProperty", {
            Vector4: struct("0x7cc5a312", {
              colors: valueCurve("ValueColor", vector(0.5, 0.25, 1, 1)),
            }),
          }),
        }),
      }),
      GeometryComponent: struct("VfxGeometryComponent", {
        Primitive: struct("VfxShimmerPrimitiveMesh", {
          texture: asset("assets/cube.tex"),
          mesh,
          count: number(1),
        }),
      }),
    }),
  });
}

function system(...emitters: VfxValue[]): VfxValue {
  return struct("VfxSystemDefinitionData", { shimmerEmitterDefinitionData: list(...emitters) });
}

describe("shimmerMeshesOf", () => {
  it("reads each emitter's mesh, texture and constant graphs", () => {
    const [cubeMesh] = shimmerMeshesOf(system(cube("Cube", asset("assets/cube.gmesh"))));

    expect(cubeMesh).toMatchObject({
      index: 0,
      name: "Cube",
      disabled: true,
      mesh: { path: "assets/cube.gmesh" },
      texture: { kind: "file", path: "assets/cube.tex" },
      scale: [10, 10, 10],
      rotation: [180, 0, 0],
      offset: [0, 0, 0],
    });
    expect(cubeMesh?.color).toEqual([0.5, 0.25, 1, 1]);
  });

  it("leaves out an emitter whose geometry names no mesh", () => {
    const meshes = shimmerMeshesOf(
      system(cube("Quad", asset("assets/quad.tex")), cube("Cube", asset("assets/cube.tmesh"))),
    );

    expect(meshes.map((each) => each.name)).toEqual(["Cube"]);
    expect(meshes[0]?.index).toBe(1);
  });
});
