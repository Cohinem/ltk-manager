/**
 * The frame budget of tier 7 in docs/plans/atlas-renderer.md, measured on the largest shipped
 * views: how long a view takes to lay out and to turn into commands, and how many draws its frame
 * holds. `the_largest_shipped_views_dump_for_the_frame_bench` in `crates/atlas/src/tests.rs` writes
 * the views, and `LTK_VIEW_DUMP` names the folder it wrote.
 */
import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import type { UiView } from "@/lib/tauri";

import { batchDraws } from "../commands/batch";
import { boardCommands } from "../commands/board";
import { type PreviewState, visibleElements } from "../commands/build";
import { boardOf, onBoard } from "../layout/board";
import { NO_FRAME_CHOICES } from "../layout/frames";
import { FULL_SAFE_ZONE, type LayoutSettings, solve } from "../layout/solve";
import { NO_OVERLAY } from "../model/combo";
import { repeatClones, viewRepeats, withClones } from "../model/repeats";
import { buildTree } from "../model/tree";
import { finiteView } from "../model/view";
import { restingHiddenScenes } from "../model/visibility";

const DUMP = process.env.LTK_VIEW_DUMP;

const SCREEN = { width: 2560, height: 1440 };
const SETTINGS: LayoutSettings = { screen: SCREEN, hud: 1, safeZone: FULL_SAFE_ZONE };
/** How many times each step runs, the fastest run counting. */
const RUNS = 20;
/** What a new layout may cost: half a frame at 60 a second, the rest left to the draw. */
const FRAME_BUDGET_MS = 8;
/** The draws one view's frame may hold once its icons batch. */
const DRAW_BUDGET = 512;

function fastest(run: () => void): number {
  let best = Number.POSITIVE_INFINITY;
  for (let at = 0; at < RUNS; at += 1) {
    const start = performance.now();
    run();
    best = Math.min(best, performance.now() - start);
  }
  return best;
}

function rounded(ms: number): number {
  return Math.round(ms * 100) / 100;
}

describe.skipIf(DUMP === undefined)("the frame budget of the largest shipped views", () => {
  it("lays out, builds and batches each view within the frame and draw budgets", () => {
    const root = DUMP ?? "";
    const files = fs.readdirSync(root).filter((file) => file.endsWith(".json"));
    expect(files.length).toBeGreaterThan(0);

    for (const file of files.sort()) {
      const raw = JSON.parse(fs.readFileSync(path.join(root, file), "utf8")) as UiView;
      const tree = buildTree(finiteView(raw));
      /* The worst case: every scene and every element the file leaves off drawn too. */
      const hiddenScenes = new Set<string>();
      const preview: PreviewState = {
        hiddenScenes,
        buttonStates: new Map(),
        meterFills: new Map(),
        showDisabled: true,
        tooltip: null,
        hiddenElements: new Set(),
        effects: true,
        samples: false,
        only: null,
        overlay: NO_OVERLAY,
      };

      const solved = solve(tree, SETTINGS);
      const board = boardOf(tree, SCREEN, hiddenScenes, false, NO_FRAME_CHOICES);
      const placed = onBoard(board, solved);
      /* The rows and cards a controller clones at run time, as the canvas draws them. */
      const order = new Set(visibleElements(tree, preview));
      const clones = repeatClones(tree, placed, viewRepeats(tree, placed), order);
      const input = {
        tree,
        solved: placed,
        settings: SETTINGS,
        preview: { ...preview, overlay: withClones(preview.overlay, clones) },
        textureSizes: new Map<number, readonly [number, number]>(),
        text: null,
      };
      const frames = boardCommands(board, input);
      const commands = frames.flatMap((frame) => frame.commands);

      const row = {
        view: file,
        class: tree.view.class,
        resting: restingHiddenScenes(tree).size,
        elements: tree.elements.size,
        frames: board.frames.length,
        commands: commands.length,
        draws: commands.filter((command) => command.kind === "draw").length,
        batched: frames
          .flatMap((frame) => batchDraws(frame.commands))
          .filter((command) => command.kind === "draw").length,
        frameMs: rounded(
          fastest(() => {
            const laid = onBoard(board, solve(tree, SETTINGS));
            for (const frame of boardCommands(board, { ...input, solved: laid })) {
              batchDraws(frame.commands);
            }
          }),
        ),
      };
      console.log(JSON.stringify(row));

      expect(row.frameMs, row.view).toBeLessThan(FRAME_BUDGET_MS);
      expect(row.batched, row.view).toBeLessThanOrEqual(DRAW_BUDGET);
    }
  });
});
