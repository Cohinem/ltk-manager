# ADR-0041: A patch record's rows are addressed by its position

- **Status:** Accepted (2026-09-17)
- **Date:** 2026-09-17
- **Crates:** `ltk-manager-core`, `src-tauri`
- **Related:** [ADR-0027](0027-a-node-is-addressed-by-the-games-property-path.md), whose address
  this extends. EPIC #595. The drawing rules are "A patch bin's records" in
  `docs/ux/BIN_EDITOR.md`. League-toolkit `docs/design/ptch-property-patches.md` sections 4 and 5.

## Context and problem statement

A `PTCH` bin holds three lists: deleted object hashes, added objects, and property-patch records.
A record is an object hash, a property path written as text, and a value. The bin editor draws the
records grouped under the object each one targets, and a record's value expands like a property.

ADR-0027 addresses a row as an entry hash and a wire path inside that entry's object. A record's
value is not inside an object of the file. The object a record targets is declared in another
file, or among the objects the same patch adds.

Two records of one patch can carry the same object hash and the same path. The later record wins
in the client. A record path is text, and its casing is whatever the author wrote.

A frontend key is `entry:path`. An object row's key is `entry:` and every row of the object sits
under it. A patch can add an object and write records against the same hash.

A `PTCH` document takes no edit. The record list of an open document never changes order.

## Decision

**A target row is its entry hash and the path `#`.** It holds the records that target the hash, in
file order. The targets keep the order of each hash's first record.

**A record row is its entry hash and `#n`.** `n` is the record's position in the file's record
list, written in decimal with no leading zero. The record at `n` targets the entry, or the address
reaches nothing.

**A row inside a record's value continues with ADR-0027's wire segments.** `#n.<field>`, `#n[i]`
and `#n{key}` address what the value holds, every segment with its separator. The readable path
of such a row starts with the record's own path text: `Position.UIRect` then `.Size`.

**An object row's key holds no path that starts with `#`.** `entry:` and `entry:#` are two
subtrees of one hash.

## Consequences

- **Positive:** a record addresses uniquely where its path does not. Two records on one path draw
  as two rows.
- **Positive:** Copy path on a row under a record writes the object's path and the record's path
  joined on a colon, the pair the record carries. The address a person reads is the ADR-0027 form.
- **Positive:** a record that targets an object the same patch adds draws apart from that object's
  own rows.
- **Negative:** a position is stable only while the record list is. An edit that inserts or removes
  a record shifts every position after it, and needs its own address rule.
- **Negative:** a row under a record carries no declared kind at the record itself. The class of
  the targeted object is outside the file. A field inside an embed or a pointer the record writes
  reads its declared kind through that value's class.
- **Neutral:** `#` never starts an ADR-0027 wire path, which opens with a field's hex digits, so the
  two address forms share one parser without ambiguity.
