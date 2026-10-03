//! A character at a level, and the formula parts that grow with it, per "Levels" in
//! docs/research/ui-data-layout.md.

use std::collections::HashMap;

use ltk_hash::BinHash;
use ltk_manager_bin::bin_document::{Fields, fields_of, items, leaf};
use ltk_meta::walk::Leaf;

use crate::fields::named;
use crate::resolver::{flag, number};

/// The level a calculation grows to, the client's own where no rules object sets one.
pub(crate) const MAX_LEVEL: u8 = 18;
/// The level of the character the client reads with no character at all.
const STUB_LEVEL: u8 = 1;

const ARMOR: u8 = 1;
const ATTACK_DAMAGE: u8 = 2;
const ATTACK_SPEED: u8 = 4;
const MAGIC_RESIST: u8 = 6;
const MOVE_SPEED: u8 = 7;
const HEALTH: u8 = 12;
const ATTACK_RANGE: u8 = 31;

/// `mStatFormula`'s value for what lies over a stat's base, beside 0 for all of it and 1 for
/// its base.
pub(crate) const FORMULA_BONUS: u8 = 2;

const VALUE: BinHash = named("baseValue");
const PRIMARY_RESOURCE: BinHash = named("primaryAbilityResource");
const RESOURCE_BASE: BinHash = BinHash(0x726e_e5cd);
const RESOURCE_PER_LEVEL: BinHash = BinHash(0x6216_bf7b);
const ATTACK_SPEED_BASE: BinHash = named("attackSpeedModifiable");
const ATTACK_SPEED_PER_LEVEL: BinHash = named("attackSpeedPerLevelModifiable");

/// The record fields of each stat that grows by level: its base, and its growth per level.
const GROWING: [(u8, BinHash, Option<BinHash>); 6] = [
    (
        HEALTH,
        named("baseHPModifiable"),
        Some(named("hpPerLevelModifiable")),
    ),
    (
        ATTACK_DAMAGE,
        named("baseDamageModifiable"),
        Some(named("damagePerLevelModifiable")),
    ),
    (
        ARMOR,
        named("baseArmorModifiable"),
        Some(named("armorPerLevelModifiable")),
    ),
    (MAGIC_RESIST, named("baseMR"), Some(named("mrPerLevel"))),
    (MOVE_SPEED, named("baseMoveSpeedModifiable"), None),
    (ATTACK_RANGE, named("attackRangeModifiable"), None),
];

const INTERPOLATION: BinHash = named("ByCharLevelInterpolationCalculationPart");
const BREAKPOINTS: BinHash = named("ByCharLevelBreakpointsCalculationPart");
const FORMULA: BinHash = named("ByCharLevelFormulaCalculationPart");
/// The unnamed parts that grow data values by level: by breakpoints, by a step per level, and
/// between a start and an end.
const BREAKPOINT_DATA_VALUES: BinHash = BinHash(0x4ce0_8984);
const LINEAR_DATA_VALUES: BinHash = BinHash(0xb226_09db);
const INTERPOLATED_DATA_VALUES: BinHash = BinHash(0xee18_a47b);

const START_VALUE: BinHash = named("mStartValue");
const END_VALUE: BinHash = named("mEndValue");
const BY_STAT_PROGRESSION: BinHash = named("mScaleByStatProgressionMultiplier");
const PAST_MAX_LEVEL: BinHash = named("mScalePastDefaultMaxLevel");
const LEVEL_1_VALUE: BinHash = named("mLevel1Value");
const INITIAL_BONUS: BinHash = named("mInitialBonusPerLevel");
const BREAKPOINT_LIST: BinHash = named("mBreakpoints");
const BREAKPOINT_LEVEL: BinHash = named("mLevel");
const BREAKPOINT_BONUS: BinHash = named("mAdditionalBonusAtThisLevel");
const BREAKPOINT_PER_LEVEL: BinHash = named("mBonusPerLevelAtAndAfter");
const FORMULA_VALUES: BinHash = named("values");

