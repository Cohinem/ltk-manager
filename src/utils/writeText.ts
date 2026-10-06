/**
 * Make `text` the whole text of `element`, changing its one text node in place.
 *
 * `textContent = text` removes every child and appends a new text node. Chromium reads that
 * as a child-list change, and an ancestor matched through `:has()` is then restyled with its
 * whole subtree. The editor's surface is such an ancestor, so a label rewritten that way on
 * every frame restyles the editor on every frame. A change to the node's own value is a text
 * change, which `:has()` does not hear.
 */
export function writeText(element: Element, text: string): void {
  const node = element.firstChild;
  const alone = node !== null && node === element.lastChild && node.nodeType === Node.TEXT_NODE;
  if (!alone) {
    element.textContent = text;
    return;
  }

  if (node.nodeValue !== text) node.nodeValue = text;
}
