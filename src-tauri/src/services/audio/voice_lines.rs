//! The voice lines of a `ContextualActionData` object, read over its open bin document and
//! resolved as one of the skins that link it. "Voice lines" in `docs/ux/CONTEXTUAL_VOICE.md`.

use ltk_manager_assets::preview::AssetRef;
use ltk_manager_audio::{
    linking_skins, rule_template, AudioIndex, BankContent, BankSet, LinkingSkin, SiteRow,
    SkinVoice, VoiceLines,
};
use ltk_manager_base::error::AppError;
use ltk_manager_bin::bin_document::{clipboard_text, BinDocumentId, BinDocuments};
use ltk_manager_bin::object_index::parse_hash;
use ltk_manager_bin::sandbox::SandboxRef;
use serde::Serialize;
use tauri::{AppHandle, Manager};

use super::index::{game_audio_index, project_audio_index, AudioIndexStatus};
use super::references::with_site_names;
use super::with_audio_files;
use crate::error::IpcResult;
use crate::services::shared::off_thread;

/// The voice lines of one object, the skins that link it, and the skin that the names resolve as.
#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct VoiceLinesResponse {
    pub lines: VoiceLines,
    /// The skins whose `mContextualActionData` links the object, the project's first.
    pub skins: Vec<VoiceSkin>,
    /// The bin of the skin that the names resolve as, or `None` if no skin links the object.
    pub skin: Option<String>,
    /// The event banks of that skin's voice-over units, in set order.
    pub banks: Vec<VoiceBank>,
    /// Off `ready`, the skins of the game are missing from `skins`.
    pub index: AudioIndexStatus,
}

/// One skin that links the object.
#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct VoiceSkin {
    /// The game path of the skin bin.
    pub bin: String,
    /// The skin object.
    pub row: SiteRow,
    /// `skinAudioProperties.tagEventList`.
    pub tags: Vec<String>,
    /// `true` if a bin of the open project declares the skin.
    pub in_project: bool,
}

/// One event bank of a skin's voice-over units.
#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct VoiceBank {
    /// The game path, under the client's locale where the unit is voice-over.
    pub path: String,
    /// The layer file or game chunk, or `None` if no store contains the bank.
    pub asset: Option<AssetRef>,
}

/// Read the voice lines of the `ContextualActionData` object `entry` of the open bin `document`.
///
/// The names resolve as the linking skin whose bin is `skin`. Without one, or if no linking skin
/// has that bin, they resolve as the first skin that the project declares, then as skin 0, then
/// as the first linking skin. Reads the document with its unsaved edits. Fails with
/// `VALIDATION_FAILED` if `entry` is not an object of the document.
#[tauri::command]
#[specta::specta]
pub async fn audio_voice_lines(
    sandbox: SandboxRef,
    document: BinDocumentId,
    entry: String,
    skin: Option<String>,
    app_handle: AppHandle,
) -> IpcResult<VoiceLinesResponse> {
    off_thread(move || {
        let hash = parse_hash(&entry)
            .ok_or_else(|| AppError::ValidationFailed(format!("{entry} is not an object hash")))?;
        let object = app_handle.state::<BinDocuments>().read(document, |open| {
            open.object_at(hash).cloned().ok_or_else(|| {
                AppError::ValidationFailed(format!("The bin holds no object {entry}"))
            })
        })?;

        let (game, index) = game_audio_index(&app_handle);
        let project = sandbox.project().map(project_audio_index);
        let indexes: Vec<&AudioIndex> = project.iter().chain(game.as_deref()).collect();
        let in_project = |linking: &LinkingSkin| project.is_some() && linking.index == 0;
        let linking = linking_skins(hash.0, &indexes);
        let chosen = chosen_skin(&linking, skin.as_deref(), in_project);

        let (lines, skins, banks) = with_site_names(&app_handle, &sandbox, |names, _| {
            let skins: Vec<VoiceSkin> = linking
                .iter()
                .map(|each| VoiceSkin {
                    bin: each.bin.clone(),
                    row: each.row(names),
                    tags: each.tags.clone(),
                    in_project: in_project(each),
                })
                .collect();

            let Some(chosen) = chosen else {
                return Ok((VoiceLines::read(&object, None, names), skins, Vec::new()));
            };
            with_audio_files(&app_handle, &sandbox, |files, locale| {
                let set = BankSet::open(&chosen.units, files, locale);
                let voice = SkinVoice {
                    tags: &chosen.tags,
                    banks: &set,
                };
                (
                    VoiceLines::read(&object, Some(&voice), names),
                    skins,
                    event_banks(&set),
                )
            })
        })??;

        tracing::debug!(
            object = entry,
            skins = skins.len(),
            skin = chosen.map(|each| each.bin.as_str()),
            ?index,
            "Read the voice lines of a contextual action object"
        );
        Ok(VoiceLinesResponse {
            lines,
            skin: chosen.map(|each| each.bin.clone()),
            skins,
            banks,
            index,
        })
    })
    .await
}

/// The clipboard text of a new `ContextualRule` named `name` that plays `short` for the owner.
///
/// The view pastes it into `mRules` through `bin_edit`, so the rule, its action and its name land
/// as one step of the document's history.
#[tauri::command]
#[specta::specta]
pub fn audio_voice_rule_template(name: String, short: String) -> IpcResult<String> {
    let rule = rule_template(&name, &short).into();
    IpcResult::ok(clipboard_text(&rule, Some(RULE_CLASS)))
}

/// The class name that the rule template's clipboard text carries.
const RULE_CLASS: &str = "ContextualRule";

/// Returns the skin of `linking` whose bin is `asked`, else the first that the project declares,
/// else skin 0, else the first.
fn chosen_skin<'a>(
    linking: &'a [LinkingSkin],
    asked: Option<&str>,
    in_project: impl Fn(&LinkingSkin) -> bool,
) -> Option<&'a LinkingSkin> {
    let asked = asked.and_then(|bin| {
        linking
            .iter()
            .find(|each| each.bin.eq_ignore_ascii_case(bin))
    });
    asked
        .or_else(|| linking.iter().find(|each| in_project(each)))
        .or_else(|| linking.iter().find(|each| is_skin_zero(&each.bin)))
        .or_else(|| linking.first())
}

/// Returns `true` for the bin of skin 0, such as `data/characters/lux/skins/skin0.bin`.
fn is_skin_zero(bin: &str) -> bool {
    let file = bin.rsplit('/').next().unwrap_or(bin);
    file.eq_ignore_ascii_case("skin0.bin") || file.eq_ignore_ascii_case("skin00.bin")
}

/// Returns the event banks of `set`: its banks whose path ends in `_events.bnk`.
fn event_banks(set: &BankSet) -> Vec<VoiceBank> {
    set.files()
        .iter()
        .filter(|file| {
            matches!(
                file.content(),
                BankContent::Bank { .. } | BankContent::Missing
            )
        })
        .filter(|file| file.path().to_ascii_lowercase().ends_with(EVENTS_SUFFIX))
        .map(|file| VoiceBank {
            path: file.path().to_owned(),
            asset: file.asset().cloned(),
        })
        .collect()
}

/// The end of the path of an event bank.
const EVENTS_SUFFIX: &str = "_events.bnk";

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn is_skin_zero_matches_skin_zero_bin_only() {
        assert!(is_skin_zero("data/characters/lux/skins/skin0.bin"));
        assert!(!is_skin_zero("data/characters/lux/skins/skin07.bin"));
    }
}
