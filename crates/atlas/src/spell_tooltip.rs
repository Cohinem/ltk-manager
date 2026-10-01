//! A spell's tooltip as the client composes it, per "The string" in
//! docs/research/ui-data-layout.md: its `TooltipFormat`'s template with each loc key's text in
//! place, each `{{ Key }}` include expanded, and each `@Value@` read from the spell at rank 1 and
//! character level 1 with no bonus stats.

use std::collections::HashMap;

use ltk_hash::BinHash;
use ltk_manager_core::bin_document::{Fields, fields_of, items, leaf, struct_of, text};
use ltk_meta::PropertyValueEnum;
use ltk_meta::walk::Leaf;

use super::fields::named;
use super::resolver::{flag, number, object};

/// The rank a tooltip's values read at.
const RANK: usize = 1;
/// How deep includes and calculations nest before the rest reads as unresolved.
const DEPTH: usize = 8;
/// The decimals a value shows where neither its token nor its calculation sets a precision.
const DECIMALS: usize = 2;
/// The most decimals a precision asks for that a value shows.
const MAX_DECIMALS: usize = 6;
/// `cooldownTime`'s default, which a spell that leaves it out has at every rank.
const DEFAULT_COOLDOWN: f32 = 10.0;
/// `mMaxAmmo`'s default, which a spell that leaves it out has at every rank.
const DEFAULT_MAX_AMMO: f32 = -1.0;

const SPELL: BinHash = named("mSpell");
const CLIENT_DATA: BinHash = named("mClientData");
const TOOLTIP_DATA: BinHash = named("mTooltipData");
const FORMAT: BinHash = named("mFormat");
const LOC_KEYS: BinHash = named("mLocKeys");
const INPUT_KEYS: BinHash = named("mInputLocKeysWithDefaults");
const OUTPUT_STRINGS: BinHash = named("mOutputStrings");

const DATA_VALUES: BinHash = named("DataValues");
const DATA_VALUE_NAME: BinHash = named("name");
const VALUES: BinHash = named("values");
const CALCULATIONS: BinHash = named("mSpellCalculations");
const COOLDOWN: BinHash = named("cooldownTime");
const COOLDOWN_VALUES: BinHash = named("Cooldown");
const MANA: BinHash = named("mana");
const MANA_VALUES: BinHash = named("manaValues");
const AMMO_RECHARGE: BinHash = named("mAmmoRechargeTime");
const MAX_AMMO: BinHash = named("mMaxAmmo");
const EFFECT_AMOUNT: BinHash = named("mEffectAmount");
const EFFECT_VALUE: BinHash = named("value");

const CALCULATION: BinHash = named("GameCalculation");
const MODIFIED_CALCULATION: BinHash = named("GameCalculationModified");
const CONDITIONAL_CALCULATION: BinHash = named("GameCalculationConditional");
const FORMULA_PARTS: BinHash = named("mFormulaParts");
const MULTIPLIER: BinHash = named("mMultiplier");
const DISPLAY_AS_PERCENT: BinHash = named("mDisplayAsPercent");
const PRECISION: BinHash = named("mPrecision");
const MODIFIED: BinHash = named("mModifiedGameCalculation");
const DEFAULT_CALCULATION: BinHash = named("mDefaultGameCalculation");
const CONDITIONAL: BinHash = named("mConditionalGameCalculation");
const CALCULATION_KEY: BinHash = named("mSpellCalculationKey");

