use super::*;

fn mismatch(mod_id: &str, wad: &str) -> ltk_overlay::ChecksumMismatch {
    ltk_overlay::ChecksumMismatch {
        mod_id: mod_id.to_string(),
        wad_name: wad.to_string(),
        path_hash: ltk_wad::WadHash(0xABCD),
        claimed: 0xDEAD_BEEF,
        computed: 0x1234_5678_9ABC_DEF0,
    }
}

#[test]
fn a_snapshot_groups_mismatches_by_mod() {
    let state = ChecksumMismatchState::default();
    state.record(vec![
        mismatch("mod-a", "Aatrox.wad.client"),
        mismatch("mod-a", "Ashe.wad.client"),
        mismatch("mod-b", "Ahri.wad.client"),
    ]);

    let by_mod = state.by_mod();
    assert_eq!(by_mod.len(), 2);
    assert_eq!(by_mod["mod-a"].len(), 2);
    assert_eq!(by_mod["mod-b"].len(), 1);
}

/// The hashes cross the IPC boundary as hex strings: they are 64-bit values,
/// which JavaScript numbers cannot carry exactly.
#[test]
fn hashes_cross_as_full_width_hex() {
    let info = ChecksumMismatchInfo::from(mismatch("mod-a", "Aatrox.wad.client"));
    assert_eq!(info.path_hash, "000000000000abcd");
    assert_eq!(info.claimed, "00000000deadbeef");
    assert_eq!(info.computed, "123456789abcdef0");
}

/// A fresh build's results replace the previous snapshot wholesale, so a clean
/// build clears every advisory.
#[test]
fn recording_replaces_the_previous_snapshot() {
    let state = ChecksumMismatchState::default();
    state.record(vec![mismatch("mod-a", "Aatrox.wad.client")]);
    state.record(Vec::new());
    assert!(state.by_mod().is_empty());
}
