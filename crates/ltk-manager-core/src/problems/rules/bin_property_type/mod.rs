//! `bin/property-type` - a property whose declared type the game has changed.
//!
//! A property bin holds typed values. A `String` is a length and its bytes. A
//! `File` is a `u64`, the XXH64 of the lowercased path, and it is how the game
//! addresses a WAD chunk without carrying the path. Riot changed several
//! hundred properties from the first to the second, and a mod that ships the
//! old type is a mod the game rejects. The value is not wrong. Its type is.
//!
//! For each object the rule looks up the class hash, and for each property it
//! holds it looks up the migration by field hash. Then it compares the
//! property's actual kind.
//!
//! | The property's kind | The rule                                         |
//! | ------------------- | ------------------------------------------------ |
//! | Matches `from`      | Raises a problem                                 |
//! | Matches `to`        | Raises nothing. The file is fixed already        |
//! | Matches neither     | Raises nothing, and the file keeps what it holds |
//! | Absent              | Raises nothing. A bin declares what it declares  |
//!
//! Those four rows are the whole safety argument. A run is idempotent, a fix
//! run can be offered twice without doubling anything, and a file that disagrees
//! with both schemas is a file the rule refuses to guess about.
//!
//! The walk descends into `Struct` and `Embedded` values, because those carry a
//! class hash of their own and two rows of the table key on one.

pub mod kinds;
pub mod table;

use std::borrow::Cow;
use std::collections::{HashMap, HashSet};

use indexmap::IndexMap;
use ltk_hash::{BinHash, Hash as _, WadHash};
use ltk_meta::PropertyValueEnum;
use ltk_meta::property::{Kind, NoMeta, values};

use crate::problems::names::{self, BinNames};
use crate::problems::{
    Applied, Detail, FixError, FixPreview, FixRun, GameBuild, NodeAddress, Problem, ProjectFiles,
    Report, Rule, RuleId, Severity, Site, TypeMismatch,
};
use crate::workshop::WorkshopFileKind;

use table::{Conversion, Migration, MigrationTable};

/// The id every row of this rule carries.
pub const ID: RuleId = RuleId("bin/property-type");

/// Repairs the properties Riot changed to `File`.
#[derive(Debug, Default)]
pub struct BinPropertyType;

impl BinPropertyType {
    #[must_use]
    pub fn new() -> Self {
        Self
    }
}

impl Rule for BinPropertyType {
    fn id(&self) -> RuleId {
        ID
    }

    fn title(&self) -> &'static str {
        "Meta property type mismatch"
    }

    fn description(&self) -> &'static str {
        "The type of a meta property in a bin file does not match what the game expects"
    }

    /// The oldest table this project's game has not reached, as a sentence.
    ///
    /// A table is a claim about one build. Until the game is on that build the
    /// change has not happened, so the findings are about work that is coming
    /// rather than a mod that is broken - which is what [`Severity::Warning`]
    /// already says of each of them, and what the panel mutes them for.
    fn dormant(&self, project: &ProjectFiles) -> Option<String> {
        let installed = project.build()?;
        let waiting = table::tables()
            .iter()
            .find(|table| table.build() > installed)?;

        Some(format!(
            "Riot changes these property types in game build {}, and the installed game is on {installed}. Repairing a mod before that build lands breaks it on the client you have.",
            waiting.build()
        ))
    }

    fn check(&self, project: &ProjectFiles, report: &mut Report) {
        let tables = table::tables();
        if tables.is_empty() {
            return;
        }
        let lens = Lens {
            tables,
            names: project.names(),
        };

        for (layer, file) in project
            .by_kind(WorkshopFileKind::PropertyBin)
            .chain(project.by_kind(WorkshopFileKind::PropertyBinOverride))
        {
            let site = Site::file(&layer.name, &file.path);
            let bin = match read_bin(&layer.absolute(file)) {
                Ok(bin) => bin,
                Err(e) => {
                    report.failure(ID, Some(site), e);
                    continue;
                }
            };

            for (entry, object) in &bin.objects {
                let mut found = Vec::new();
                walk(
                    object.class_hash,
                    &object.properties,
                    &Trail::default(),
                    lens,
                    &mut found,
                );

                for hit in found {
                    let severity = severity(project.build(), hit.table_build);
                    let fix = (!bin.is_override)
                        .then(|| preview(hit.migration, hit.value))
                        .flatten();
                    report.problem(
                        ID,
                        severity,
                        Site::node(
                            &layer.name,
                            &file.path,
                            NodeAddress {
                                entry: *entry,
                                label: hit.trail.label(),
                                path: hit.trail.hashes,
                            },
                        ),
                        Detail {
                            mismatch: Some(mismatch(hit.migration)),
                            message: note(
                                hit.migration,
                                hit.value,
                                project.build(),
                                hit.table_build,
                                &bin,
                            ),
                            fix,
                        },
                    );
                }
            }
        }
    }

    fn fix(&self, problems: &[&Problem], run: &mut FixRun) -> Result<Applied, FixError> {
        let tables = table::tables();
        /* A repair addresses a node by the hash form, which no table can move. */
        let nothing = BinNames::none();
        let lens = Lens {
            tables,
            names: &nothing,
        };
        let mut applied = Applied::default();

        for ((layer, path), wanted) in group_by_file(problems) {
            let bytes = run.read(&layer, &path)?;
            let mut bin = match read_bin_bytes(&bytes) {
                Ok(bin) => bin,
                Err(message) => {
                    return Err(FixError::Parse {
                        layer,
                        path,
                        message,
                    });
                }
            };

            // `Bin::to_writer` is `todo!()` for an override bin, so writing one
            // would panic rather than fail. The check raises these with no fix.
            if bin.is_override {
                let skipped = wanted.len() as u32;
                applied.skipped += skipped;
                run.skipped(&layer, &path, skipped);
                continue;
            }

            let mut file_applied = 0;
            for (entry, object) in &mut bin.objects {
                let addressed: HashSet<&str> = wanted
                    .iter()
                    .filter(|address| address.entry == *entry)
                    .map(|address| address.path.as_str())
                    .collect();
                if addressed.is_empty() {
                    continue;
                }
                file_applied += repair(
                    object.class_hash,
                    &mut object.properties,
                    &Trail::default(),
                    lens,
                    &addressed,
                );
            }

            let file_skipped = wanted.len() as u32 - file_applied;
            applied.applied += file_applied;
            applied.skipped += file_skipped;

            if file_applied == 0 {
                run.skipped(&layer, &path, file_skipped);
                continue;
            }

            let mut out = std::io::Cursor::new(Vec::with_capacity(bytes.len()));
            bin.to_writer(&mut out).map_err(|e| FixError::File {
                layer: layer.clone(),
                path: path.clone(),
                source: e,
            })?;
            run.write(&layer, &path, &out.into_inner(), file_applied, file_skipped)?;
        }

        Ok(applied)
    }
}

/// The path to one node, in the two forms a row and a repair each need.
///
/// `hashes` is what the file itself holds, and a repair matches on it, so it
/// never moves with the hash tables. `named` is the same path for reading.
#[derive(Clone, Default)]
struct Trail {
    hashes: String,
    named: String,
    /// Whether a table named anything `hashes` left as a number.
    resolved: bool,
}