const NAMED_DATA_VALUE: BinHash = named("NamedDataValueCalculationPart");
const NUMBER: BinHash = named("NumberCalculationPart");
const EFFECT_VALUE_PART: BinHash = named("EffectValueCalculationPart");
const SUM: BinHash = named("SumOfSubPartsCalculationPart");
const PRODUCT: BinHash = named("ProductOfSubPartsCalculationPart");
const CLAMP: BinHash = named("ClampSubPartsCalculationPart");
const BY_LEVEL: BinHash = named("ByCharLevelInterpolationCalculationPart");
const BY_LEVEL_BREAKPOINTS: BinHash = named("ByCharLevelBreakpointsCalculationPart");
const BY_LEVEL_FORMULA: BinHash = named("ByCharLevelFormulaCalculationPart");
const COOLDOWN_MULTIPLIER: BinHash = named("CooldownMultiplierCalculationPart");
/// The unnamed parts that grow a named data value by level, from `LEVEL_1_DATA_VALUE`.
const BY_LEVEL_DATA_VALUES: [BinHash; 2] = [BinHash(0x4ce0_8984), BinHash(0xb226_09db)];
/// The unnamed part that interpolates by level from `START_DATA_VALUE` to `EndDataValue`.
const BY_LEVEL_INTERPOLATED_DATA_VALUE: BinHash = BinHash(0xee18_a47b);
/// The unnamed part that reads `DATA_VALUE_OF` from the spell `SOURCE_OBJECT`.
const SOURCE_DATA_VALUE: BinHash = BinHash(0x9e9e_2e5c);
const STAT_BY_COEFFICIENT: BinHash = named("StatByCoefficientCalculationPart");
const STAT_BY_DATA_VALUE: BinHash = named("StatByNamedDataValueCalculationPart");
const STAT_BY_SUB_PART: BinHash = named("StatBySubPartCalculationPart");
const BUFF_BY_COEFFICIENT: BinHash = named("BuffCounterByCoefficientCalculationPart");
const BUFF_BY_DATA_VALUE: BinHash = named("BuffCounterByNamedDataValueCalculationPart");
const RESOURCE_BY_COEFFICIENT: BinHash = named("AbilityResourceByCoefficientCalculationPart");
/// The parts that scale with a stat, a buff count or a buff's time, which a preview with no
/// bonus stats and no buffs reads as 0.
const SCALING: [BinHash; 7] = [
    STAT_BY_COEFFICIENT,
    STAT_BY_DATA_VALUE,
    STAT_BY_SUB_PART,
    BUFF_BY_COEFFICIENT,
    BUFF_BY_DATA_VALUE,
    RESOURCE_BY_COEFFICIENT,
    named("PercentageOfBuffNameElapsed"),
];

const DATA_VALUE: BinHash = named("mDataValue");
const COEFFICIENT: BinHash = named("mCoefficient");
const STAT: BinHash = named("mStat");
const SUBPART: BinHash = named("mSubpart");
const ICON_KEY: BinHash = named("mIconKey");
const SCALING_TAG_KEY: BinHash = named("mScalingTagKey");
const SIMPLE_DISPLAY: BinHash = named("mSimpleTooltipCalculationDisplay");

const STAT_UI_DATA: BinHash = named("mStatUIData");
const MANA_ICON_KEY: BinHash = named("mManaIconKey");
const MANA_SCALING_TAG_KEY: BinHash = named("mManaScalingTagKey");
const NUMBER_STYLE_BONUS: BinHash = named("mNumberStyleBonus");
const NUMBER_STYLE_BONUS_PERCENT: BinHash = named("mNumberStyleBonusPercent");
const DEFAULT_DISPLAY: BinHash = named("mTooltipCalculationExpansion");
/// The display that writes a calculation's number alone, without its scaling.
const NUMBER_ONLY: u8 = 5;
/// The decimals a coefficient shows at most.
const COEFFICIENT_DECIMALS: usize = 3;
const NUMBER_VALUE: BinHash = named("mNumber");
const EFFECT_INDEX: BinHash = named("mEffectIndex");
const SUBPARTS: BinHash = named("mSubparts");
const PART_1: BinHash = named("mPart1");
const PART_2: BinHash = named("mPart2");
const FLOOR: BinHash = named("mFloor");
const CEILING: BinHash = named("mCeiling");
const START_VALUE: BinHash = named("mStartValue");
const LEVEL_1_VALUE: BinHash = named("mLevel1Value");
const FORMULA_VALUES: [BinHash; 2] = [named("values"), named("mValues")];
const LEVEL_1_DATA_VALUE: BinHash = BinHash(0x91d4_04a5);
const START_DATA_VALUE: BinHash = named("StartDataValue");
const SOURCE_OBJECT: BinHash = named("SourceObject");
const DATA_VALUE_OF: BinHash = named("DataValue");

