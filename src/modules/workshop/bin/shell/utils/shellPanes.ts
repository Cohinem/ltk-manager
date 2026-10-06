import {
  AtomIcon,
  BezierCurveIcon,
  BoneIcon,
  ChartBarHorizontalIcon,
  DevicesIcon,
  FilmStripIcon,
  GraphIcon,
  type Icon,
  ImagesIcon,
  LightningIcon,
  MonitorIcon,
  ShapesIcon,
  SlidersHorizontalIcon,
  SparkleIcon,
  SphereIcon,
  StackIcon,
  TreeStructureIcon,
} from "@phosphor-icons/react";

import { m } from "@/i18n";
/* The layout sub-barrel rather than the module barrel: the full barrel pulls
   the editor's components, whose imports circle back into workshop state. */
// eslint-disable-next-line no-restricted-imports -- the cycle the comment above names
import { type LayoutNode, leafHolding, leaves, singleLeaf } from "@/modules/editor/layout";

/** One pane of a shell, which is what a leaf of a shell's tree holds. */
export type ShellPaneId =
  | "emitters"
  | "curve"
  | "inspector"
  | "preview"
  | "timeline"
  | "clips"
  | "spells"
  | "outliner"
  | "material"
  | "graph"
  | "components"
  | "layers"
  | "variants"
  | "sprites"
  | "skeleton"
  | "physics";

export const SHELL_PANE_IDS: readonly ShellPaneId[] = [
  "emitters",
  "curve",
  "inspector",
  "preview",
  "timeline",
  "clips",
  "spells",
  "outliner",
  "material",
  "graph",
  "components",
  "layers",
  "variants",
  "sprites",
  "skeleton",
  "physics",
];

/** Which shell a layout draws in, and so which panes its tree holds (ADR-0036). */
export type ShellKind = "vfx" | "skin" | "map" | "material" | "atlas" | "font" | "element";

/** The panes each shell holds, in the order the Panes menu lists them. */
export const SHELL_PANES = {
  vfx: ["preview", "timeline", "inspector", "curve", "emitters", "graph"],
  skin: ["preview", "clips", "spells", "material", "skeleton", "inspector", "physics"],
  map: ["preview", "outliner", "inspector"],
  material: ["preview", "inspector"],
  atlas: ["preview", "components", "layers", "variants", "sprites", "inspector"],
  font: ["preview", "inspector"],
  element: ["preview", "inspector"],
} as const satisfies Record<ShellKind, readonly ShellPaneId[]>;

/** The panes a `K` shell holds, which its content names one body for each of. */
export type ShellPaneOf<K extends ShellKind> = (typeof SHELL_PANES)[K][number];

/** The panes `kind` holds, as a list of any pane. */
export function shellPanesOf(kind: ShellKind): readonly ShellPaneId[] {
  return SHELL_PANES[kind];
}

/** What a pane's tab says, and what the Panes menu lists it as. */
export const SHELL_PANE_TITLE: Record<ShellPaneId, () => string> = {
  emitters: m.workshop_bin_pane_emitters_label,
  curve: m.workshop_bin_pane_curve_label,
  inspector: m.workshop_bin_pane_inspector_label,
  preview: m.workshop_bin_pane_preview_label,
  timeline: m.workshop_bin_pane_timeline_label,
  clips: m.workshop_bin_pane_clips_label,
  spells: m.workshop_bin_pane_spells_label,
  outliner: m.workshop_bin_pane_outliner_label,
  material: m.workshop_bin_pane_material_label,
  graph: m.workshop_bin_pane_graph_label,
  components: m.workshop_bin_pane_components_label,
  layers: m.workshop_bin_pane_layers_label,
  variants: m.workshop_bin_pane_variants_label,
  sprites: m.workshop_bin_pane_sprites_label,
  skeleton: m.workshop_bin_pane_skeleton_label,
  physics: m.workshop_bin_pane_physics_label,
};

