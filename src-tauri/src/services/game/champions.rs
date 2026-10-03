use crate::error::IpcResult;
use crate::services::shared::off_thread;
use crate::state::SettingsState;
use atlas::{read_characters, UiTexture};
use ltk_manager_assets::strings::StringKeyIndexState;
use ltk_manager_base::utils::game::GameDir;
use ltk_manager_core::mods::champion_display_name;
use ltk_manager_game::champions::ChampionArchives;
use serde::Serialize;
use tauri::{AppHandle, Manager};

/// One champion the install ships.
#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct Champion {
    /// The folder its paths name it by, such as `MonkeyKing`.
    pub id: String,
    /// The name a mod's metadata gives it, as categorization writes it, such as `Wukong`.
    pub metadata_name: String,
    /// Its name in the game's string table, in the game's locale, such as `Wukong`.
    pub name: Option<String>,
    /// The square icon of its base skin.
    pub icon: Option<UiTexture>,
}

/// Every champion the install ships, with its name and icon, in natural order.
///
/// Read out of each champion's own archive, so neither index is built. An archive the string
/// table names no character for, such as `TFTChampion`, is left out, unless the table names
/// none at all because it could not be read.
///
/// # Errors
///
/// Fails when no League install is configured, or its champions directory cannot be listed.
#[tauri::command]
#[specta::specta]
pub async fn read_champions(app_handle: AppHandle) -> IpcResult<Vec<Champion>> {
    off_thread(move || {
        let config = app_handle.state::<SettingsState>().config();
        let archives = ChampionArchives::mount(&GameDir::resolve(&config)?)?;

        let index = app_handle
            .state::<StringKeyIndexState>()
            .get_or_build(&config);
        let strings = |key: &str| index.text(key).map(str::to_owned);

        let mut champions: Vec<Champion> =
            read_characters(&archives, &archives, &(), &strings, &archives.ids())
                .into_iter()
                .map(|character| Champion {
                    metadata_name: champion_display_name(&character.id),
                    id: character.id,
                    name: character.name,
                    icon: character.icon,
                })
                .collect();

        if champions.iter().any(|champion| champion.name.is_some()) {
            champions.retain(|champion| champion.name.is_some());
        }
        Ok(champions)
    })
    .await
}