/// A spell's tooltip, composed.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct SpellTooltip {
    /// The spell's name, `keyName`'s text.
    pub name: String,
    /// The tooltip string, in sections.
    pub text: String,
}

/// The objects a spell's tooltip reads beyond the spell: its format, and the spells and
/// objects its values name.
pub(super) trait SpellObjects {
    /// The fields of the object `entry`.
    fn object(&mut self, entry: BinHash) -> Option<Fields>;

    /// The fields of the `SpellObject` whose `mScriptName` is `script`, in any case.
    fn spell(&mut self, script: &str) -> Option<Fields>;
}

/// What a spell's tooltip reads beyond the spell itself.
pub(super) struct SpellContext<'a> {
    /// The key that casts the spell, none for a passive.
    pub hotkey: Option<&'a str>,
    /// The key that casts each of the character's abilities, by its script name.
    pub hotkeys: &'a [(String, &'a str)],
    /// The name of the resource the spell costs, `@AbilityResourceName@`.
    pub resource: Option<&'a str>,
    /// The game's text of a string key.
    pub strings: &'a dyn Fn(&str) -> Option<String>,
    /// How a calculation writes the stats it scales with.
    pub stats: &'a StatsUi,
}

/// How a calculation writes the stats it scales with, from the client's `GlobalStatsUIData`.
#[derive(Debug, Clone, Default)]
pub(super) struct StatsUi {
    stats: HashMap<u8, Scaler>,
    mana: Scaler,
    /// `mNumberStyleBonus`'s text, which one scaling part writes by.
    bonus: String,
    bonus_percent: String,
    /// The display a calculation that names none writes by.
    display: u8,
}

/// The icon and the tag a stat's scaling writes with.
#[derive(Debug, Clone, Default, PartialEq)]
struct Scaler {
    icon: String,
    tag: String,
}

impl StatsUi {
    /// The stats UI data of the `GlobalStatsUIData` with the fields `fields`.
    pub(super) fn read(fields: &Fields, strings: &dyn Fn(&str) -> Option<String>) -> Self {
        let owned = |field| text(fields.get(&field)).unwrap_or_default().to_owned();
        let style = |field| {
            text(fields.get(&field))
                .and_then(strings)
                .unwrap_or_default()
        };

        let mut stats = HashMap::new();
        if let Some(PropertyValueEnum::Map(map)) = fields.get(&STAT_UI_DATA) {
            for (key, value) in map.entries() {
                let Some(Leaf::U8(stat)) = leaf(Some(key)) else {
                    continue;
                };
                let Some(stat_ui) = fields_of(Some(value)) else {
                    continue;
                };
                stats.insert(stat, Scaler::read(stat_ui));
            }
        }

        Self {
            stats,
            mana: Scaler {
                icon: owned(MANA_ICON_KEY),
                tag: owned(MANA_SCALING_TAG_KEY),
            },
            bonus: style(NUMBER_STYLE_BONUS),
            bonus_percent: style(NUMBER_STYLE_BONUS_PERCENT),
            display: number(fields, DEFAULT_DISPLAY).map_or(0, |display| display as u8),
        }
    }

    /// One scaling part as the bonus style writes it, none where the style is unknown.
    fn written(&self, scaling: &Scaling, percent: bool) -> Option<String> {
        let style = if percent {
            &self.bonus_percent
        } else {
            &self.bonus
        };
        if style.is_empty() {
            return None;
        }

        let factor = if percent { 100.0 } else { 1.0 };
        let (opening, closing) = match scaling.scaler.tag.as_str() {
            "" => (String::new(), String::new()),
            tag => (format!("<{tag}>"), format!("</{tag}>")),
        };
        let icon = match scaling.scaler.icon.as_str() {
            "" => String::new(),
            icon => format!("&nbsp;{icon}"),
        };
        Some(
            style
                .replace("@OpeningTag@", &opening)
                .replace(
                    "@Value@",
                    &shown(scaling.coefficient * factor, COEFFICIENT_DECIMALS),
                )
                .replace("@Icon@", &icon)
                .replace("@ClosingTag@", &closing),
        )
    }
}

