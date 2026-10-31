/** The commands that the panes of the particle shell offer its menu bar. */
export const VFX_COMMAND = {
  copy: "vfx.copy",
  duplicate: "vfx.duplicate",
  paste: "vfx.paste",
  remove: "vfx.remove",
  selectAll: "vfx.selectAll",
  selectNone: "vfx.selectNone",
  adjust: "vfx.adjust",
  quickAdd: "vfx.quickAdd",
  quickField: "vfx.quickField",
  graphItem: "vfx.graphItem",
  addProperty: "vfx.addProperty",
  markerRename: "vfx.markerRename",
  markerDelete: "vfx.markerDelete",
  zoomIn: "vfx.graph.zoomIn",
  zoomOut: "vfx.graph.zoomOut",
  graphFit: "vfx.graph.fit",
  collapseAll: "vfx.graph.collapseAll",
  expandAll: "vfx.graph.expandAll",
  graphPreview: "vfx.graph.preview",
  surfaceLoop: "vfx.graph.surfaceLoop",
  minimap: "vfx.graph.minimap",
  backdrop: "vfx.graph.backdrop",
  frame: "vfx.graph.frame",
  collapseNode: "vfx.graph.collapseNode",
  collapseOthers: "vfx.graph.collapseOthers",
  copyClassName: "vfx.graph.copyClassName",
  copyClassHash: "vfx.graph.copyClassHash",
  resetLayout: "vfx.graph.resetLayout",
  nodeDuplicate: "vfx.graph.nodeDuplicate",
  nodeRemove: "vfx.graph.nodeRemove",
  keyAdd: "vfx.curve.keyAdd",
  keyDelete: "vfx.curve.keyDelete",
  randomAdd: "vfx.curve.randomAdd",
  randomRemove: "vfx.curve.randomRemove",
  curveGraph: "vfx.curve.graph",
  curveTable: "vfx.curve.table",
} as const;

/** The panes that offer commands, as sources of the object tab's command hub. */
export const VFX_PANE = {
  graph: "vfx-graph",
  lanes: "vfx-lanes",
  markers: "vfx-markers",
  viewport: "vfx-viewport",
  inspector: "vfx-inspector",
  curve: "vfx-curve",
  adjust: "vfx-adjust",
} as const;

/** The command of the choice at `at` of the picked node's class. */
export function nodeClassCommand(at: number): string {
  return `vfx.graph.class.${at}`;
}

/** The command that switches the channel at `at` of the curve. */
export function curveChannelCommand(at: number): string {
  return `vfx.curve.channel.${at}`;
}

/** The command of one gizmo handle, `none` for no handle. */
export function handleCommand(kind: string): string {
  return `vfx.handle.${kind}`;
}

/** The offer whose `checked` tells that choosing the handle `kind` writes its property first. */
export function handleAddsCommand(kind: string): string {
  return `vfx.handle.adds.${kind}`;
}