impl Trail {
    /// The label a row draws, or `None` where it would repeat `hashes`.
    fn label(&self) -> Option<String> {
        self.resolved.then(|| self.named.clone())
    }

    fn extend(&self, hashes: &str, named: &str, joiner: &str) -> Self {
        let sep = if self.hashes.is_empty() { "" } else { joiner };
        Self {
            hashes: format!("{}{sep}{hashes}", self.hashes),
            named: format!("{}{sep}{named}", self.named),
            resolved: self.resolved || hashes != named,
        }
    }

    /// Step into a property.
    ///
    /// The hash form takes the migration table's own name where a row carries
    /// one, because that table ships in the build and so reads the same on
    /// every machine. Only the label consults the cache.
    fn property(&self, field: BinHash, row: Option<&Migration>, names: &BinNames) -> Self {
        let hashes = row
            .and_then(|migration| migration.field_name.as_deref())
            .map_or_else(|| names::hex(field), str::to_owned);
        let named = names
            .field(field)
            .map_or_else(|| hashes.clone(), Cow::into_owned);
        self.extend(&hashes, &named, ".")
    }

    /// Step into one element of a container or a present optional.
    fn index(&self, index: usize) -> Self {
        let segment = format!("[{index}]");
        Self {
            hashes: format!("{}{segment}", self.hashes),
            named: format!("{}{segment}", self.named),
            resolved: self.resolved,
        }
    }

    /// Step into one entry of a map, subscripted by its key.
    fn key(&self, key: &PropertyValueEnum, names: &BinNames) -> Self {
        let hashes = format!("{{{}}}", subscript(key));
        let named = format!("{{{}}}", subscript_named(key, names));
        Self {
            hashes: format!("{}{hashes}", self.hashes),
            named: format!("{}{named}", self.named),
            resolved: self.resolved || hashes != named,
        }
    }
}

/// What the walk reads a bin with: the tables it checks and the names it draws.
#[derive(Clone, Copy)]
struct Lens<'a> {
    tables: &'a [MigrationTable],
    names: &'a BinNames,
}

/// One property a table objects to, and the row that objects.
struct Hit<'a> {
    migration: &'a Migration,
    value: &'a PropertyValueEnum,
    /// Where inside the object it sits.
    trail: Trail,
    table_build: GameBuild,
}

/// What the tables say about one property, in one pass over them.
struct Lookup<'a> {
    /// The first row naming this property, which is where its name comes from.
    named: Option<&'a Migration>,
    /// The first row whose `from` the value actually matches.
    hit: Option<(GameBuild, &'a Migration)>,
}

impl<'a> Lookup<'a> {
    /// Ask every table about one property.
    ///
    /// One pass rather than two, because this runs for every property of every
    /// node and a 23MB project holds millions of them.
    fn of(
        tables: &'a [MigrationTable],
        class: BinHash,
        field: BinHash,
        value: &PropertyValueEnum,
    ) -> Self {
        let mut found = Self {
            named: None,
            hit: None,
        };
        for table in tables {
            let Some(migration) = table.migration(class, field) else {
                continue;
            };
            if found.named.is_none() {
                found.named = Some(migration);
            }
            if found.hit.is_none() && migration.from.matches(value) {
                found.hit = Some((table.build(), migration));
            }
        }
        found
    }

    /// Whether any table said anything at all.
    fn is_silent(&self) -> bool {
        self.named.is_none()
    }
}

/// Whether this value can hold an object-like node worth descending into.
///
/// Most properties are leaves no table names, and skipping them here is what
/// keeps a run from building a path string for every value in the project.
fn descends(value: &PropertyValueEnum) -> bool {
    match value {
        PropertyValueEnum::Struct(_) | PropertyValueEnum::Embedded(_) => true,
        PropertyValueEnum::Container(items) => !items.item_kind().is_primitive(),
        PropertyValueEnum::UnorderedContainer(items) => !items.0.item_kind().is_primitive(),
        PropertyValueEnum::Optional(inner) => !inner.item_kind().is_primitive(),
        PropertyValueEnum::Map(map) => !map.value_kind().is_primitive(),
        _ => false,
    }
}

/// Find every property of one object-like node a table objects to.
///
/// Recurses into `Struct` and `Embedded` values, and through the containers and
/// maps that hold them, because each carries a class hash a row can key on.
fn walk<'a>(
    class: BinHash,
    properties: &'a IndexMap<BinHash, PropertyValueEnum>,
    trail: &Trail,
    lens: Lens<'a>,
    found: &mut Vec<Hit<'a>>,
) {
    for (field, value) in properties {
        let lookup = Lookup::of(lens.tables, class, *field, value);
        let descend_into = descends(value);
        if lookup.is_silent() && !descend_into {
            continue;
        }

        let here = trail.property(*field, lookup.named, lens.names);

        if let Some((table_build, migration)) = lookup.hit {
            found.push(Hit {
                migration,
                value,
                trail: here.clone(),
                table_build,
            });
        }

        if descend_into {
            descend(value, &here, lens, found);
        }
    }
}

/// Walk into whatever object-like nodes `value` holds.
fn descend<'a>(
    value: &'a PropertyValueEnum,
    trail: &Trail,
    lens: Lens<'a>,
    found: &mut Vec<Hit<'a>>,
) {
    match value {
        PropertyValueEnum::Struct(inner) => {
            walk(inner.class_hash, &inner.properties, trail, lens, found);
        }
        PropertyValueEnum::Embedded(inner) => {
            walk(inner.0.class_hash, &inner.0.properties, trail, lens, found);
        }
        PropertyValueEnum::Container(items) => descend_container(items, trail, lens, found),
        PropertyValueEnum::UnorderedContainer(items) => {
            descend_container(&items.0, trail, lens, found);
        }
        /* An `Optional` is indexed rather than descended: BIN_EDITOR.md. */
        PropertyValueEnum::Optional(inner) => match inner {
            values::Optional::Struct {
                value: Some(held), ..
            } => walk(
                held.class_hash,
                &held.properties,
                &trail.index(0),
                lens,
                found,
            ),
            values::Optional::Embedded {
                value: Some(held), ..
            } => walk(
                held.0.class_hash,
                &held.0.properties,
                &trail.index(0),
                lens,
                found,
            ),
            _ => {}
        },
        PropertyValueEnum::Map(map) => {
            for (key, held) in map.entries() {
                descend(held, &trail.key(key, lens.names), lens, found);
            }
        }
        _ => {}
    }
}

fn descend_container<'a>(
    items: &'a values::Container,
    trail: &Trail,
    lens: Lens<'a>,
    found: &mut Vec<Hit<'a>>,
) {
    match items {
        values::Container::Struct { items, .. } => {
            for (index, inner) in items.iter().enumerate() {
                walk(
                    inner.class_hash,
                    &inner.properties,
                    &trail.index(index),
                    lens,
                    found,
                );
            }
        }
        values::Container::Embedded { items, .. } => {
            for (index, inner) in items.iter().enumerate() {
                walk(
                    inner.0.class_hash,
                    &inner.0.properties,
                    &trail.index(index),
                    lens,
                    found,
                );
            }
        }
        _ => {}
    }
}

