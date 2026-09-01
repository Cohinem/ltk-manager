# Issue 013-005: Rule: tex/block-alignment, block-unaligned texture size

**Spec**: `013-mod-defect-rules`  
**Labels**: `area: backend`, `ready-for-agent`, `priority: high`  
**Status**: Done  
**Blocked by**: `013-002`

## Context

A block-compressed texture stores 4×4 pixel blocks, so a width or height that is not a multiple of
four cannot be expressed by the format. The game crashes on one, and the crash is one the manager
already reads: the diagnostics code table carries `ALE-D0D00020`, "A texture could not be created",
as a confirmed row.

Measured against a live install: **436,150 textures across 360 archives, zero of them
non-aligned.** One specimen mod ships a 305×560 block-compressed texture.

This is the only rule in the spec whose consequence is a confirmed crash rather than a fidelity or
a silence problem, and the only one whose finding names a diagnostics code.

## Acceptance criteria

- Reports a block-compressed texture whose width or height is not a multiple of four.
- Asks the texture crate which formats are block-compressed rather than carrying a list.
- Reports nothing for an uncompressed format, where any dimension is valid.
- Severity is `Fatal`.
- The finding names `ALE-D0D00020`, so a user whose crash log carries that code can see they are
  the same event.
- Offers a fix where the texture's format can be re-encoded, and none where it cannot.

## The fix

Decode the texture, resample it down to the nearest multiple of four in each dimension, re-encode
to the format it already had, and write it back.

**Down, and resampled rather than cropped or padded.** Texture coordinates are normalised, so the
whole image has to keep spanning the whole surface or the art shifts against the mesh. Resampling
preserves that mapping. Rounding down rather than to nearest means the repair never manufactures
pixels the author did not draw. For the specimen this is 305×560 to 304×560, under one percent of
linear resolution.

**Only for formats the crate can encode.** It encodes three of the block formats and decodes more
than it encodes, so a texture in a format it cannot write is reported with no fix and the reason
said plainly. In practice that is the two-channel format normal maps use. The installed game ships
20 of those and none are non-aligned, and no mod has ever been seen with one, so this is a bound on
the fix rather than a gap in it. Adding that encoder upstream is separate work.

**Never convert between formats to make the fix possible.** The two-channel normal-map format
re-encoded as a colour format would change what the shader reads, which trades a crash for broken
lighting.

## Notes

**This repair loses fidelity, and that is a first.** A block-compressed texture cannot be edited in
place, so the fix decodes to pixels and re-encodes, which re-quantises every block rather than only
the ragged edge, and regenerates the mipmap chain with our filter rather than the author's. Every
other repair the manager ships changes only what it set out to change. See ADR-0011.
