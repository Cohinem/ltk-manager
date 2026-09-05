# ADR-0027: A node is addressed by the game's property path

- **Status:** Accepted (2026-09-05)
- **Date:** 2026-09-05
- **Crates:** `ltk-manager-core`, `src-tauri`
- **Related:** [ADR-0026](0026-a-saved-bin-is-written-from-the-tree-the-backend-holds.md),
  whose rows and patches carry this address. The rule is stated in "Addressing a node" in
  `docs/ux/BIN_EDITOR.md`. A Problems finding carries the same pair as `NodeAddress`.

## Context and problem statement

The bin editor's frontend holds rows and asks the backend for the children of one node. A patch
names the node it changes. Both need an address for one node inside one bin. Two fit: a path of
our own, such as a list of child indices from the object down, or the game's property path
language, `Position.UIRect.Size`, `Elements[3]`, `Lookup{"weapon"}`. A `PTCH` record carries the
game's path. Riot's tools address a property with it. `ltk_meta::path::PropertyPath` reads it.

An index path is stable against nothing. A removed sibling shifts every index after it. A
hashtable sync changes what a row is called and not where it is. A path of names is what a user
reads and pastes. Nine names in ten resolve, and the tenth is a number.

## Decision

**The address is the object's path hash and the game's property path inside it.** A path begins
inside an object and never names it. The entry hash sits beside the path, the pair a patch record
carries.

The path is written in two forms, the forms a Problems finding writes:

- **On the wire, every field is its hash.** `.` between fields, `[i]` for an index, `{key}` for a
  map entry, each hash as eight lowercase hex digits. A row carries it, a children call takes it,
  and a hashtable sync cannot move it.
- **For a person, every field a table names is its name.** A field no table names is written as
  `0x` and eight hex digits, a form the game's syntax does not have. Every row's Copy path copies
  this form, joined to the object's path on a colon.

An `ObjectLink` is where a path ends. It names another entry and holds none. The address on the
far side starts at its own entry. An `Optional` is indexed as `[0]` and not descended. It is a
container of nothing or one thing.

## Consequences

- **Positive:** a path copied out of the viewer is a path a patch record carries, Riot's tools
  read and another modder reads. The ritobin text form shares the shape. No boundary translates
  it.
- **Positive:** the wire form is the form the Problems module writes into a finding. A finding's
  address is a viewer address, with no conversion between them.
- **Negative:** a readable path holding a `0x` segment is ours and not the format's. Every
  segment of a real path is hashed as text. `0x9c4e1b02` hashes as `FNV1a32("0x9c4e1b02")` and
  addresses nothing. Anything that writes a patch record refuses such a path and names the
  segment it refused.
- **Negative:** an element index is a position. The frontend refetches a container's children
  after any patch that changes its length and never carries an element address across such an
  edit.
- **Neutral:** casing is cosmetic. A segment is lowercased before it is hashed. The viewer writes
  the casing the tables give it and accepts the casing a user types.
