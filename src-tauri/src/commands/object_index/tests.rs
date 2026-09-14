//! The measurements "The build, measured" and "The References document" in
//! `docs/ux/PROJECT_EDITOR.md` read, and the wire shape a reference query arrives in.

use std::path::PathBuf;
use std::time::Instant;

use ltk_hash::{BinHash, Hash as _};

use ltk_manager_core::config::Config;
use ltk_manager_core::game_index::GameIndex;
use ltk_manager_core::game_wads::GameArchives;
use ltk_manager_core::hashtables::{HashtableCache, WadPathResolver};
use ltk_manager_core::meta_schema;
use ltk_manager_core::object_index::{CacheNames, ObjectIndex, WalkRequest, WalkTarget};
use ltk_manager_core::problems::budget::files_at_once;
use ltk_manager_core::problems::{Budget, GameBuild};

/// The warm the app runs, over the install `LTK_LEAGUE_PATH` names, logged.
///
/// The same build the Objects switch triggers, on the same workers, named
/// through the same shared cache. Run it with
/// `cargo test -p ltk-manager --release measure_the_live_install -- --ignored --nocapture`.
#[test]
#[ignore = "reads the League install LTK_LEAGUE_PATH names"]
fn measure_the_live_install() {
    let league = std::env::var_os("LTK_LEAGUE_PATH").expect("LTK_LEAGUE_PATH names the install");
    tracing_subscriber::fmt()
        .with_env_filter("ltk_manager_core=debug")
        .with_test_writer()
        .init();

    let config = Config {
        league_path: Some(PathBuf::from(league)),
        ..Config::default()
    };
    let archives = GameArchives::resolve(&config).expect("an install under the path");
    let wad = WadPathResolver::discover();
    let game = GameIndex::build(&archives, wad.tables()).expect("the game index builds");

    let index = ObjectIndex::build(&game, &archives, files_at_once(), &|| false)
        .expect("the object index builds");
    let cache = HashtableCache::shared().expect("a synced hashtable cache");
    let bin = cache.bin_tables();
    let named = index.named(&CacheNames::new(&bin, &wad));

    let stats = named.stats();
    assert!(stats.rows > 0, "an install declares objects");
}

/// The walk a References query runs, over the install `LTK_LEAGUE_PATH` names, timed.
///
/// One walk for an object's incoming links and one for an embedded class's uses, on the
/// app's workers and budget. Run it with
/// `cargo test -p ltk-manager --release measure_the_reference_walk -- --ignored --nocapture`.
#[test]
#[ignore = "reads the League install LTK_LEAGUE_PATH names"]
fn measure_the_reference_walk() {
    let league = std::env::var_os("LTK_LEAGUE_PATH").expect("LTK_LEAGUE_PATH names the install");
    let config = Config {
        league_path: Some(PathBuf::from(league)),
        ..Config::default()
    };
    let archives = GameArchives::resolve(&config).expect("an install under the path");
    let wad = WadPathResolver::discover();
    let game = GameIndex::build(&archives, wad.tables()).expect("the game index builds");
    let index = ObjectIndex::build(&game, &archives, files_at_once(), &|| false)
        .expect("the object index builds");
    let cache = HashtableCache::shared().expect("a synced hashtable cache");
    let bin = cache.bin_tables();
    let names = CacheNames::new(&bin, &wad);
    let build = GameBuild::installed(&config);
    let schema = meta_schema::shared(build);

    for target in [
        WalkTarget::Linked(BinHash::hash_str("Characters/Aatrox/CharacterRecords/Root")),
        WalkTarget::Embedded(BinHash::hash_str("VfxEmitterDefinitionData")),
    ] {
        let budget = Budget::sweep();
        let request = WalkRequest {
            target,
            layers: &[],
            archives: &archives,
            budget: &budget,
            workers: files_at_once(),
        };
        let started = Instant::now();
        let result = index.walk(&request, &names, Some(schema.at(build)), || false, |_| {});
        println!(
            "{target:?}: {} bins, {} references in {} files, {} ms on {} workers",
            index.stats().files,
            result.total,
            result.groups.len(),
            started.elapsed().as_millis(),
            files_at_once(),
        );
        assert!(!result.cancelled);
    }
}

#[test]
fn a_reference_query_arrives_tagged_by_what_it_asks_for() {
    use super::ReferenceQuery;

    let class: ReferenceQuery =
        serde_json::from_str(r#"{"kind":"class","classHash":"0x12345678"}"#).unwrap();
    assert!(matches!(class, ReferenceQuery::Class { class_hash } if class_hash == "0x12345678"));

    let embedded: ReferenceQuery =
        serde_json::from_str(r#"{"kind":"embedded","classHash":"0x12345678"}"#).unwrap();
    assert!(
        matches!(embedded, ReferenceQuery::Embedded { class_hash } if class_hash == "0x12345678")
    );

    let object: ReferenceQuery =
        serde_json::from_str(r#"{"kind":"object","objectHash":"0x9abcdef0"}"#).unwrap();
    assert!(
        matches!(object, ReferenceQuery::Object { object_hash } if object_hash == "0x9abcdef0")
    );
}