const DV_LEVEL_1: BinHash = BinHash(0x91d4_04a5);
const DV_PER_LEVEL: BinHash = BinHash(0xb2cd_0eb0);
const DV_INITIAL_BONUS: BinHash = BinHash(0xbbd7_78a2);
const DV_BREAKPOINTS: BinHash = BinHash(0x9823_b29a);
const DV_BREAKPOINT_LEVEL: BinHash = named("level");
const DV_BREAKPOINT_BONUS: BinHash = BinHash(0xae9b_464d);
const DV_BREAKPOINT_PER_LEVEL: BinHash = BinHash(0xb0d8_b2ac);
const DV_START: BinHash = named("StartDataValue");
const DV_END: BinHash = named("EndDataValue");

/// The character a tooltip's calculations read: its level and its stats there, with no items.
#[derive(Debug, Clone, PartialEq)]
pub(crate) struct Character {
    level: u8,
    stats: HashMap<u8, f64>,
    resource: f64,
}

impl Character {
    /// The client's stand-in where there is no character: level 1, every stat 0.
    pub(crate) fn none() -> Self {
        Self {
            level: STUB_LEVEL,
            stats: HashMap::new(),
            resource: 0.0,
        }
    }

    /// The character whose record has the fields `record` at `level`, from 1 to `MAX_LEVEL`.
    /// Level 0 is `none`.
    pub(crate) fn at(record: Option<&Fields>, level: u8) -> Self {
        if level == 0 {
            return Self::none();
        }

        let level = level.min(MAX_LEVEL);
        let Some(record) = record else {
            return Self {
                level,
                ..Self::none()
            };
        };

        let growth = progression(level);
        let read = |fields: &Fields, field| modifiable(fields, field).unwrap_or(0.0);
        let mut stats = HashMap::new();
        for (stat, base, per_level) in GROWING {
            let per_level = per_level.map_or(0.0, |field| read(record, field));
            stats.insert(stat, read(record, base) + per_level * growth);
        }

        let speed = read(record, ATTACK_SPEED_BASE);
        let speed_growth = read(record, ATTACK_SPEED_PER_LEVEL) / 100.0;
        stats.insert(ATTACK_SPEED, speed * (1.0 + speed_growth * growth));

        let resource = fields_of(record.get(&PRIMARY_RESOURCE)).map_or(0.0, |resource| {
            read(resource, RESOURCE_BASE) + read(resource, RESOURCE_PER_LEVEL) * growth
        });
        Self {
            level,
            stats,
            resource,
        }
    }

    pub(crate) fn level(&self) -> u8 {
        self.level
    }

    /// `stat` as `formula` reads it. With no items a stat is all base, so its bonus is 0.
    pub(crate) fn stat(&self, stat: u8, formula: u8) -> f64 {
        if formula == FORMULA_BONUS {
            return 0.0;
        }

        self.stats.get(&stat).copied().unwrap_or(0.0)
    }

    /// The most of the primary resource the character holds.
    pub(crate) fn resource(&self) -> f64 {
        self.resource
    }
}

/// The data values a level part reads, by the field naming one.
pub(crate) trait DataValues {
    /// The data value `fields` names under `field`, 0 where it names none or the spell lacks it.
    fn named(&self, fields: &Fields, field: BinHash) -> f64;
}

/// Whether a part of class `class` grows with the character's level.
pub(crate) fn grows(class: BinHash) -> bool {
    [
        INTERPOLATION,
        BREAKPOINTS,
        FORMULA,
        BREAKPOINT_DATA_VALUES,
        LINEAR_DATA_VALUES,
        INTERPOLATED_DATA_VALUES,
    ]
    .contains(&class)
}