/** The glyph the Panes menu lists a pane by. */
export const SHELL_PANE_ICON: Record<ShellPaneId, Icon> = {
  emitters: SparkleIcon,
  curve: BezierCurveIcon,
  inspector: SlidersHorizontalIcon,
  preview: MonitorIcon,
  timeline: ChartBarHorizontalIcon,
  clips: FilmStripIcon,
  spells: LightningIcon,
  outliner: TreeStructureIcon,
  material: SphereIcon,
  graph: GraphIcon,
  components: ShapesIcon,
  layers: StackIcon,
  variants: DevicesIcon,
  sprites: ImagesIcon,
  skeleton: BoneIcon,
  physics: AtomIcon,
};

export function isShellPaneId(value: unknown): value is ShellPaneId {
  return typeof value === "string" && (SHELL_PANE_IDS as readonly string[]).includes(value);
}

/** One shell's tree, and the leaf a reopened pane lands in. */
export interface ShellArrangement {
  readonly layout: LayoutNode;
  readonly leafId: string;
}

/** Every shell's arrangement, by the kind of shell it is. */
export type ShellArrangements = Readonly<Record<ShellKind, ShellArrangement>>;

/**
 * The panes as a shell ships them, which is what a reset produces.
 *
 * The shares are flex-grow ratios rather than sizes, so a panel keeps its proportion at
 * any window width. The preview takes the largest single share in each, because what is
 * drawn is what the reader edits the numbers against. The particle system's is the
 * arrangement of "The shell" in docs/ux/BIN_EDITOR.md (ADR-0037), and the material's is
 * "The material shell" there, which a font shares. The skin's is "The shell" in
 * docs/ux/SKIN_EDITOR.md. Atlas's is "Panes" in docs/plans/atlas-ui-editor.md.
 */
export function defaultShellLayout(kind: ShellKind): LayoutNode {
  if (kind === "atlas") {
    return {
      kind: "split",
      id: "split-1",
      dir: "row",
      layout: { "split-4": 1, "leaf-2": 4, "leaf-3": 1 },
      children: [
        {
          kind: "split",
          id: "split-4",
          dir: "col",
          layout: { "leaf-6": 2, "leaf-5": 3 },
          children: [
            { kind: "leaf", id: "leaf-6", tabs: ["components"], activeTab: "components" },
            {
              kind: "leaf",
              id: "leaf-5",
              tabs: ["layers", "variants", "sprites"],
              activeTab: "layers",
            },
          ],
        },
        { kind: "leaf", id: "leaf-2", tabs: ["preview"], activeTab: "preview" },
        { kind: "leaf", id: "leaf-3", tabs: ["inspector"], activeTab: "inspector" },
      ],
    };
  }

  if (kind === "material" || kind === "font" || kind === "element") {
    return {
      kind: "split",
      id: "split-1",
      dir: "row",
      layout: { "leaf-2": 3, "leaf-3": 2 },
      children: [
        { kind: "leaf", id: "leaf-2", tabs: ["preview"], activeTab: "preview" },
        { kind: "leaf", id: "leaf-3", tabs: ["inspector"], activeTab: "inspector" },
      ],
    };
  }

  if (kind === "map") {
    return {
      kind: "split",
      id: "split-1",
      dir: "row",
      layout: { "leaf-2": 3, "split-4": 1 },
      children: [
        { kind: "leaf", id: "leaf-2", tabs: ["preview"], activeTab: "preview" },
        {
          kind: "split",
          id: "split-4",
          dir: "col",
          children: [
            { kind: "leaf", id: "leaf-5", tabs: ["outliner"], activeTab: "outliner" },
            { kind: "leaf", id: "leaf-3", tabs: ["inspector"], activeTab: "inspector" },
          ],
        },
      ],
    };
  }

  if (kind === "skin") {
    return {
      kind: "split",
      id: "split-1",
      dir: "row",
      layout: { "split-6": 3, "split-4": 2 },
      children: [
        {
          kind: "split",
          id: "split-6",
          dir: "col",
          layout: { "leaf-2": 3, "leaf-5": 1 },
          children: [
            { kind: "leaf", id: "leaf-2", tabs: ["preview"], activeTab: "preview" },
            { kind: "leaf", id: "leaf-5", tabs: ["clips", "spells"], activeTab: "clips" },
          ],
        },
        {
          kind: "split",
          id: "split-4",
          dir: "col",
          children: [
            {
              kind: "leaf",
              id: "leaf-7",
              tabs: ["material", "skeleton"],
              activeTab: "material",
            },
            {
              kind: "leaf",
              id: "leaf-3",
              tabs: ["inspector", "physics"],
              activeTab: "inspector",
            },
          ],
        },
      ],
    };
  }

  return {
    kind: "split",
    id: "split-1",
    dir: "col",
    layout: { "split-2": 3, "split-6": 2 },
    children: [
      {
        kind: "split",
        id: "split-2",
        dir: "row",
        layout: { "leaf-3": 3, "leaf-4": 2 },
        children: [
          { kind: "leaf", id: "leaf-3", tabs: ["preview"], activeTab: "preview" },
          { kind: "leaf", id: "leaf-4", tabs: ["inspector"], activeTab: "inspector" },
        ],
      },
      {
        kind: "split",
        id: "split-6",
        dir: "row",
        layout: { "leaf-7": 3, "leaf-5": 2 },
        children: [
          { kind: "leaf", id: "leaf-7", tabs: ["timeline"], activeTab: "timeline" },
          { kind: "leaf", id: "leaf-5", tabs: ["curve"], activeTab: "curve" },
        ],
      },
    ],
  };
}