/// Convert every addressed property of one object-like node, and count them.
///
/// Re-derives each change from the value in front of it rather than from what
/// the check recorded, so a property that no longer matches `from` is left
/// alone and counted as skipped.
///
/// It walks with the same [`Trail`] the check used, under a [`BinNames`] that
/// names nothing - only the hash form is compared, and building it through one
/// shared step is what keeps the two passes addressing the same node.
fn repair(
    class: BinHash,
    properties: &mut IndexMap<BinHash, PropertyValueEnum>,
    trail: &Trail,
    lens: Lens<'_>,
    addressed: &HashSet<&str>,
) -> u32 {
    let mut applied = 0;

    for (field, value) in properties.iter_mut() {
        let lookup = Lookup::of(lens.tables, class, *field, value);
        let descend_into = descends(value);
        if lookup.is_silent() && !descend_into {
            continue;
        }

        let here = trail.property(*field, lookup.named, lens.names);

        if addressed.contains(here.hashes.as_str())
            && let Some((_, migration)) = lookup.hit
            && convert(value, migration)
        {
            applied += 1;
        }

        if descend_into {
            applied += repair_into(value, &here, lens, addressed);
        }
    }

    applied
}

/// Walk `repair` into whatever object-like nodes `value` holds.
fn repair_into(
    value: &mut PropertyValueEnum,
    trail: &Trail,
    lens: Lens<'_>,
    addressed: &HashSet<&str>,
) -> u32 {
    match value {
        PropertyValueEnum::Struct(inner) => repair(
            inner.class_hash,
            &mut inner.properties,
            trail,
            lens,
            addressed,
        ),
        PropertyValueEnum::Embedded(inner) => repair(
            inner.0.class_hash,
            &mut inner.0.properties,
            trail,
            lens,
            addressed,
        ),
        PropertyValueEnum::Container(items) => repair_container(items, trail, lens, addressed),
        PropertyValueEnum::UnorderedContainer(items) => {
            repair_container(&mut items.0, trail, lens, addressed)
        }
        PropertyValueEnum::Optional(inner) => match inner {
            values::Optional::Struct {
                value: Some(held), ..
            } => repair(
                held.class_hash,
                &mut held.properties,
                &trail.index(0),
                lens,
                addressed,
            ),
            values::Optional::Embedded {
                value: Some(held), ..
            } => repair(
                held.0.class_hash,
                &mut held.0.properties,
                &trail.index(0),
                lens,
                addressed,
            ),
            _ => 0,
        },
        PropertyValueEnum::Map(map) => repair_map(map, trail, lens, addressed),
        _ => 0,
    }
}

/// Walk `repair` into a map's values.
///
/// `Map` hands out its entries by value or by shared reference and never by
/// mutable one, so reaching inside means taking the entries and putting them
/// back. Only a map whose values are not primitive gets here, and repairing a
/// property inside one never changes that value's own kind, so the rebuild
/// cannot be rejected.
fn repair_map(
    map: &mut values::Map,
    trail: &Trail,
    lens: Lens<'_>,
    addressed: &HashSet<&str>,
) -> u32 {
    let key_kind = map.key_kind();
    let value_kind = map.value_kind();

    let mut entries =
        std::mem::replace(map, values::Map::empty(key_kind, value_kind)).into_entries();
    let mut applied = 0;
    for (key, held) in entries.iter_mut() {
        applied += repair_into(held, &trail.key(key, lens.names), lens, addressed);
    }

    *map = values::Map::new(key_kind, value_kind, entries)
        .expect("repairing a property inside a map value never changes that value's kind");
    applied
}

/// Walk `repair` into the object-like items a container holds.
fn repair_container(
    items: &mut values::Container,
    trail: &Trail,
    lens: Lens<'_>,
    addressed: &HashSet<&str>,
) -> u32 {
    let mut applied = 0;
    match items {
        values::Container::Struct { items, .. } => {
            for (index, inner) in items.iter_mut().enumerate() {
                applied += repair(
                    inner.class_hash,
                    &mut inner.properties,
                    &trail.index(index),
                    lens,
                    addressed,
                );
            }
        }
        values::Container::Embedded { items, .. } => {
            for (index, inner) in items.iter_mut().enumerate() {
                applied += repair(
                    inner.0.class_hash,
                    &mut inner.0.properties,
                    &trail.index(index),
                    lens,
                    addressed,
                );
            }
        }
        _ => {}
    }
    applied
}

/// Rewrite one property under its new type. Reports whether it changed.
fn convert(value: &mut PropertyValueEnum, migration: &Migration) -> bool {
    match migration.conversion {
        Conversion::HashValue => hash_value(value),
        Conversion::None => retag(value, migration),
        /* A `Hash` is FNV1a32 of a path and a `File` is XXH64 of the same path,
        and there is no arithmetic between them. Naming the hash needs the
        mimir `binhashes` table, which nothing opens yet. */
        Conversion::Rehash | Conversion::HashKey => false,
    }
}

/// Turn every `String` under this property into the `File` of the same path.
///
/// Takes the value out first and puts one back, because a container is an enum
/// over its item type: converting is a construction and not a mutation, and the
/// old value has to be owned to be consumed.
fn hash_value(value: &mut PropertyValueEnum) -> bool {
    let taken = std::mem::replace(value, Kind::None.default_value());
    match hashed(taken) {
        Ok(converted) => {
            *value = converted;
            true
        }
        Err(unchanged) => {
            *value = unchanged;
            false
        }
    }
}

/// The value under its new type, or the value back where it does not apply.
fn hashed(value: PropertyValueEnum) -> Result<PropertyValueEnum, PropertyValueEnum> {
    match value {
        PropertyValueEnum::String(text) => Ok(link(&text.value).into()),
        PropertyValueEnum::Container(items) => {
            hashed_container(items).map(Into::into).map_err(Into::into)
        }
        PropertyValueEnum::UnorderedContainer(items) => match hashed_container(items.0) {
            Ok(items) => Ok(values::UnorderedContainer(items).into()),
            Err(items) => Err(values::UnorderedContainer(items).into()),
        },
        PropertyValueEnum::Optional(values::Optional::String { value: text, meta }) => {
            Ok(values::Optional::WadChunkLink {
                value: text.map(|text| link(&text.value)),
                meta,
            }
            .into())
        }
        PropertyValueEnum::Map(map) => {
            let key_kind = map.key_kind();
            if map.value_kind() != Kind::String {
                return Err(map.into());
            }
            let mut rebuilt = values::Map::empty(key_kind, Kind::WadChunkLink);
            for (key, item) in map.into_entries() {
                let PropertyValueEnum::String(text) = item else {
                    /* `value_kind` already said String, so this cannot happen
                    unless the file disagrees with its own header. */
                    return Err(Kind::None.default_value());
                };
                if rebuilt.push(key, link(&text.value).into()).is_err() {
                    return Err(Kind::None.default_value());
                }
            }
            Ok(rebuilt.into())
        }
        other => Err(other),
    }
}

