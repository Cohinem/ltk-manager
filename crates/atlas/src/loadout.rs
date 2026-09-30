//! A sample of what the controllers fill their elements with, read out of the game: one champion
//! with the summoner spells, runes and items it plays with, per "A preview that looks like the
//! game" in docs/plans/atlas-ui-editor.md.

use ltk_hash::BinHash;
use ltk_manager_core::bin_document::{
    AssetLookup, BinDocument, Fields, GameCopy, Namer, RowNames, fields_of, items, leaf, text,
};
use ltk_meta::PropertyValueEnum;
use ltk_meta::walk::Leaf;
use serde::Serialize;

use super::fields::named;
use super::model::UiTexture;
use super::resolver::object;

const CHAMPION: &str = "Ahri";
const SUMMONERS: [&str; 2] = ["SummonerFlash", "SummonerDot"];
/// Luden's Companion, Sorcerer's Shoes, Shadowflame, Rabadon's Deathcap, Zhonya's Hourglass, Void
/// Staff, then the Stealth Ward trinket.
const ITEMS: [u32; 7] = [6655, 3020, 4645, 3089, 3157, 3135, 3340];
const KEYSTONE: &str = "Perks/Styles/Domination/Electrocute";
const SUBSTYLE: &str = "Perks/Styles/Sorcery";
/// The folder a summoner spell's bare icon name sits in.
const SPELL_ICONS: &str = "assets/spells/icons2d/";
const ABILITY_COUNT: usize = 4;

const SPELLS: BinHash = named("spells");
const ABILITIES: BinHash = named("mAbilities");
const ROOT_SPELL: BinHash = named("mRootSpell");
const SPELL: BinHash = named("mSpell");
const ICON_NAME: BinHash = named("mImgIconName");
const PASSIVE_ICON: BinHash = named("passive1IconName");
const NAME: BinHash = named("name");
const ICON_SQUARE: BinHash = named("iconSquare");
const LOADSCREEN: BinHash = named("loadscreen");
const IMAGE: BinHash = named("image");
const ITEM_CLIENT: BinHash = named("mItemDataClient");
const INVENTORY_ICON: BinHash = named("inventoryIcon");
const PERK_ICON: BinHash = named("mIconTextureName");

/// The textures and names a preview fills a controller's elements with.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(specta::Type))]
pub struct UiLoadout {
    pub champion: String,
    /// The champion's name in the string table, where its record names one.
    pub name_key: Option<String>,
    pub portrait: Option<UiTexture>,
    pub splash: Option<UiTexture>,
    /// Q, W, E and R.
    pub abilities: Vec<Option<UiTexture>>,
    pub passive: Option<UiTexture>,
    /// D and F.
    pub summoners: Vec<Option<UiTexture>>,
    pub keystone: Option<UiTexture>,
    pub substyle: Option<UiTexture>,
    /// The six item slots, then the trinket.
    pub items: Vec<Option<UiTexture>>,
}

/// The sample loadout, each object read from the bin `game` answers for it and each texture
/// located through `assets`. A part the install does not hold is absent.
pub fn read_loadout(
    game: &dyn GameCopy,
    assets: &dyn AssetLookup,
    names: &dyn RowNames,
) -> UiLoadout {
    let mut objects = Objects {
        game,
        bins: Vec::new(),
    };
    let mut textures = Textures {
        assets,
        namer: Namer::new(names),
    };

    let record = objects.fields(&format!("Characters/{CHAMPION}/CharacterRecords/Root"));
    let skin = objects.fields(&format!("Characters/{CHAMPION}/Skins/Skin0"));

    let abilities = ability_spells(&mut objects, record.as_ref())
        .into_iter()
        .map(|spell| textures.at(spell_icon(spell.as_ref()?)))
        .collect();
    let summoners = SUMMONERS
        .iter()
        .map(|name| {
            let spell = objects.fields(&format!("Shared/Spells/{name}"))?;
            let Leaf::String(icon) = first_leaf(spell_icon(&spell))? else {
                return None;
            };
            textures.path(&summoner_path(icon))
        })
        .collect();
    let items = ITEMS
        .iter()
        .map(|id| {
            let item = objects.fields(&format!("Items/{id}"))?;
            textures.at(fields_of(item.get(&ITEM_CLIENT))?.get(&INVENTORY_ICON))
        })
        .collect();
    let keystone = objects.fields(KEYSTONE);
    let substyle = objects.fields(SUBSTYLE);

    UiLoadout {
        champion: CHAMPION.to_owned(),
        name_key: text(own(record.as_ref(), NAME)).map(str::to_owned),
        portrait: textures.at(own(skin.as_ref(), ICON_SQUARE)),
        splash: textures
            .at(fields_of(own(skin.as_ref(), LOADSCREEN)).and_then(|image| image.get(&IMAGE))),
        abilities,
        passive: textures.at(own(record.as_ref(), PASSIVE_ICON)),
        summoners,
        keystone: textures.at(own(keystone.as_ref(), PERK_ICON)),
        substyle: textures.at(own(substyle.as_ref(), PERK_ICON)),
        items,
    }
}