/** Every shell as it ships, each focused on its first panel. */
export function defaultShellArrangements(): ShellArrangements {
  const arranged = (kind: ShellKind): ShellArrangement => {
    const layout = defaultShellLayout(kind);
    return { layout, leafId: firstShellLeafId(layout) };
  };
  return {
    vfx: arranged("vfx"),
    skin: arranged("skin"),
    map: arranged("map"),
    material: arranged("material"),
    atlas: arranged("atlas"),
    font: arranged("font"),
    element: arranged("element"),
  };
}

/** The leaf a reopened pane lands in when the one the reader focused is gone. */
export function firstShellLeafId(tree: LayoutNode): string {
  return leaves(tree)[0].id;
}

/** Every pane the tree holds, which is what the Panes menu ticks. */
export function openShellPanes(tree: LayoutNode): ReadonlySet<ShellPaneId> {
  return new Set(leaves(tree).flatMap((leaf) => leaf.tabs.filter(isShellPaneId)));
}

/**
 * Shape an untrusted tree into one a `kind` shell can draw.
 *
 * A pane the shell does not hold drops rather than crashing the first render, and a
 * value that is no tree at all falls back to a single empty leaf, which draws the Panes
 * menu and nothing else. A skin tree saved before the clips pane existed gains it over
 * the inspector, per "The clips pane" in docs/ux/SKIN_EDITOR.md, and one saved before the
 * material pane existed gains it as a tab behind the inspector, and one saved before the
 * skeleton pane existed gains it as a tab behind the material. One saved before the
 * physics pane existed gains it as a tab behind the inspector. An Atlas tree saved before
 * the sprites pane existed gains it as a tab behind the variants, and one saved before the
 * components pane existed gains it as a tab behind the layers.
 *
 * A tree that lacks one of those panes reads the same whether it was saved before the pane
 * existed or the reader closed the pane, so a closed clips, material, skeleton, physics,
 * sprites or components pane comes back when the tree is read again.
 */
export function sanitizeShellLayout(kind: ShellKind, value: unknown): LayoutNode {
  const held = new Set<ShellPaneId>();
  let tree = readNode(value, shellPanesOf(kind), held) ?? singleLeaf();
  if (kind === "atlas") {
    if (!held.has("sprites")) tree = withTabBeside(tree, "variants", "sprites");
    if (!held.has("components")) tree = withTabBeside(tree, "layers", "components");
    return tree;
  }
  if (kind !== "skin") return tree;

  if (!held.has("clips")) tree = withClipsPane(tree);
  if (!held.has("material")) tree = withTabBeside(tree, "inspector", "material");
  if (!held.has("skeleton")) tree = withTabBeside(tree, "material", "skeleton");
  if (!held.has("physics")) tree = withTabBeside(tree, "inspector", "physics");
  return tree;
}