/// A part that grows with the character's level, at `level`. None for any other class.
pub(crate) fn level_part(
    class: BinHash,
    fields: &Fields,
    level: u8,
    data: &dyn DataValues,
) -> Option<f64> {
    let value = |field| f64::from(number(fields, field).unwrap_or(0.0));

    match class {
        INTERPOLATION => Some(interpolated(
            value(START_VALUE),
            value(END_VALUE),
            level,
            flag(fields, BY_STAT_PROGRESSION).unwrap_or(false),
            flag(fields, PAST_MAX_LEVEL).unwrap_or(true),
        )),
        INTERPOLATED_DATA_VALUES => Some(interpolated(
            data.named(fields, DV_START),
            data.named(fields, DV_END),
            level,
            false,
            true,
        )),
        BREAKPOINTS => {
            let points = breakpoint_list(fields, BREAKPOINT_LIST, |point| Breakpoint {
                level: number(point, BREAKPOINT_LEVEL).unwrap_or(0.0) as i32,
                bonus: f64::from(number(point, BREAKPOINT_BONUS).unwrap_or(0.0)),
                per_level: f64::from(number(point, BREAKPOINT_PER_LEVEL).unwrap_or(0.0)),
            });
            Some(stepped(
                value(LEVEL_1_VALUE),
                value(INITIAL_BONUS),
                &points,
                level,
            ))
        }
        BREAKPOINT_DATA_VALUES => {
            let points = breakpoint_list(fields, DV_BREAKPOINTS, |point| Breakpoint {
                level: number(point, DV_BREAKPOINT_LEVEL).unwrap_or(0.0) as i32,
                bonus: data.named(point, DV_BREAKPOINT_BONUS),
                per_level: data.named(point, DV_BREAKPOINT_PER_LEVEL),
            });
            let level_1 = data.named(fields, DV_LEVEL_1);
            let initial = data.named(fields, DV_INITIAL_BONUS);
            Some(stepped(level_1, initial, &points, level))
        }
        LINEAR_DATA_VALUES => {
            let levels = f64::from(level.max(1) - 1);
            Some(data.named(fields, DV_LEVEL_1) + levels * data.named(fields, DV_PER_LEVEL))
        }
        FORMULA => {
            let values = items(fields.get(&FORMULA_VALUES));
            let at = values.get(usize::from(level)).or(values.last());
            Some(match leaf(at) {
                Some(Leaf::F32(value)) => f64::from(value),
                _ => 0.0,
            })
        }
        _ => None,
    }
}

struct Breakpoint {
    level: i32,
    bonus: f64,
    per_level: f64,
}

fn breakpoint_list(
    fields: &Fields,
    field: BinHash,
    read: impl Fn(&Fields) -> Breakpoint,
) -> Vec<Breakpoint> {
    items(fields.get(&field))
        .iter()
        .filter_map(|point| fields_of(Some(point)))
        .map(read)
        .collect()
}

fn interpolated(start: f64, end: f64, level: u8, by_progression: bool, past_max: bool) -> f64 {
    let level = if past_max {
        level
    } else {
        level.min(MAX_LEVEL)
    };
    let reached = if by_progression {
        progression(level)
    } else {
        f64::from(level.max(1) - 1)
    };
    let share = reached / f64::from(MAX_LEVEL - 1);
    start * (1.0 - share) + end * share
}

fn stepped(level_1: f64, initial: f64, points: &[Breakpoint], level: u8) -> f64 {
    let level = i32::from(level);
    let mut value = level_1;
    let mut reached = 1;
    let mut rate = initial;
    for point in points.iter().filter(|point| point.level <= level) {
        value += f64::from(point.level - 1 - reached) * rate + point.bonus;
        reached = point.level - 1;
        rate = point.per_level;
    }
    if level > reached {
        value += f64::from(level - reached) * rate;
    }
    value
}

/// How far a stat has grown at `level`, from 0 at level 1 to `MAX_LEVEL - 1` at the top.
///
/// The client's own curve was not found in the binary. This is the curve the game is known to
/// grow stats by, and it reaches `MAX_LEVEL - 1` at `MAX_LEVEL` as the interpolation needs.
fn progression(level: u8) -> f64 {
    let past = f64::from(level.max(1) - 1);
    past * (0.7025 + 0.0175 * past)
}

/// A `ModifiableFloat`'s base value, or a plain float field.
fn modifiable(fields: &Fields, field: BinHash) -> Option<f64> {
    let value = fields_of(fields.get(&field))
        .and_then(|inner| number(inner, VALUE))
        .or_else(|| number(fields, field))?;
    Some(f64::from(value))
}
