//! The measurement "The build, measured" in `docs/ux/PROJECT_EDITOR.md` reads.

use std::path::PathBuf;

use ltk_manager_core::config::Config;
use ltk_manager_core::game_index::GameIndex;
use ltk_manager_core::game_wads::GameArchives;
use ltk_manager_core::hashtables::{HashtableCache, WadPathResolver};
use ltk_manager_core::object_index::{CacheNames, ObjectIndex};
use ltk_manager_core::problems::budget::files_at_once;

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