/** `tree` with `pane` a tab behind `beside`'s, and `tree` as it is where no leaf holds `beside`. */
function withTabBeside(tree: LayoutNode, beside: ShellPaneId, pane: ShellPaneId): LayoutNode {
  const leaf = leafHolding(tree, beside);
  if (leaf === null) return tree;
  return replaceNode(tree, leaf.id, { ...leaf, tabs: [...leaf.tabs, pane] });
}

/**
 * `tree` with a clips leaf split in above the inspector's, and `tree` as it is where no
 * leaf holds the inspector.
 */
function withClipsPane(tree: LayoutNode): LayoutNode {
  const inspector = leafHolding(tree, "inspector");
  if (inspector === null) return tree;
  const next = nextIdNumber(tree);
  const clips: LayoutNode = {
    kind: "leaf",
    id: `leaf-${next}`,
    tabs: ["clips"],
    activeTab: "clips",
  };
  const split: LayoutNode = {
    kind: "split",
    id: `split-${next + 1}`,
    dir: "col",
    children: [clips, inspector],
  };
  return replaceNode(tree, inspector.id, split);
}

/** `tree` with the node whose id is `id` swapped for `node`. */
function replaceNode(tree: LayoutNode, id: string, node: LayoutNode): LayoutNode {
  if (tree.id === id) return node;
  if (tree.kind === "leaf") return tree;
  return { ...tree, children: tree.children.map((child) => replaceNode(child, id, node)) };
}

/** One past the largest number any id of `tree` ends in, so a minted id is no id it holds. */
function nextIdNumber(tree: LayoutNode): number {
  const own = Number(/-(\d+)$/.exec(tree.id)?.[1] ?? 0);
  if (tree.kind === "leaf") return own + 1;
  return Math.max(own + 1, ...tree.children.map(nextIdNumber));
}

/* `held` carries the panes the leaves to the left already took, so a file
   naming one pane twice keeps the first and the tree op that moves it still has
   exactly one leaf to remove it from. */
function readNode(
  value: unknown,
  panes: readonly ShellPaneId[],
  held: Set<ShellPaneId>,
): LayoutNode | null {
  if (typeof value !== "object" || value === null) return null;
  const node = value as Partial<LayoutNode> & { children?: unknown; layout?: unknown };
  if (typeof node.id !== "string" || node.id.includes(":")) return null;

  if (node.kind === "leaf") {
    const tabs = (Array.isArray(node.tabs) ? node.tabs : []).filter(
      (tab): tab is ShellPaneId => isShellPaneId(tab) && panes.includes(tab) && !held.has(tab),
    );
    for (const tab of tabs) held.add(tab);

    const activeTab =
      isShellPaneId(node.activeTab) && tabs.includes(node.activeTab)
        ? node.activeTab
        : (tabs[0] ?? null);
    return { kind: "leaf", id: node.id, tabs, activeTab };
  }

  if (node.kind !== "split") return null;
  if (node.dir !== "row" && node.dir !== "col") return null;
  if (!Array.isArray(node.children)) return null;

  /* An empty leaf under a split is a hole the reader cannot fill, since a pane
     only reopens into the focused leaf. It drops, and its parent with it once
     nothing is left. */
  const children = node.children
    .map((child) => readNode(child, panes, held))
    .filter((child): child is LayoutNode => child !== null)
    .filter((child) => child.kind === "split" || child.tabs.length > 0);
  if (children.length === 0) return null;
  if (children.length === 1) return children[0];

  return { kind: "split", id: node.id, dir: node.dir, children, layout: readShares(node.layout) };
}

function readShares(value: unknown): Record<string, number> | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const shares: Record<string, number> = {};
  for (const [id, share] of Object.entries(value)) {
    if (typeof share === "number" && Number.isFinite(share) && share > 0) shares[id] = share;
  }
  return Object.keys(shares).length === 0 ? undefined : shares;
}