impl Scaler {
    fn read(fields: &Fields) -> Self {
        let owned = |field| text(fields.get(&field)).unwrap_or_default().to_owned();
        Self {
            icon: owned(ICON_KEY),
            tag: owned(SCALING_TAG_KEY),
        }
    }
}

/// A part of a calculation that scales with a stat, at its coefficient.
#[derive(Debug, Clone, PartialEq)]
struct Scaling {
    coefficient: f64,
    scaler: Scaler,
}

/// The tooltip of the `SpellObject` with the fields `spell`, none where the spell names no
/// tooltip or its format has no `Tooltip` output.
pub(super) fn spell_tooltip(
    spell: &Fields,
    objects: &mut dyn SpellObjects,
    context: &SpellContext<'_>,
) -> Option<SpellTooltip> {
    let data = fields_of(spell.get(&SPELL))?;
    let tooltip = fields_of(fields_of(data.get(&CLIENT_DATA))?.get(&TOOLTIP_DATA))?;
    let format = objects.object(object(tooltip.get(&FORMAT))?)?;

    let own = string_map(tooltip.get(&LOC_KEYS));
    let defaults = string_map(format.get(&INPUT_KEYS));
    let template = (context.strings)(string_map(format.get(&OUTPUT_STRINGS)).get("Tooltip")?)?;

    let key_text = |input: &str| {
        [own.get(input), defaults.get(input)]
            .into_iter()
            .flatten()
            .find(|key| !key.is_empty())
            .and_then(|key| (context.strings)(key))
            .unwrap_or_default()
    };

    let mut text = template;
    for input in own.keys().chain(defaults.keys()) {
        text = text.replace(&format!("@{input}@"), &key_text(input));
    }
    let hotkey = context.hotkey.map(|key| format!("[{key}]"));
    text = text.replace("@keyHotkey@", hotkey.as_deref().unwrap_or_default());
    text = included(&text, context.strings);

    let mut values = Values {
        data,
        hotkey: context.hotkey,
        objects,
        context,
    };
    Some(SpellTooltip {
        name: key_text("keyName"),
        text: filled(&text, |token| values.text(token)),
    })
}

/// `text` with each `{{ Key }}` in place of the text of `Key`, nested includes too.
fn included(text: &str, strings: &dyn Fn(&str) -> Option<String>) -> String {
    let mut text = text.to_owned();
    for _ in 0..DEPTH {
        let Some(open) = text.find("{{") else {
            break;
        };
        let Some(length) = text[open..].find("}}") else {
            break;
        };

        let key = text[open + 2..open + length].trim();
        let found = strings(key).unwrap_or_default();
        text.replace_range(open..open + length + 2, &found);
    }
    text
}

/// `text` with each `@token@` in place of what `resolve` reads for it, and left as written
/// where it reads nothing.
fn filled(text: &str, mut resolve: impl FnMut(&str) -> Option<String>) -> String {
    let mut out = String::with_capacity(text.len());
    let mut rest = text;
    while let Some(open) = rest.find('@') {
        out.push_str(&rest[..open]);
        let after = &rest[open + 1..];
        let Some(close) = after.find('@') else {
            rest = &rest[open..];
            break;
        };

        let name = &after[..close];
        let token = !name.is_empty()
            && name
                .chars()
                .all(|char| char.is_ascii_alphanumeric() || "_.*-:".contains(char));
        if !token {
            out.push('@');
            rest = after;
            continue;
        }

        match resolve(name) {
            Some(value) => out.push_str(&value),
            None => {
                out.push('@');
                out.push_str(name);
                out.push('@');
            }
        }
        rest = &after[close + 1..];
    }
    out.push_str(rest);
    out
}

