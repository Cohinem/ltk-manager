/** The colour channels a vertex tint takes, one grey level written to each. */
const CHANNELS = 3;

/** The shader joints one vertex binds to, as the `.skn` writes them. */
const BONES_PER_VERTEX = 4;

/**
 * How much of its colour a vertex keeps where no joint weighs it, which is the same dim a
 * submesh takes while another one is highlighted.
 */
export const UNWEIGHTED = 0.3;

/**
 * A grey per vertex, `CHANNELS` each, from how much the joints weighing it are weighed.
 *
 * A vertex's tint is its skin weights times each shader joint's weight, so a vertex
 * between a weighed joint and one not weighed grades between them as its skin does. A
 * null `jointWeights` writes full colour everywhere.
 */
export function vertexTints(
  skinIndices: ArrayLike<number>,
  skinWeights: ArrayLike<number>,
  influences: ArrayLike<number>,
  jointWeights: ArrayLike<number> | null,
  out: Float32Array,
): Float32Array {
  const vertices = skinIndices.length / BONES_PER_VERTEX;
  for (let vertex = 0; vertex < vertices; vertex += 1) {
    let grey = 1;
    if (jointWeights !== null) {
      let weighed = 0;
      for (let bone = 0; bone < BONES_PER_VERTEX; bone += 1) {
        const at = vertex * BONES_PER_VERTEX + bone;
        const joint = influences[skinIndices[at]] ?? -1;
        weighed += skinWeights[at] * Math.min(1, Math.max(0, jointWeights[joint] ?? 0));
      }
      grey = UNWEIGHTED + (1 - UNWEIGHTED) * Math.min(1, weighed);
    }
    out.fill(grey, vertex * CHANNELS, (vertex + 1) * CHANNELS);
  }
  return out;
}

/** The floats `vertexTints` writes for `vertices`. */
export function tintFloats(vertices: number): number {
  return vertices * CHANNELS;
}