/// Rebuild a container of `String` as a container of `File`.
fn hashed_container(items: values::Container) -> Result<values::Container, values::Container> {
    let values::Container::String { items: texts, meta } = items else {
        return Err(items);
    };
    Ok(values::Container::WadChunkLink {
        items: texts.iter().map(|text| link(&text.value)).collect(),
        meta,
    })
}

/// Change a type tag or an embedded class hash, moving no value.
///
/// `Embedded` is a newtype over `Struct` in `ltk_meta` with the same encoding,
/// so `Embed → Pointer` is a tag. The other row renames the class of each
/// element of an `UnorderedContainer`.
fn retag(value: &mut PropertyValueEnum, migration: &Migration) -> bool {
    match (migration.from.kind, migration.to.kind) {
        (Kind::Embedded, Kind::Struct) => {
            let taken = std::mem::replace(value, Kind::None.default_value());
            let PropertyValueEnum::Embedded(inner) = taken else {
                *value = taken;
                return false;
            };
            *value = PropertyValueEnum::Struct(inner.0);
            true
        }
        (Kind::Struct, Kind::Embedded) => {
            let taken = std::mem::replace(value, Kind::None.default_value());
            let PropertyValueEnum::Struct(inner) = taken else {
                *value = taken;
                return false;
            };
            *value = values::Embedded(inner).into();
            true
        }
        _ => match migration.to.class {
            Some(class) => reclass(value, class),
            None => false,
        },
    }
}

/// Point every element of a container at a renamed class.
fn reclass(value: &mut PropertyValueEnum, class: BinHash) -> bool {
    let items = match value {
        PropertyValueEnum::Container(items) => items,
        PropertyValueEnum::UnorderedContainer(items) => &mut items.0,
        _ => return false,
    };
    match items {
        values::Container::Embedded { items, .. } => {
            for inner in items.iter_mut() {
                inner.0.class_hash = class;
            }
            true
        }
        values::Container::Struct { items, .. } => {
            for inner in items.iter_mut() {
                inner.class_hash = class;
            }
            true
        }
        _ => false,
    }
}

/// The `File` of a path, which is XXH64 of it lowercased.
fn link(path: &str) -> values::WadChunkLink<NoMeta> {
    values::WadChunkLink::new(WadHash::hash_str(path))
}

/// A map key, as a subscript reads, in the form the file holds.
fn subscript(key: &PropertyValueEnum) -> String {
    match key {
        PropertyValueEnum::String(text) => text.value.clone(),
        PropertyValueEnum::Hash(hash) => names::hex(hash.value),
        PropertyValueEnum::WadChunkLink(hash) => format!("0x{:016x}", hash.value.0),
        PropertyValueEnum::U8(v) => v.value.to_string(),
        PropertyValueEnum::U32(v) => v.value.to_string(),
        PropertyValueEnum::I32(v) => v.value.to_string(),
        other => format!("{:?}", other.kind()),
    }
}

/// The same subscript for reading, with a `Hash` key named where one is known.
///
/// A map key is usually the only thing telling two rows of a big animation
/// graph apart, so naming it is what makes the list readable at all.
fn subscript_named(key: &PropertyValueEnum, names: &BinNames) -> String {
    match key {
        PropertyValueEnum::Hash(hash) => names
            .value(hash.value)
            .map_or_else(|| names::hex(hash.value), Cow::into_owned),
        other => subscript(other),
    }
}

/// How much this costs the mod, which is a question about the installed game.
///
/// A property the running game reads under the other type crashes it, so on an
/// install that has taken the change this is [`Severity::Fatal`]. A fix applied
/// early breaks the mod the same way round, so an install that has not taken it
/// is a warning about what is coming rather than a crash today.
fn severity(installed: Option<GameBuild>, table: GameBuild) -> Severity {
    match installed {
        Some(installed) if installed >= table => Severity::Fatal,
        /* An install older than the table has not taken the change yet, and an
        install we could not read is not a claim either way. */
        _ => Severity::Warning,
    }
}

/// The type the game reads here, against the one the file declares.
fn mismatch(migration: &Migration) -> TypeMismatch {
    TypeMismatch {
        expected: migration.to.label(),
        found: migration.from.label(),
    }
}

/// What this one property needs said that the rule's description does not.
///
/// The ordinary retype is the whole of what this rule is for, so it says
/// nothing: a sentence repeated on seven thousand rows is noise, and the title
/// and the two types already carry it. What earns a note is a row that is
/// unusual - one nothing can repair, or one the installed game disagrees with.
fn note(
    migration: &Migration,
    value: &PropertyValueEnum,
    installed: Option<GameBuild>,
    table: GameBuild,
    bin: &ltk_meta::Bin,
) -> Option<String> {
    let mut parts = Vec::new();

    /* The sentence prints the hash the file holds, because that hash is the
    whole of what a person needs to go and find the path themselves. */
    match migration.conversion {
        Conversion::Rehash => parts.push(format!(
            "The game reads a chunk hash here and the file holds a name hash. Both hash the same path under a different function, so only the path itself crosses between them, and {} is all the file carries. There is no repair.",
            unnamed(value)
        )),
        Conversion::HashKey => parts.push(format!(
            "The game keys this map by chunk hash now and the file keys it by name hash. Both hash the same path under a different function, so only the path itself crosses between them, and {} is all the file carries. There is no repair.",
            unnamed(value)
        )),
        Conversion::HashValue | Conversion::None => {}
    }

    if bin.is_override {
        parts.push("An override bin cannot be repaired here.".to_owned());
    } else if installed.is_some_and(|installed| installed < table) {
        parts.push("The installed game still wants the old type.".to_owned());
    }

    (!parts.is_empty()).then(|| parts.join(" "))
}

/// The hash a repair would have to name, as a row prints it.
///
/// A `rehash` row holds one, and a `hash_key` row holds one for each entry, so
/// a map names the first and says how many followed.
fn unnamed(value: &PropertyValueEnum) -> String {
    match value {
        PropertyValueEnum::Hash(hash) => names::hex(hash.value),
        PropertyValueEnum::Map(map) => match map.entries() {
            [] => "its keys".to_owned(),
            [(key, _)] => subscript(key),
            [(key, _), rest @ ..] => format!("{} and {} more", subscript(key), rest.len()),
        },
        other => format!("this {}", word_of(other)),
    }
}

/// A value's kind, in the table's vocabulary where it has one.
fn word_of(value: &PropertyValueEnum) -> String {
    kinds::name(value.kind()).map_or_else(|| format!("{:?}", value.kind()), str::to_owned)
}

/// What a repair would change, for a problem that has one.
fn preview(migration: &Migration, value: &PropertyValueEnum) -> Option<FixPreview> {
    match migration.conversion {
        Conversion::Rehash | Conversion::HashKey => None,
        /* Nothing to draw beside the annotation: the type is the whole change. */
        Conversion::None => Some(FixPreview::default()),
        Conversion::HashValue => Some(value_preview(value)),
    }
}