/// A value token, `[spell.Script:]Name[.precision][*factor]`.
#[derive(Debug, Clone, Copy, PartialEq)]
struct Token<'a> {
    /// The script name of the spell the value is read from, none for the spell itself.
    spell: Option<&'a str>,
    name: &'a str,
    /// The decimals the value shows, none or negative for its own.
    precision: Option<i32>,
    factor: f64,
}

impl<'a> Token<'a> {
    fn parse(token: &'a str) -> Option<Self> {
        let (value, factor) = match token.split_once('*') {
            Some((value, factor)) => (value, factor.parse::<f64>().ok()?),
            None => (token, 1.0),
        };

        let (spell, value) = match value.split_once(':') {
            Some((owner, value)) => {
                let script = owner
                    .get(..6)?
                    .eq_ignore_ascii_case("spell.")
                    .then(|| &owner[6..]);
                (Some(script?), value)
            }
            None => (None, value),
        };

        let (name, precision) = match value.rsplit_once('.') {
            Some((name, digits)) => (name, Some(digits.parse::<i32>().ok()?)),
            None => (value, None),
        };
        Some(Self {
            spell,
            name,
            precision,
            factor,
        })
    }
}

/// A number a value reads as, whether it shows as a percentage, the decimals it shows, and
/// the stats it scales with.
#[derive(Debug, Clone)]
struct Value {
    number: f64,
    percent: bool,
    precision: Option<usize>,
    scaling: Vec<Scaling>,
}

impl Value {
    fn plain(number: f32) -> Self {
        Self {
            number: f64::from(number),
            percent: false,
            precision: None,
            scaling: Vec::new(),
        }
    }
}

/// The values of one spell's data.
struct Values<'a> {
    data: &'a Fields,
    /// The key that casts the spell.
    hotkey: Option<&'a str>,
    objects: &'a mut dyn SpellObjects,
    context: &'a SpellContext<'a>,
}

