use super::*;

fn paths(names: &[&str]) -> Vec<PathBuf> {
    names.iter().map(PathBuf::from).collect()
}

#[test]
fn only_the_first_file_opens_a_batch() {
    let mut batches = Batches::default();
    let now = Instant::now();

    assert!(batches.add(paths(&["a.fantome"]), now));
    assert!(!batches.add(paths(&["b.modpkg"]), now));
}

#[test]
fn a_late_file_keeps_the_batch_open_for_another_window() {
    let mut batches = Batches::default();
    let start = Instant::now();
    batches.add(paths(&["a.fantome"]), start);

    let late = start + Duration::from_millis(250);
    batches.add(paths(&["b.modpkg"]), late);

    assert_eq!(
        batches.remaining(start + BATCH_WINDOW),
        Some(Duration::from_millis(250))
    );
    assert_eq!(batches.remaining(late + BATCH_WINDOW), None);
}

#[test]
fn a_batch_closed_before_the_frontend_listens_is_held() {
    let mut batches = Batches::default();
    batches.add(paths(&["a.fantome", "b.modpkg"]), Instant::now());

    assert_eq!(batches.close(), None);
    assert_eq!(batches.take_pending(), paths(&["a.fantome", "b.modpkg"]));
    assert_eq!(batches.take_pending(), Vec::<PathBuf>::new());
}

#[test]
fn a_batch_closed_while_listening_is_sent_once_per_file() {
    let mut batches = Batches::default();
    let now = Instant::now();
    batches.take_pending();
    batches.add(paths(&["a.fantome", "b.modpkg"]), now);
    batches.add(paths(&["a.fantome"]), now);

    assert_eq!(batches.close(), Some(paths(&["a.fantome", "b.modpkg"])));
    assert!(batches.add(paths(&["c.fantome"]), now));
}

#[test]
fn mod_files_keeps_existing_mod_archives_and_resolves_them_against_the_cwd() {
    let dir = tempfile::tempdir().unwrap();
    fs::write(dir.path().join("skin.fantome"), b"").unwrap();
    fs::write(dir.path().join("Skin.MODPKG"), b"").unwrap();
    fs::write(dir.path().join("notes.txt"), b"").unwrap();
    fs::create_dir(dir.path().join("folder.fantome")).unwrap();
    let absolute = dir.path().join("Skin.MODPKG");

    let argv: Vec<String> = [
        "ltk-manager.exe",
        "skin.fantome",
        &absolute.to_string_lossy(),
        "notes.txt",
        "folder.fantome",
        "missing.fantome",
        "ltk://install?url=https://example.com/a.fantome",
    ]
    .iter()
    .map(|arg| arg.to_string())
    .collect();

    assert_eq!(
        mod_files(&argv, dir.path()),
        vec![dir.path().join("skin.fantome"), absolute]
    );
}
