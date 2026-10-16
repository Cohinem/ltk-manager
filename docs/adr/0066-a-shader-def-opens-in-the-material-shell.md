# ADR-0066: A shader def opens in the material shell

- **Status:** Accepted (2026-10-16)
- **Date:** 2026-10-16
- **Crates:** `ltk-manager-game`, where `read_shader_program` reads a `CustomShaderDef` through a
  material that links it or with its own defaults
- **Related:** Extends [ADR-0047](0047-a-material-opens-into-a-shell-of-its-own.md). The rule is
  stated in "The material shell" in `docs/ux/BIN_EDITOR.md`. The plan is
  `docs/plans/shader-editor.md`.

## Context and problem statement

A `CustomShaderDef` declares the parameters, textures and switches that every material of its
shader overrides, with their defaults. It opened as a stack of generic rows with no preview, so a
change to a default was visible only through a material that inherits it.

The material shell already draws a translated program beside the fields that produce it. With
its own defaults, most defs draw black or not at all: on 2026-10-16, 232 of the 350 defs in the
installed `shaders.bin` translated, and in those 232 the default of 401 texture slots was
`assets/shared/materials/black.tex`. The other 118 select no permutation the shader cache holds,
since the cache holds only the permutations that shipped materials select, and most of them need a
static switch value that differs from the def's default.

## Decision

**`CustomShaderDef` declares `shell: "material"`.** The inspector holds Identity, then Params,
Textures and Switches as tables of the def's entries, then Feature defines as a tree. A row that
the drawn permutation does not read carries an info note.

**The preview draws the def through a material that links it.** The reference walk finds the
`StaticMaterialDef`s of the open project's layers and the install that link the def, and the
preview draws the first one with the open document as the shader defs, so an unsaved edit to the
def is drawn. The
reader picks another material, or the def's defaults alone. A def that no material links draws
its defaults.

**The preview takes defines that the def does not hold.** A pick sets a define the shader's TOCs
declare over the pass's define list, as `DefineSource::Preview`, and is never written to the def.

**A define list with no compiled permutation draws the nearest one.** A TOC holds each
permutation as a hash, so its define list is found by search: up to three changes to names that
the TOCs declare, with the studio defines, the engine defines and the reader's picks unchanged.
The corner lists every define that the search set and removed. The material preview does not search, because a material's
define list is what the game draws, and a miss there is a fault to report.

On the installed `shaders.bin`, the search draws 106 defs that the defaults do not select, so 339
of 350 draw. All 350 read in 1.9 s in a release build. The 11 that do not are TFT and UI shaders.

**The program read dispatches on the class.** `read_programs` reads an entry of class
`CustomShaderDef` through `resolve_shader_pass`, so the Objects grid and any other program read
draw a def with its defaults. The shell reads through `read_shader_program`, which takes the
material and the defines.

## Consequences

- **Positive:** a shader def is previewed through a shipped material, in a permutation that the
  game ships, and an edit to the def is drawn in the same preview.
- **Negative:** a nearest permutation draws defines that neither the def nor a material holds. The
  corner lists them, so the picture is never mistaken for the defaults.
- **Negative:** the first open of a def per session runs a reference walk of about 1.5 s before the
  preview draws. The walk supersedes a walk for a different question that the References document
  runs at the same time. With the object index off, the preview draws the defaults.
- **Neutral:** the def is edited where the game reads it, `data/shaders/shaders.bin`. A def in any
  other bin replaces the game's copy with one that has no programs, which the League diagnostics
  already report.