impl Values<'_> {
    /// The text `@token@` reads.
    fn text(&mut self, token: &str) -> Option<String> {
        let token = Token::parse(token)?;
        let Some(script) = token.spell else {
            return self.shown(&token);
        };

        let spell = self.objects.spell(script)?;
        let hotkey = self
            .context
            .hotkeys
            .iter()
            .find(|(name, _)| name.eq_ignore_ascii_case(script))
            .map(|(_, key)| *key);
        let mut other = Values {
            data: fields_of(spell.get(&SPELL))?,
            hotkey,
            objects: &mut *self.objects,
            context: self.context,
        };
        other.shown(&token)
    }

    fn shown(&mut self, token: &Token<'_>) -> Option<String> {
        match token.name.to_ascii_lowercase().as_str() {
            "hotkey" => return self.hotkey.map(str::to_owned),
            "abilityresourcename" => {
                return Some(self.context.resource.unwrap_or_default().to_owned());
            }
            "spelltags" | "spellmodifierdescriptionappend" => return Some(String::new()),
            _ => {}
        }

        let value = self.value(token.name)?;
        let decimals = match token.precision {
            Some(precision) if precision >= 0 => usize::try_from(precision).ok(),
            _ => value.precision,
        };
        let mut written = shown(value.number * token.factor, decimals.unwrap_or(DECIMALS));
        if value.percent {
            written.push('%');
        }

        /* A template that scales the value writes it alone, as the scaling no longer matches. */
        if token.factor == 1.0 {
            for scaling in &value.scaling {
                if let Some(part) = self.context.stats.written(scaling, value.percent) {
                    written.push(' ');
                    written.push_str(&part);
                }
            }
        }
        Some(written)
    }

    fn value(&mut self, name: &str) -> Option<Value> {
        let data = self.data;
        let lower = name.to_ascii_lowercase();
        match lower.as_str() {
            "cooldown" => {
                let cooldown = ranked(data.get(&COOLDOWN), RANK)
                    .or_else(|| ranked(fields_of(data.get(&COOLDOWN_VALUES))?.get(&VALUES), RANK))
                    .unwrap_or(DEFAULT_COOLDOWN);
                return Some(Value::plain(cooldown));
            }
            /* A cost lists rank 1 first, where every other list holds a rank 0. */
            "cost" => {
                let cost = ranked(data.get(&MANA), RANK - 1)
                    .or_else(|| ranked(fields_of(data.get(&MANA_VALUES))?.get(&VALUES), RANK - 1))
                    .unwrap_or(0.0);
                return Some(Value::plain(cost));
            }
            "ammorechargetime" => {
                return Some(Value::plain(
                    ranked(data.get(&AMMO_RECHARGE), RANK).unwrap_or(0.0),
                ));
            }
            "maxammo" => {
                return Some(Value::plain(
                    ranked(data.get(&MAX_AMMO), RANK).unwrap_or(DEFAULT_MAX_AMMO),
                ));
            }
            _ => {}
        }

        if let Some(value) = self.calculation(named(name), DEPTH) {
            return Some(value);
        }
        if let Some(number) = data_value(data, |own| own.eq_ignore_ascii_case(name)) {
            return Some(Value::plain(number));
        }
        if let Some(index) = lower
            .strip_prefix("effect")
            .and_then(|rest| rest.strip_suffix("amount"))
            .and_then(|index| index.parse::<usize>().ok())
        {
            return effect(data, index).map(Value::plain);
        }

        /* A spell's script sets `@f1@` and its kin as it runs, so no data holds them. */
        let script_set = lower.strip_prefix('f').is_some_and(|index| {
            !index.is_empty() && index.bytes().all(|byte| byte.is_ascii_digit())
        });
        script_set.then(|| Value::plain(0.0))
    }

    /// The calculation `mSpellCalculations` holds under `key`.
    fn calculation(&mut self, key: BinHash, depth: usize) -> Option<Value> {
        let depth = depth.checked_sub(1)?;
        let PropertyValueEnum::Map(map) = self.data.get(&CALCULATIONS)? else {
            return None;
        };
        let (_, found) = map
            .entries()
            .iter()
            .find(|(name, _)| matches!(leaf(Some(name)), Some(Leaf::Hash(hash)) if hash == key))?;
        let (class, fields) = struct_of(Some(found))?;

        match class {
            CALCULATION => {
                let percent = flag(fields, DISPLAY_AS_PERCENT).unwrap_or(false);
                let parts = items(fields.get(&FORMULA_PARTS));
                let multiplier = self.multiplier(fields, depth)?;
                let total =
                    self.parts(parts, depth)? * multiplier * if percent { 100.0 } else { 1.0 };
                let precision = number(fields, PRECISION)
                    .filter(|precision| *precision > 0.0)
                    .map(|precision| precision as usize);

                let display = number(fields, SIMPLE_DISPLAY)
                    .map_or(self.context.stats.display, |display| display as u8);
                let mut scaling = Vec::new();
                if display != NUMBER_ONLY {
                    self.scaling(parts, multiplier, depth, &mut scaling);
                }
                Some(Value {
                    number: total,
                    percent,
                    precision,
                    scaling,
                })
            }
            MODIFIED_CALCULATION => {
                let value = self.calculation(object(fields.get(&MODIFIED))?, depth)?;
                let multiplier = self.multiplier(fields, depth)?;
                let scaling = value
                    .scaling
                    .into_iter()
                    .map(|scaling| Scaling {
                        coefficient: scaling.coefficient * multiplier,
                        ..scaling
                    })
                    .collect();
                Some(Value {
                    number: value.number * multiplier,
                    scaling,
                    ..value
                })
            }
            /* A preview holds no buffs, so a condition reads as unmet where it has a default. */
            CONDITIONAL_CALCULATION => {
                let chosen = object(fields.get(&DEFAULT_CALCULATION))
                    .or_else(|| object(fields.get(&CONDITIONAL)))?;
                self.calculation(chosen, depth)
            }
            _ => None,
        }
    }

    /// The parts of `parts` that scale with a stat, through sums, each at its coefficient
    /// times `multiplier`.
    fn scaling(
        &mut self,
        parts: &[PropertyValueEnum],
        multiplier: f64,
        depth: usize,
        found: &mut Vec<Scaling>,
    ) {
        let Some(depth) = depth.checked_sub(1) else {
            return;
        };

        for part in parts {
            let Some((class, fields)) = struct_of(Some(part)) else {
                continue;
            };
            if class == SUM {
                self.scaling(items(fields.get(&SUBPARTS)), multiplier, depth, found);
                continue;
            }

            let Some((coefficient, scaler)) = self.scaled(class, fields, depth) else {
                continue;
            };
            if coefficient != 0.0 {
                found.push(Scaling {
                    coefficient: coefficient * multiplier,
                    scaler,
                });
            }
        }
    }

    /// The coefficient of a part that scales with a stat, and the stat's icon and tag.
    fn scaled(&mut self, class: BinHash, fields: &Fields, depth: usize) -> Option<(f64, Scaler)> {
        let stats = self.context.stats;
        let stat = || {
            let stat = number(fields, STAT).map_or(0, |stat| stat as u8);
            stats.stats.get(&stat).cloned()
        };
        let data_value = |data| named_data_value(data, object(fields.get(&DATA_VALUE))?);
        let coefficient = || f64::from(number(fields, COEFFICIENT).unwrap_or(0.0));

        match class {
            STAT_BY_COEFFICIENT => Some((coefficient(), stat()?)),
            STAT_BY_DATA_VALUE => Some((data_value(self.data)?, stat()?)),
            STAT_BY_SUB_PART => Some((self.sub(fields, SUBPART, depth)?, stat()?)),
            RESOURCE_BY_COEFFICIENT => Some((coefficient(), stats.mana.clone())),
            BUFF_BY_COEFFICIENT | BUFF_BY_DATA_VALUE => {
                let scaler = Scaler::read(fields);
                if scaler.icon.is_empty() {
                    return None;
                }
                let value = match class {
                    BUFF_BY_COEFFICIENT => coefficient(),
                    _ => data_value(self.data)?,
                };
                Some((value, scaler))
            }
            _ => None,
        }
    }

    fn multiplier(&mut self, fields: &Fields, depth: usize) -> Option<f64> {
        match struct_of(fields.get(&MULTIPLIER)) {
            Some(part) => self.part(part, depth),
            None => Some(1.0),
        }
    }

    fn parts(&mut self, parts: &[PropertyValueEnum], depth: usize) -> Option<f64> {
        let mut total = 0.0;
        for part in parts {
            total += self.part(struct_of(Some(part))?, depth)?;
        }
        Some(total)
    }

    fn sub(&mut self, fields: &Fields, field: BinHash, depth: usize) -> Option<f64> {
        self.part(struct_of(fields.get(&field))?, depth)
    }

    /// One formula part at character level 1, none for a kind the preview does not read.
    fn part(&mut self, (class, fields): (BinHash, &Fields), depth: usize) -> Option<f64> {
        let depth = depth.checked_sub(1)?;
        let data = self.data;
        let or_zero = |field| f64::from(number(fields, field).unwrap_or(0.0));

        if let Some(key) = object(fields.get(&CALCULATION_KEY)) {
            return Some(self.calculation(key, depth)?.number);
        }

        match class {
            NAMED_DATA_VALUE => named_data_value(data, object(fields.get(&DATA_VALUE))?),
            NUMBER => Some(or_zero(NUMBER_VALUE)),
            EFFECT_VALUE_PART => {
                let index = usize::try_from(number(fields, EFFECT_INDEX)? as i64).ok()?;
                effect(data, index).map(f64::from)
            }
            SUM => self.parts(items(fields.get(&SUBPARTS)), depth),
            PRODUCT => Some(self.sub(fields, PART_1, depth)? * self.sub(fields, PART_2, depth)?),
            CLAMP => {
                let mut total = self.parts(items(fields.get(&SUBPARTS)), depth)?;
                if let Some(floor) = number(fields, FLOOR) {
                    total = total.max(f64::from(floor));
                }
                if let Some(ceiling) = number(fields, CEILING) {
                    total = total.min(f64::from(ceiling));
                }
                Some(total)
            }
            BY_LEVEL => Some(or_zero(START_VALUE)),
            BY_LEVEL_BREAKPOINTS => Some(or_zero(LEVEL_1_VALUE)),
            BY_LEVEL_FORMULA => {
                let values = FORMULA_VALUES.iter().find_map(|field| fields.get(field));
                Some(f64::from(ranked(values, 0).unwrap_or(0.0)))
            }
            COOLDOWN_MULTIPLIER => Some(1.0),
            class if BY_LEVEL_DATA_VALUES.contains(&class) => {
                named_data_value(data, object(fields.get(&LEVEL_1_DATA_VALUE))?)
            }
            BY_LEVEL_INTERPOLATED_DATA_VALUE => {
                named_data_value(data, object(fields.get(&START_DATA_VALUE))?)
            }
            SOURCE_DATA_VALUE => {
                let source = self.objects.object(object(fields.get(&SOURCE_OBJECT))?)?;
                named_data_value(
                    fields_of(source.get(&SPELL))?,
                    object(fields.get(&DATA_VALUE_OF))?,
                )
            }
            class if SCALING.contains(&class) => Some(0.0),
            _ => None,
        }
    }
}

