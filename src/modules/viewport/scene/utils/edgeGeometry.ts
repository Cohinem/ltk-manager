import { BufferAttribute, BufferGeometry, type GeometryGroup } from "three";

/** One run of triangle indices, which is what a submesh names. */
export interface TriangleRun {
  readonly startIndex: number;
  readonly indexCount: number;
}

/** One run of an edge index, in indices. */
export interface EdgeRange {
  readonly start: number;
  readonly count: number;
}

/** The unique edges of a mesh, as line segment indices. */
export interface EdgeIndex {
  readonly indices: Uint32Array;
  /** Each triangle run's edges, by the run's `startIndex`. */
  readonly ranges: ReadonlyMap<number, EdgeRange>;
  /** The mean length of an edge, in the mesh's units. */
  readonly spacing: number;
}

/** How many edges the mean length is measured over. */
const SPACING_SAMPLES = 4096;

const VERTEX_FLOATS = 3;

/** The golden-ratio multipliers that spread two vertex numbers over the table. */
const HASH_A = 0x9e3779b1;
const HASH_B = 0x85ebca6b;

/** The smallest power of two that holds `count` edges at half load. */
function tableSize(count: number): number {
  return 2 ** Math.ceil(Math.log2(Math.max(count, 1) * 2));
}

/**
 * Returns the edges of each of `runs`, each once.
 *
 * An edge that two triangles share writes one segment, so a blended edge reads at one opacity
 * and the GPU draws half the lines. An edge on the seam of two runs belongs to both, so either
 * run draws it alone.
 */
export function uniqueEdges(
  triangles: ArrayLike<number>,
  positions: ArrayLike<number>,
  runs: readonly TriangleRun[],
): EdgeIndex {
  const total = runs.reduce((sum, run) => sum + run.indexCount, 0);
  const written = new Uint32Array(total * 2);
  const largest = runs.reduce((most, run) => Math.max(most, run.indexCount), 0);
  const table = new Uint32Array(tableSize(largest));
  const ranges = new Map<number, EdgeRange>();
  let edges = 0;

  for (const { startIndex, indexCount } of runs) {
    if (ranges.has(startIndex)) continue;

    const first = edges;
    const size = tableSize(indexCount);
    const mask = size - 1;
    table.fill(0, 0, size);

    const add = (from: number, to: number) => {
      if (from === to) return;

      const low = Math.min(from, to);
      const high = Math.max(from, to);
      let slot = (Math.imul(low, HASH_A) ^ Math.imul(high, HASH_B)) & mask;
      for (;;) {
        const held = table[slot] ?? 0;
        if (held === 0) break;
        if (written[(held - 1) * 2] === low && written[(held - 1) * 2 + 1] === high) return;
        slot = (slot + 1) & mask;
      }
      written[edges * 2] = low;
      written[edges * 2 + 1] = high;
      edges += 1;
      table[slot] = edges;
    };

    const end = startIndex + indexCount - (indexCount % 3);
    for (let at = startIndex; at < end; at += 3) {
      const a = triangles[at] ?? 0;
      const b = triangles[at + 1] ?? 0;
      const c = triangles[at + 2] ?? 0;
      add(a, b);
      add(b, c);
      add(c, a);
    }
    ranges.set(startIndex, { start: first * 2, count: (edges - first) * 2 });
  }

  const indices = written.slice(0, edges * 2);
  return { indices, ranges, spacing: meanLength(indices, positions) };
}

function meanLength(indices: Uint32Array, positions: ArrayLike<number>): number {
  const edges = indices.length / 2;
  if (edges === 0) return 0;

  const stride = Math.max(1, Math.floor(edges / SPACING_SAMPLES));
  let sum = 0;
  let measured = 0;
  for (let edge = 0; edge < edges; edge += stride) {
    const a = (indices[edge * 2] ?? 0) * VERTEX_FLOATS;
    const b = (indices[edge * 2 + 1] ?? 0) * VERTEX_FLOATS;
    sum += Math.hypot(
      (positions[a] ?? 0) - (positions[b] ?? 0),
      (positions[a + 1] ?? 0) - (positions[b + 1] ?? 0),
      (positions[a + 2] ?? 0) - (positions[b + 2] ?? 0),
    );
    measured += 1;
  }
  return sum / measured;
}

const BUILT = new WeakMap<object, EdgeIndex>();

/** Returns `uniqueEdges` of `triangles`, built once per index array. */
export function edgeIndexOf(
  triangles: Uint32Array | Uint16Array,
  positions: ArrayLike<number>,
  runs: readonly TriangleRun[],
): EdgeIndex {
  const found = BUILT.get(triangles);
  if (found !== undefined) return found;

  const made = uniqueEdges(triangles, positions, runs);
  BUILT.set(triangles, made);
  return made;
}

/**
 * An index of its own over the attributes of another geometry.
 *
 * `dispose` frees the index alone. Three deletes the buffers of every attribute a disposed
 * geometry names, which would upload the source geometry's vertices again.
 */
class EdgeGeometry extends BufferGeometry {
  override dispose(): void {
    const shared = this.attributes;
    this.attributes = {};
    super.dispose();
    this.attributes = shared;
  }
}

/** Returns a geometry that draws `edges` over the named attributes of `source`. */
export function createEdgeGeometry(
  source: BufferGeometry,
  edges: EdgeIndex,
  attributes: readonly string[],
): BufferGeometry {
  const geometry = new EdgeGeometry();
  geometry.setIndex(new BufferAttribute(edges.indices, 1));
  for (const name of attributes) {
    const attribute = source.getAttribute(name);
    if (attribute !== undefined) geometry.setAttribute(name, attribute);
  }
  return geometry;
}

/**
 * Points `target`'s groups at the edges of `groups`, in order. Reuses the group objects, so a
 * write allocates nothing once the list has reached its longest.
 */
export function writeEdgeGroups(
  target: BufferGeometry,
  groups: readonly GeometryGroup[],
  ranges: ReadonlyMap<number, EdgeRange>,
): void {
  const written = target.groups;
  let count = 0;

  for (const { start, materialIndex } of groups) {
    const range = ranges.get(start);
    if (range === undefined) continue;

    const slot = written[count];
    if (slot === undefined) {
      written.push({ start: range.start, count: range.count, materialIndex });
    } else {
      slot.start = range.start;
      slot.count = range.count;
      slot.materialIndex = materialIndex;
    }
    count += 1;
  }
  written.length = count;
}
