//! Unit tests for the install comparison.

use super::*;

fn installed() -> Vec<InstalledPatchline> {
    vec![
        InstalledPatchline {
            id: "live".to_string(),
            root: PathBuf::from("C:/Riot Games/League of Legends"),
        },
        InstalledPatchline {
            id: "pbe".to_string(),
            root: PathBuf::from("C:/Riot Games/League of Legends (PBE)"),
        },
    ]
}

/// The reporter's machine: the manager set up for PBE while the live game ran.
#[test]
fn a_session_from_another_install_is_a_mismatch() {
    let configured = Path::new(r"C:\Riot Games\League of Legends (PBE)");
    let mismatch = install_mismatch(configured, &installed(), "live").expect("a mismatch");
    assert_eq!(
        mismatch.configured_path,
        "C:/Riot Games/League of Legends (PBE)"
    );
    assert_eq!(mismatch.configured_patchline, "pbe");
    assert_eq!(mismatch.session_patchline, "live");
    assert_eq!(mismatch.session_path, "C:/Riot Games/League of Legends");
}

#[test]
fn a_session_from_the_configured_install_is_no_mismatch() {
    let configured = Path::new(r"C:\Riot Games\League of Legends\");
    assert_eq!(install_mismatch(configured, &installed(), "live"), None);
}

#[test]
fn a_path_the_registry_does_not_know_is_no_mismatch() {
    let configured = Path::new(r"D:\Games\League");
    assert_eq!(install_mismatch(configured, &installed(), "live"), None);
}

#[test]
fn a_session_patchline_the_registry_does_not_list_is_no_mismatch() {
    let configured = Path::new(r"C:\Riot Games\League of Legends");
    assert_eq!(
        install_mismatch(configured, &installed(), "pcpromolive"),
        None
    );
}

#[test]
fn the_same_install_is_spelled_many_ways() {
    let root = Path::new(r"C:\Riot Games\League of Legends");
    for spelling in [
        r"C:\Riot Games\League of Legends",
        r"C:\Riot Games\League of Legends\",
        "C:/Riot Games/League of Legends",
        "C:/Riot Games/League of Legends/",
        r"\\?\C:\Riot Games\League of Legends",
        r"c:\riot games\league of legends",
    ] {
        assert!(same_install(root, Path::new(spelling)), "{spelling}");
    }
    assert!(!same_install(
        root,
        Path::new(r"C:\Riot Games\League of Legends (PBE)")
    ));
    assert!(!same_install(
        root,
        Path::new(r"C:\Riot Games\League of Legends\Game")
    ));
}