/// Objects read by path through the bins that declare them, each bin parsed once.
struct Objects<'a> {
    game: &'a dyn GameCopy,
    bins: Vec<BinDocument>,
}

impl Objects<'_> {
    fn fields(&mut self, path: &str) -> Option<Fields> {
        self.at(named(path))
    }

    fn at(&mut self, entry: BinHash) -> Option<Fields> {
        if let Some(object) = self.bins.iter().find_map(|bin| bin.object_at(entry)) {
            return Some(object.properties.clone());
        }

        let bytes = self.game.declaring_chunk(entry).ok()??;
        let bin = BinDocument::parse(bytes).ok()?;
        let fields = bin.object_at(entry).map(|object| object.properties.clone());
        self.bins.push(bin);
        fields
    }
}

/// Textures located on this machine, each named as the tables name its chunk.
struct Textures<'a> {
    assets: &'a dyn AssetLookup,
    namer: Namer<'a>,
}

impl Textures<'_> {
    /// The texture a field names: a path, or a file link, the first where it holds a list.
    fn at(&mut self, value: Option<&PropertyValueEnum>) -> Option<UiTexture> {
        match first_leaf(value)? {
            Leaf::String(path) if !path.is_empty() => self.path(path),
            Leaf::File(hash) if hash.0 != 0 => {
                let asset = self.assets.locate_chunk(hash)?;
                let path = self
                    .namer
                    .chunk(hash)
                    .unwrap_or_else(|| format!("{:016x}", hash.0));
                Some(texture(path, asset))
            }
            _ => None,
        }
    }

    fn path(&mut self, path: &str) -> Option<UiTexture> {
        let asset = self.assets.locate(path)?;
        Some(texture(path.to_owned(), asset))
    }
}

fn texture(path: String, asset: ltk_manager_core::preview::AssetRef) -> UiTexture {
    UiTexture {
        path,
        asset: Some(asset),
        page: false,
    }
}

/// The spells of the champion's four abilities: its `spells` links, else each of its
/// `mAbilities` through the ability's root spell.
fn ability_spells(objects: &mut Objects<'_>, record: Option<&Fields>) -> Vec<Option<Fields>> {
    let Some(record) = record else {
        return vec![None; ABILITY_COUNT];
    };

    let linked = |field| {
        items(record.get(&field))
            .iter()
            .filter_map(|item| object(Some(item)))
            .take(ABILITY_COUNT)
            .collect::<Vec<_>>()
    };
    let spells = linked(SPELLS);
    let mut found: Vec<Option<Fields>> = if spells.is_empty() {
        linked(ABILITIES)
            .into_iter()
            .map(|ability| {
                let root = object(objects.at(ability)?.get(&ROOT_SPELL))?;
                objects.at(root)
            })
            .collect()
    } else {
        spells.into_iter().map(|spell| objects.at(spell)).collect()
    };

    found.resize(ABILITY_COUNT, None);
    found
}

/// The field `field` of an object that may be absent.
fn own(fields: Option<&Fields>, field: BinHash) -> Option<&PropertyValueEnum> {
    fields?.get(&field)
}

/// The icon list of a `SpellObject`'s spell data.
fn spell_icon(spell: &Fields) -> Option<&PropertyValueEnum> {
    fields_of(spell.get(&SPELL))?.get(&ICON_NAME)
}

/// A summoner spell icon's path, which the spell names by its file name alone.
fn summoner_path(icon: &str) -> String {
    if icon.contains('/') {
        icon.to_owned()
    } else {
        format!("{SPELL_ICONS}{}", icon.to_lowercase())
    }
}

/// The value `value` holds, through an optional and to the first item of a list.
fn first_leaf(value: Option<&PropertyValueEnum>) -> Option<Leaf<'_>> {
    let value = match value? {
        PropertyValueEnum::Optional(optional) => optional.value()?,
        value => value,
    };
    leaf(Some(value)).or_else(|| leaf(items(Some(value)).first()))
}
