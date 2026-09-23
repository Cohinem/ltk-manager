# ADR-0047: A material opens into a shell of its own

- **Status:** Accepted (2026-09-23)
- **Date:** 2026-09-23
- **Crates:** none. The shell is frontend, and the program read it draws is
  `read_material_programs` as `docs/plans/shader-pipeline.md` built it
- **Related:** Amends [ADR-0036](0036-a-shells-panes-are-its-layouts-own.md), which gave the
  particle system, the skin and the map a shell each. The rule is stated in "The material shell"
  in `docs/ux/BIN_EDITOR.md`. The plan is `docs/plans/material-editor.md`.

## Context and problem statement

`StaticMaterialDef` drew as a stack of sections: its samplers, parameters and switches as rows,
its macros and techniques as trees. The viewport can now draw a material with the game's own
translated shader (Hexshade), but a reader could only see the result on a character, in the skin
view, and only for the materials that skin links. A material opened on its own showed its numbers
and nothing they produce.

The open question was whether the material's picture belongs in the stack as a hero above the
sections, or in a shell where the picture, the fields and what the shader became are all on
screen at once.

## Decision

**`StaticMaterialDef` declares `shell: "material"`, and the shell holds two panes.** The
preview, first and the widest, and the inspector holding every section of the layout. A material
is tuned against its picture the way a particle system is. A picture the reader did not expect is
explained over the preview's corner and on the inspector's rows, in the reader's words. The
shader ids and define list a translation produced are not shown, since no reader edits them.

**The preview draws the character of the material's own file, and a shape behind a toggle.**
A texture is painted for the mesh it wraps, so a weapon atlas on a sphere reads as noise, and
the skin of the same file that draws with the material is where it reads right. A sphere, a
cube, a plane or a cylinder shows every material the same way, which is what a grid of them
wants, and what a material no skin of its file links draws on.

**The Objects grid thumbnails a material on the same sphere**, through the preview pool a
particle system and a skin already use, and draws it live under the pointer.

**A skin's shell gains a Material pane.** It draws one material the skin draws with, picked by
clicking a submesh on the character or from the pane's own list, as the same tables the
material's own tab draws. Editing a material beside the character it dresses is the loop a
modder works in, so the skin is where it lives.

**A material's lists draw as tables.** A row per sampler, parameter, switch and macro, and a
column per field, each cell the leaf editor its row would draw.

**A skinned material draws on a shape bound to one bone.** Its shader takes the world transform
from the bones, so a plain mesh would collapse it to the origin.

**A pass that did not translate draws the error colour.** The stock fallback material is not
used in this view, since it would hide the failure the reader came to find.

**The preview and the inspector read the open document.** One query, `material-program`,
joins the reads a patch invalidates, so an edit reaches both before the file is saved. The skin's
`skin-programs` read joins the same list.

## Consequences

- **Positive:** a material is judged by its picture, and a shader that failed says why beside
  it.
- **Positive:** the shell is the one ADR-0036 describes, a pane set and a default tree, so the
  tree ops, the drag and the Panes menu are unchanged.
- **Negative:** `.ltk/editor.json` gains a fourth tree under `shells`, which an older build
  ignores, and a skin tree saved before the Material pane gains it behind the inspector on
  every read, so a reader who closes it sees it return on the next open.
- **Negative:** finding the skin that draws a material reads every skin of the file, which is
  one or two objects in a shipped skin bin and more in a project that gathers many.
- **Negative:** every committed edit reads the material again. The translation cache answers a
  repeated permutation and the shader defs are parsed once per version of the file, so the
  round trip is the read of the bin and the defs' bytes. A drag pays it once, on release, since
  the preview draws the held value itself until then.
- **Neutral:** the tables list every row the pass shader declares, with its default where the
  material writes none, so they read the program as well as the rows. Until it answers they list
  the material's entries alone.
