import { BufferAttribute, BufferGeometry } from "three";

import type { TextGeometry } from "../../engine/commands/types";
import type { Geometry } from "../../engine/geometry/quads";

/** A UI draw's vertices under the attribute names every translated UI program reads. */
export function bufferOf(geometry: Geometry): BufferGeometry {
  const buffer = new BufferGeometry();
  buffer.setAttribute("a_POSITION", new BufferAttribute(new Float32Array(geometry.positions), 2));
  buffer.setAttribute("a_COLOR", new BufferAttribute(new Uint8Array(geometry.colors), 4, true));
  buffer.setAttribute("a_TEXCOORD", new BufferAttribute(new Float32Array(geometry.texcoords), 4));
  buffer.setIndex(geometry.indices);
  return buffer;
}

/** A text pass's vertices under the names the font programs read. */
export function textBufferOf(geometry: TextGeometry): BufferGeometry {
  const buffer = new BufferGeometry();
  buffer.setAttribute("a_POSITION", new BufferAttribute(new Float32Array(geometry.positions), 2));
  buffer.setAttribute("a_COLOR", new BufferAttribute(new Uint8Array(geometry.colors), 4, true));
  buffer.setAttribute("a_TEXCOORD", new BufferAttribute(new Float32Array(geometry.texcoords), 2));
  buffer.setAttribute(
    "a_TEXCOORD1",
    new BufferAttribute(new Float32Array(geometry.fillTexcoords), 2),
  );
  buffer.setIndex(geometry.indices);
  return buffer;
}