/// The value a panel draws for one property, and what drawing it leaves out.
///
/// A container holds its paths rather than one, and a count of them says
/// nothing about what is in the file - which is the whole of what a reader
/// opened the problem to see. So one path is drawn as the example and the rest
/// becomes the note beside it.
fn value_preview(value: &PropertyValueEnum) -> FixPreview {
    if let PropertyValueEnum::String(text) = value {
        return FixPreview::value(
            quoted(&text.value),
            format!("0x{:016x}", WadHash::hash_str(&text.value).0),
        );
    }

    let held = strings(value);
    let Some(first) = held.first() else {
        /* Structs and embedded objects have no path to draw, so a count is all
        there is to say about them. */
        return FixPreview::note(items(count(value)));
    };

    FixPreview::sample(
        quoted(first),
        (held.len() > 1).then(|| more(held.len() - 1)),
    )
}

/// A path as a row reads it, quoted and escaped the way the file holds it.
fn quoted(path: &str) -> String {
    format!("{path:?}")
}

/// How many values a property holds past the one drawn.
fn more(rest: usize) -> String {
    match rest {
        1 => "and 1 more".to_owned(),
        many => format!("and {many} more"),
    }
}

/// Every path a property holds, in the order the file holds them.
///
/// Empty for a property whose values are not paths at all, such as a container
/// of structs, which a count describes and a sample cannot.
fn strings(value: &PropertyValueEnum) -> Vec<&str> {
    match value {
        PropertyValueEnum::String(text) => vec![text.value.as_str()],
        PropertyValueEnum::Container(items) => container_strings(items),
        PropertyValueEnum::UnorderedContainer(items) => container_strings(&items.0),
        PropertyValueEnum::Optional(values::Optional::String { value: text, .. }) => {
            text.iter().map(|text| text.value.as_str()).collect()
        }
        PropertyValueEnum::Map(map) => map
            .entries()
            .iter()
            .filter_map(|(_, held)| match held {
                PropertyValueEnum::String(text) => Some(text.value.as_str()),
                _ => None,
            })
            .collect(),
        _ => Vec::new(),
    }
}

fn container_strings(items: &values::Container) -> Vec<&str> {
    match items {
        values::Container::String { items, .. } => {
            items.iter().map(|text| text.value.as_str()).collect()
        }
        _ => Vec::new(),
    }
}

/// How many values a repair rewrites, as a row says it.
fn items(count: usize) -> String {
    match count {
        1 => "1 item".to_owned(),
        many => format!("{many} items"),
    }
}

/// How many values a repair would rewrite under one property.
fn count(value: &PropertyValueEnum) -> usize {
    match value {
        PropertyValueEnum::Container(items) => container_len(items),
        PropertyValueEnum::UnorderedContainer(items) => container_len(&items.0),
        PropertyValueEnum::Map(map) => map.entries().len(),
        PropertyValueEnum::Optional(values::Optional::String { value: text, .. }) => {
            usize::from(text.is_some())
        }
        _ => 1,
    }
}

fn container_len(items: &values::Container) -> usize {
    match items {
        values::Container::String { items, .. } => items.len(),
        values::Container::WadChunkLink { items, .. } => items.len(),
        values::Container::Hash { items, .. } => items.len(),
        values::Container::Struct { items, .. } => items.len(),
        values::Container::Embedded { items, .. } => items.len(),
        _ => 0,
    }
}

/// The problems of one fix, grouped so each file is read and written once.
///
/// 312 problems in 14 files is 14 reads and 14 writes, and never 312 of either.
fn group_by_file<'a>(problems: &[&'a Problem]) -> Vec<((String, String), Vec<&'a NodeAddress>)> {
    let mut grouped: HashMap<(String, String), Vec<&NodeAddress>> = HashMap::new();
    for problem in problems {
        let Some(node) = &problem.site.node else {
            continue;
        };
        grouped
            .entry((problem.site.layer.clone(), problem.site.path.clone()))
            .or_default()
            .push(node);
    }

    let mut grouped: Vec<_> = grouped.into_iter().collect();
    grouped.sort_by(|(a, _), (b, _)| a.cmp(b));
    grouped
}

/// Read one property bin off disk.
///
/// # Errors
///
/// Reports the file it could not open or parse, as one sentence for the panel.
fn read_bin(path: &std::path::Path) -> Result<ltk_meta::Bin, String> {
    let bytes = std::fs::read(path).map_err(|e| e.to_string())?;
    read_bin_bytes(&bytes)
}

