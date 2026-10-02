/** A placeable's identity in its map, which its name is not: a map skin can repeat a name. */
export function placeableKey(placeable: { chunk: string; key: string }): string {
  return `${placeable.chunk}/${placeable.key}`;
}