/// The value at rank 1 of the data value of `data` whose name `matches`.
fn data_value(data: &Fields, matches: impl Fn(&str) -> bool) -> Option<f32> {
    items(data.get(&DATA_VALUES)).iter().find_map(|item| {
        let fields = fields_of(Some(item))?;
        matches(text(fields.get(&DATA_VALUE_NAME))?)
            .then(|| ranked(fields.get(&VALUES), RANK))
            .flatten()
    })
}

/// The value at rank 1 of the data value of `data` whose name hashes to `hash`. A part reads one
/// the spell does not hold as 0, as a mode that adds it to the spell does elsewhere.
fn named_data_value(data: &Fields, hash: BinHash) -> Option<f64> {
    Some(data_value(data, |own| named(own) == hash).map_or(0.0, f64::from))
}

/// `mEffectAmount`'s list `index`, counting from 1, at rank 1.
fn effect(data: &Fields, index: usize) -> Option<f32> {
    let effect = items(data.get(&EFFECT_AMOUNT)).get(index.checked_sub(1)?)?;
    ranked(fields_of(Some(effect))?.get(&EFFECT_VALUE), RANK)
}

/// The `rank`th value of a list of numbers, its last where the list is shorter.
fn ranked(value: Option<&PropertyValueEnum>, rank: usize) -> Option<f32> {
    let values: Vec<f32> = items(value)
        .iter()
        .filter_map(|item| match leaf(Some(item))? {
            Leaf::F32(value) if value.is_finite() => Some(value),
            Leaf::I32(value) => Some(value as f32),
            _ => None,
        })
        .collect();
    values.get(rank).or(values.last()).copied()
}

/// A number as a tooltip shows it: at most `decimals` decimals, with none trailing.
fn shown(number: f64, decimals: usize) -> String {
    let fixed = format!("{number:.*}", decimals.min(MAX_DECIMALS));
    let trimmed = if fixed.contains('.') {
        fixed.trim_end_matches('0').trim_end_matches('.')
    } else {
        &fixed
    };
    match trimmed {
        "-0" => "0".to_owned(),
        other => other.to_owned(),
    }
}

/// A `map[string, string]` field's entries.
fn string_map(value: Option<&PropertyValueEnum>) -> HashMap<String, String> {
    let Some(PropertyValueEnum::Map(map)) = value else {
        return HashMap::new();
    };
    map.entries()
        .iter()
        .filter_map(|(key, value)| {
            Some((text(Some(key))?.to_owned(), text(Some(value))?.to_owned()))
        })
        .collect()
}

#[cfg(test)]
mod tests;