fn read_bin_bytes(bytes: &[u8]) -> Result<ltk_meta::Bin, String> {
    ltk_meta::Bin::from_reader(&mut std::io::Cursor::new(bytes)).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::Config;
    use ltk_meta::{Bin, BinObject};

    /// `SkinCharacterDataProperties`, which 225 of 232 real project bins declare.
    const SKIN: BinHash = BinHash(0x9b67_e9f6);
    /// The object the fixtures hang their properties on.
    const ENTRY: BinHash = BinHash(0x1234_5678);

    /* The four `hash_value` shapes, all on the one class that matters. */
    const ICON_AVATAR: BinHash = BinHash(0x089a_ff69);
    const ALTERNATE_ICONS_CIRCLE: BinHash = BinHash(0x3c84_e8f5);
    const ICON_CIRCLE: BinHash = BinHash(0xe672_84f4);
    const UNCENSORED_ICON_CIRCLES: BinHash = BinHash(0x8ce0_4c3d);

    const ICON: &str = "ASSETS/Characters/Smolder/HUD/Smolder_Circle.dds";

    fn text(value: &str) -> values::String {
        values::String::new(value.to_owned())
    }

    fn bytes_of(bin: &Bin) -> Vec<u8> {
        let mut out = std::io::Cursor::new(Vec::new());
        bin.to_writer(&mut out).unwrap();
        out.into_inner()
    }

    fn bin_with(field: BinHash, value: impl Into<PropertyValueEnum>) -> Bin {
        Bin::new(
            [BinObject::<NoMeta>::builder(ENTRY, SKIN)
                .property(field, value)
                .build()],
            std::iter::empty::<&str>(),
        )
    }

    /// A project holding one `.bin` at `content/base/data/skin0.bin`.
    fn project(bin: &Bin) -> (tempfile::TempDir, ProjectFiles) {
        project_on(bin, None)
    }

    /// The same project, beside a game install on `installed`.
    ///
    /// The install sits under the project's own temp directory rather than
    /// inside it, so the walk that reads `content/` never sees it.
    fn project_on(bin: &Bin, installed: Option<GameBuild>) -> (tempfile::TempDir, ProjectFiles) {
        let tmp = tempfile::tempdir().unwrap();
        let dir = tmp.path().join("content").join("base").join("data");
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("skin0.bin"), bytes_of(bin)).unwrap();

        let mut config = Config::default();
        if let Some(build) = installed {
            let league = tmp.path().join("league");
            std::fs::create_dir_all(league.join("Game")).unwrap();
            std::fs::write(
                league.join("Game").join("content-metadata.json"),
                format!(r#"{{ "version": "{build}" }}"#),
            )
            .unwrap();
            config.league_path = Some(league);
        }

        let files = ProjectFiles::read(tmp.path(), &config).unwrap();
        (tmp, files)
    }

    fn found(bin: &Bin) -> Vec<Problem> {
        let (_tmp, files) = project(bin);
        check_with(&files)
    }

    fn check_with(files: &ProjectFiles) -> Vec<Problem> {
        let mut report = Report::default();
        BinPropertyType::new().check(files, &mut report);
        let (problems, failed) = report.finish();
        assert!(failed.is_empty(), "the fixture should read cleanly");
        problems
    }

    // ---- the four match cases --------------------------------------------

    #[test]
    fn a_property_that_matches_from_raises_one_problem() {
        let problems = found(&bin_with(ICON_AVATAR, text(ICON)));

        assert_eq!(problems.len(), 1);
        let problem = &problems[0];
        assert_eq!(problem.rule, ID);
        assert_eq!(problem.site.layer, "base");
        assert_eq!(problem.site.path, "data/skin0.bin");
        let node = problem.site.node.as_ref().unwrap();
        assert_eq!(node.entry, ENTRY);
        assert_eq!(node.path, "iconAvatar", "the table names this field");
    }

    /// A file already carrying the new type is a file the run must stay quiet
    /// about, or a fix run offered twice would double up.
    #[test]
    fn a_property_that_matches_to_raises_nothing() {
        let problems = found(&bin_with(
            ICON_AVATAR,
            values::WadChunkLink::new(WadHash::hash_str(ICON)),
        ));
        assert!(problems.is_empty());
    }

    #[test]
    fn a_property_that_matches_neither_raises_nothing() {
        let problems = found(&bin_with(ICON_AVATAR, values::I32::new(42)));
        assert!(problems.is_empty());
    }

    #[test]
    fn a_property_the_object_does_not_declare_raises_nothing() {
        let problems = found(&bin_with(BinHash(0xdead_beef), text(ICON)));
        assert!(problems.is_empty());
    }

    #[test]
    fn a_class_the_table_does_not_name_raises_nothing() {
        let bin = Bin::new(
            [BinObject::<NoMeta>::builder(ENTRY, BinHash(0x0bad_0bad))
                .property(ICON_AVATAR, text(ICON))
                .build()],
            std::iter::empty::<&str>(),
        );
        assert!(found(&bin).is_empty());
    }

    // ---- the preview ------------------------------------------------------

    #[test]
    fn a_leaf_preview_draws_the_value_and_the_hash_it_becomes() {
        let problems = found(&bin_with(ICON_AVATAR, text(ICON)));
        let fix = problems[0].fix.as_ref().unwrap();

        assert_eq!(
            problems[0].mismatch,
            Some(TypeMismatch {
                expected: "File".to_owned(),
                found: "String".to_owned(),
            })
        );
        assert_eq!(fix.note, None, "the values say it, so a note would repeat");
        assert_eq!(
            fix.before.as_deref(),
            Some("\"ASSETS/Characters/Smolder/HUD/Smolder_Circle.dds\"")
        );
        assert_eq!(
            fix.after.as_deref(),
            Some(format!("0x{:016x}", WadHash::hash_str(ICON).0).as_str())
        );
    }

    /// The rule's title and the two types carry the ordinary retype between
    /// them, so a note on top of that is a sentence on every row of the run.
    #[test]
    fn the_ordinary_retype_says_nothing_the_rule_has_not_already_said() {
        let problems = found(&bin_with(ICON_AVATAR, text(ICON)));
        assert_eq!(problems[0].message, None);
    }

    /// Each conversion is a different problem, and a reader needs the
    /// difference: `rehash` says why nothing can repair it.
    #[test]
    fn an_unrepairable_conversion_notes_that_no_repair_exists() {
        let vfx = BinHash::hash_str("VfxAssetRemap");
        let old_asset = BinHash::hash_str("oldAsset");
        let migration = table::tables()
            .iter()
            .find_map(|table| table.migration(vfx, old_asset))
            .expect("VfxAssetRemap:oldAsset is a rehash row");

        let value: PropertyValueEnum = values::Hash::new(BinHash(0x5ae4_1520)).into();
        let table_build = GameBuild::new(16, 17, 8_087_655);
        let bin = Bin::new([] as [BinObject<NoMeta>; 0], std::iter::empty::<&str>());
        let text = note(migration, &value, None, table_build, &bin).expect("a rehash speaks up");

        assert!(text.contains("0x5ae41520"), "{text}");
        assert!(text.contains("There is no repair."), "{text}");
    }

    /// A list of two hundred paths is not a thing a row reads, so a container
    /// draws one of them and how many more it holds. A count on its own says
    /// nothing about what is in the file, which is what a reader came for.
    #[test]
    fn a_container_preview_draws_one_path_and_the_count_of_the_rest() {
        let items = values::Container::String {
            items: vec![text("a.dds"), text("b.dds"), text("c.dds")],
            meta: NoMeta,
        };
        let problems = found(&bin_with(ALTERNATE_ICONS_CIRCLE, items));

        let fix = problems[0].fix.as_ref().unwrap();
        assert_eq!(
            problems[0].mismatch,
            Some(TypeMismatch {
                expected: "List<File>".to_owned(),
                found: "List<String>".to_owned(),
            })
        );
        assert_eq!(fix.before.as_deref(), Some("\"a.dds\""));
        assert_eq!(fix.note.as_deref(), Some("and 2 more"));
        assert!(
            fix.after.is_none(),
            "a repaired hash is not what a row draws"
        );
    }

    /// The case that read `1 item` and said nothing: a container of one path
    /// draws the path, and has nothing left to count.
    #[test]
    fn a_container_of_one_path_draws_the_path_alone() {
        let items = values::Container::String {
            items: vec![text("ASSETS/Characters/Smolder/HUD/Smolder_Circle.dds")],
            meta: NoMeta,
        };
        let problems = found(&bin_with(ALTERNATE_ICONS_CIRCLE, items));

        let fix = problems[0].fix.as_ref().unwrap();
        assert_eq!(
            fix.before.as_deref(),
            Some("\"ASSETS/Characters/Smolder/HUD/Smolder_Circle.dds\"")
        );
        assert_eq!(fix.note, None);
    }

    // ---- severity ---------------------------------------------------------

    #[test]
    fn severity_is_fatal_once_the_install_has_taken_the_change() {
        let table = GameBuild::new(16, 17, 8_087_655);
        assert_eq!(severity(Some(table), table), Severity::Fatal);
        assert_eq!(
            severity(Some(GameBuild::new(16, 18, 1)), table),
            Severity::Fatal
        );
    }

    /// A fix applied early breaks the mod on the client the user has, so an
    /// older install reads as a warning rather than an error.
    #[test]
    fn severity_is_warning_on_an_older_or_unknown_install() {
        let table = GameBuild::new(16, 17, 8_087_655);
        assert_eq!(
            severity(Some(GameBuild::new(16, 16, 8_049_184)), table),
            Severity::Warning
        );
        assert_eq!(severity(None, table), Severity::Warning);
    }

    // ---- dormancy ---------------------------------------------------------

    /// The build the one shipped table is a claim about.
    const TABLE: GameBuild = GameBuild::new(16, 17, 8_087_655);
    /// A live build from before Riot deployed that change.
    const BEFORE_TABLE: GameBuild = GameBuild::new(16, 16, 8_049_184);

    /// A change Riot has not deployed is a change no mod is wrong about yet,
    /// so the rule says which build it is waiting on.
    #[test]
    fn an_install_older_than_the_table_names_the_build_it_waits_for() {
        let (_tmp, files) = project_on(&bin_with(ICON_AVATAR, text(ICON)), Some(BEFORE_TABLE));

        let reason = BinPropertyType::new()
            .dormant(&files)
            .expect("a build before the table's leaves the rule dormant");
        assert!(reason.contains("16.17.8087655"), "{reason}");
        assert!(reason.contains("16.16.8049184"), "{reason}");
    }

    /// A modder wants to see what is coming, so waiting mutes the findings in
    /// the panel rather than withholding them. The severity is what says the
    /// game has not taken the change, and the fix is never withheld.
    #[test]
    fn a_waiting_rule_still_finds_everything_at_warning() {
        let (_tmp, files) = project_on(&bin_with(ICON_AVATAR, text(ICON)), Some(BEFORE_TABLE));

        let problems = check_with(&files);
        assert_eq!(problems.len(), 1);
        assert_eq!(problems[0].severity, Severity::Warning);
        assert!(problems[0].fix.is_some());
    }

    /// The row that earns a message: this one is not the ordinary retype, it
    /// is a retype the reader own game disagrees with.
    #[test]
    fn a_waiting_finding_names_the_installed_game() {
        let (_tmp, files) = project_on(&bin_with(ICON_AVATAR, text(ICON)), Some(BEFORE_TABLE));

        let problems = check_with(&files);
        assert_eq!(
            problems[0].message.as_deref(),
            Some("The installed game still wants the old type.")
        );
    }

    #[test]
    fn an_install_that_has_taken_the_change_leaves_the_rule_active() {
        let (_tmp, files) = project_on(&bin_with(ICON_AVATAR, text(ICON)), Some(TABLE));

        assert_eq!(BinPropertyType::new().dormant(&files), None);
        let problems = check_with(&files);
        assert_eq!(problems.len(), 1);
        assert_eq!(problems[0].severity, Severity::Fatal);
        assert_eq!(problems[0].message, None, "a landed change needs no note");
    }

    /// An unreadable install is not a claim that the change has not landed, so
    /// the panel draws the findings the way it draws any other warning.
    #[test]
    fn an_install_that_could_not_be_read_leaves_the_rule_active() {
        let (_tmp, files) = project_on(&bin_with(ICON_AVATAR, text(ICON)), None);

        assert_eq!(BinPropertyType::new().dormant(&files), None);
        let problems = check_with(&files);
        assert_eq!(problems.len(), 1);
        assert_eq!(problems[0].severity, Severity::Warning);
    }

    // ---- the conversions --------------------------------------------------

    fn migration_for(field: BinHash) -> &'static Migration {
        table::tables()
            .iter()
            .find_map(|table| table.migration(SKIN, field))
            .expect("the fixture fields are all in the shipped table")
    }

    #[test]
    fn hash_value_turns_a_string_into_the_link_of_the_same_path() {
        let mut value: PropertyValueEnum = text(ICON).into();
        assert!(convert(&mut value, migration_for(ICON_AVATAR)));

        let PropertyValueEnum::WadChunkLink(link) = value else {
            panic!("expected a WadChunkLink");
        };
        assert_eq!(link.value, WadHash::hash_str(ICON));
    }

    /// The hash is case-insensitive, which is what lets a mod ship a path in
    /// whatever casing its author typed.
    #[test]
    fn hash_value_lowercases_before_it_hashes() {
        let mut upper: PropertyValueEnum = text(&ICON.to_uppercase()).into();
        let mut lower: PropertyValueEnum = text(&ICON.to_lowercase()).into();
        assert!(convert(&mut upper, migration_for(ICON_AVATAR)));
        assert!(convert(&mut lower, migration_for(ICON_AVATAR)));
        assert_eq!(upper, lower);
    }

    #[test]
    fn hash_value_rebuilds_a_container_under_the_new_item_type() {
        let mut value: PropertyValueEnum = values::Container::String {
            items: vec![text("a.dds"), text("b.dds")],
            meta: NoMeta,
        }
        .into();
        assert!(convert(&mut value, migration_for(ALTERNATE_ICONS_CIRCLE)));

        let PropertyValueEnum::Container(items) = &value else {
            panic!("expected a Container");
        };
        assert_eq!(items.item_kind(), Kind::WadChunkLink);
        assert_eq!(container_len(items), 2);
    }

    #[test]
    fn hash_value_rebuilds_an_optional_and_keeps_it_empty_when_it_was() {
        let mut present: PropertyValueEnum = values::Optional::String {
            value: Some(text(ICON)),
            meta: NoMeta,
        }
        .into();
        assert!(convert(&mut present, migration_for(ICON_CIRCLE)));
        assert!(matches!(
            present,
            PropertyValueEnum::Optional(values::Optional::WadChunkLink { value: Some(_), .. })
        ));

        let mut absent: PropertyValueEnum = values::Optional::String {
            value: None,
            meta: NoMeta,
        }
        .into();
        assert!(convert(&mut absent, migration_for(ICON_CIRCLE)));
        assert!(matches!(
            absent,
            PropertyValueEnum::Optional(values::Optional::WadChunkLink { value: None, .. })
        ));
    }

    #[test]
    fn hash_value_rebuilds_a_map_and_leaves_its_keys_alone() {
        let key: PropertyValueEnum = values::Hash::new(BinHash(0xabcd_1234)).into();
        let mut map = values::Map::empty(Kind::Hash, Kind::String);
        map.push(key.clone(), text(ICON).into()).unwrap();
        let mut value: PropertyValueEnum = map.into();

        assert!(convert(&mut value, migration_for(UNCENSORED_ICON_CIRCLES)));

        let PropertyValueEnum::Map(map) = &value else {
            panic!("expected a Map");
        };
        assert_eq!(map.key_kind(), Kind::Hash);
        assert_eq!(map.value_kind(), Kind::WadChunkLink);
        assert_eq!(map.entries()[0].0, key, "the key is untouched");
    }

    /// A `Hash` is FNV1a32 of a path and a `File` is XXH64 of it, and there is
    /// no arithmetic between them, so this must write nothing at all.
    #[test]
    fn rehash_makes_no_change_and_offers_no_fix() {
        let vfx = BinHash::hash_str("VfxAssetRemap");
        let old_asset = BinHash::hash_str("oldAsset");
        let migration = table::tables()
            .iter()
            .find_map(|table| table.migration(vfx, old_asset))
            .expect("VfxAssetRemap:oldAsset is a rehash row");
        assert_eq!(migration.conversion, Conversion::Rehash);

        let mut value: PropertyValueEnum = values::Hash::new(BinHash(0x1111_2222)).into();
        let before = value.clone();
        assert!(!convert(&mut value, migration));
        assert_eq!(value, before);
        assert!(preview(migration, &value).is_none());
    }

    #[test]
    fn none_moves_no_bytes_and_only_changes_the_tag() {
        let embed = values::Embedded(values::Struct {
            class_hash: BinHash(0x73b4_a2eb),
            properties: IndexMap::new(),
            meta: NoMeta,
        });
        let migration = table::tables()
            .iter()
            .find_map(|table| table.migration(BinHash(0x3b09_052f), BinHash::hash_str("value")))
            .expect("0x3b09052f:value is the Embed to Pointer row");
        assert_eq!(migration.conversion, Conversion::None);

        let mut value: PropertyValueEnum = embed.into();
        assert!(convert(&mut value, migration));

        let PropertyValueEnum::Struct(inner) = &value else {
            panic!("expected a Struct");
        };
        assert_eq!(inner.class_hash, BinHash(0x73b4_a2eb), "the class is kept");
    }

    /// The row has to print the hash the property holds, not the hash of the
    /// field naming it - the value is what a person takes away to go and find
    /// the path by hand.
    #[test]
    fn an_unrepairable_row_prints_the_hash_the_property_holds() {
        assert_eq!(
            unnamed(&values::Hash::new(BinHash(0x5ae4_1520)).into()),
            "0x5ae41520"
        );

        let mut map = values::Map::empty(Kind::Hash, Kind::String);
        map.push(
            values::Hash::new(BinHash(0x0000_00aa)).into(),
            text("a").into(),
        )
        .unwrap();
        map.push(
            values::Hash::new(BinHash(0x0000_00bb)).into(),
            text("b").into(),
        )
        .unwrap();
        assert_eq!(unnamed(&map.into()), "0x000000aa and 1 more");

        assert_eq!(
            unnamed(&values::Map::empty(Kind::Hash, Kind::String).into()),
            "its keys"
        );
    }

    // ---- the fix, end to end ---------------------------------------------

    /// Builds a project, runs the check, applies every problem, and hands back
    /// what the run reported plus the bin that landed on disk.
    fn fix_all(bin: &Bin) -> (Applied, Bin) {
        let tmp = tempfile::tempdir().unwrap();
        let dir = tmp.path().join("content").join("base").join("data");
        std::fs::create_dir_all(&dir).unwrap();
        let file = dir.join("skin0.bin");
        std::fs::write(&file, bytes_of(bin)).unwrap();

        let files = ProjectFiles::read(tmp.path(), &Config::default()).unwrap();
        let mut report = Report::default();
        let rule = BinPropertyType::new();
        rule.check(&files, &mut report);
        let (problems, _) = report.finish();

        let borrowed: Vec<&Problem> = problems.iter().collect();
        let mut run = FixRun::open(tmp.path(), vec!["16.17.8087655".to_owned()]).unwrap();
        let applied = rule.fix(&borrowed, &mut run).unwrap();
        run.finish().unwrap();

        let written = read_bin(&file).unwrap();
        (applied, written)
    }

    #[test]
    fn a_fix_writes_the_link_and_the_run_reports_it() {
        let (applied, written) = fix_all(&bin_with(ICON_AVATAR, text(ICON)));

        assert_eq!(applied.applied, 1);
        assert_eq!(applied.skipped, 0);

        let value = &written.objects[&ENTRY].properties[&ICON_AVATAR];
        let PropertyValueEnum::WadChunkLink(link) = value else {
            panic!("expected a WadChunkLink");
        };
        assert_eq!(link.value, WadHash::hash_str(ICON));
    }

    /// A fix run offered twice applies once, because the second pass matches
    /// `to` and raises nothing at all.
    #[test]
    fn a_second_run_over_a_repaired_file_finds_nothing() {
        let (_, written) = fix_all(&bin_with(ICON_AVATAR, text(ICON)));
        assert!(found(&written).is_empty());
    }

    #[test]
    fn a_fix_repairs_every_shape_the_class_carries() {
        let mut map = values::Map::empty(Kind::Hash, Kind::String);
        map.push(values::Hash::new(BinHash(1)).into(), text(ICON).into())
            .unwrap();

        let object = BinObject::<NoMeta>::builder(ENTRY, SKIN)
            .property(ICON_AVATAR, text(ICON))
            .property(
                ALTERNATE_ICONS_CIRCLE,
                values::Container::String {
                    items: vec![text("a.dds")],
                    meta: NoMeta,
                },
            )
            .property(
                ICON_CIRCLE,
                values::Optional::String {
                    value: Some(text(ICON)),
                    meta: NoMeta,
                },
            )
            .property(UNCENSORED_ICON_CIRCLES, map)
            .build();
        let bin = Bin::new([object], std::iter::empty::<&str>());

        assert_eq!(found(&bin).len(), 4);
        let (applied, written) = fix_all(&bin);
        assert_eq!(applied.applied, 4);
        assert_eq!(applied.skipped, 0);
        assert!(found(&written).is_empty());
    }

    #[test]
    fn a_fix_leaves_a_property_the_rule_raised_nothing_for_alone() {
        let object = BinObject::<NoMeta>::builder(ENTRY, SKIN)
            .property(ICON_AVATAR, text(ICON))
            .property(BinHash(0xdead_beef), text("untouched.dds"))
            .build();
        let bin = Bin::new([object], std::iter::empty::<&str>());

        let (_, written) = fix_all(&bin);
        let value = &written.objects[&ENTRY].properties[&BinHash(0xdead_beef)];
        let PropertyValueEnum::String(kept) = value else {
            panic!("expected a String");
        };
        assert_eq!(kept.value, "untouched.dds");
    }

    /// The user changed the file in another tool between the run and the fix.
    /// The rule re-derives from disk, so it must not write a hash over a
    /// property that no longer holds a string.
    #[test]
    fn a_problem_the_file_no_longer_matches_is_counted_as_skipped() {
        let tmp = tempfile::tempdir().unwrap();
        let dir = tmp.path().join("content").join("base").join("data");
        std::fs::create_dir_all(&dir).unwrap();
        let file = dir.join("skin0.bin");
        std::fs::write(&file, bytes_of(&bin_with(ICON_AVATAR, text(ICON)))).unwrap();

        let files = ProjectFiles::read(tmp.path(), &Config::default()).unwrap();
        let mut report = Report::default();
        let rule = BinPropertyType::new();
        rule.check(&files, &mut report);
        let (problems, _) = report.finish();

        std::fs::write(&file, bytes_of(&bin_with(ICON_AVATAR, values::I32::new(7)))).unwrap();

        let borrowed: Vec<&Problem> = problems.iter().collect();
        let mut run = FixRun::open(tmp.path(), Vec::new()).unwrap();
        let applied = rule.fix(&borrowed, &mut run).unwrap();

        assert_eq!(applied.applied, 0);
        assert_eq!(applied.skipped, 1);

        let value = &read_bin(&file).unwrap().objects[&ENTRY].properties[&ICON_AVATAR];
        assert!(matches!(value, PropertyValueEnum::I32(_)));
    }

    // ---- reading ----------------------------------------------------------

    #[test]
    fn a_file_that_is_not_a_bin_is_a_failure_and_not_a_panic() {
        let tmp = tempfile::tempdir().unwrap();
        let dir = tmp.path().join("content").join("base");
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("broken.bin"), b"not a bin at all").unwrap();

        let files = ProjectFiles::read(tmp.path(), &Config::default()).unwrap();
        let mut report = Report::default();
        BinPropertyType::new().check(&files, &mut report);
        let (problems, failed) = report.finish();

        assert!(problems.is_empty());
        assert_eq!(failed.len(), 1);
        assert_eq!(failed[0].rule, ID);
        assert_eq!(failed[0].site.as_ref().unwrap().path, "broken.bin");
    }
}
