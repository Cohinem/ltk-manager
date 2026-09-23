# Sejuani spell fixtures

Inspected on 2026-09-15 for stage 1 of [Ability preview](../plans/ability-preview.md).

## Source

- Installed executable product version: `16.18.817.5716`
- Archive: `Game/DATA/FINAL/Champions/Sejuani.wad.client`
- Archive SHA-256: `1f7da5d5915672e794409f8c0da8042efa5183ebc675072dc28e526a7bf14273`
- Spell declaration chunk: `0xf52e1e9b6b8b7550`
- Schema: meta-cli queries pinned to `16.17`, build `8104348`, dataset generated `2026-08-24T03:56:00Z`

Values come from the installed archive through the existing `dump_vfx` example. The schema
names were resolved with `@leaguetoolkit/meta-cli@1`. The schema predates the installed build.
The report describes written values and class identities, without inferring missing defaults or
claiming an observed game playback match.

## Discovery

`Characters/Sejuani/Spells/SejuaniEAbility` is an `AbilityObject`, hash `0x86d08002`.
Its eight named descendants are `SpellObject` declarations in the same chunk:

| Spell                  | Object hash  | Written animation | Written cast time    | Written total time |
| ---------------------- | ------------ | ----------------- | -------------------- | ------------------ |
| SejuaniE               | `0x52772553` | Empty string      | `0`                  | `0`                |
| SejuaniE2              | `0x328fd7b3` | `Spell4`          | `0.25`               | `0.5`              |
| SejuaniECD             | `0x68f7be1c` | `Spell2_impact`   | `0.3461499810218811` | Absent             |
| SejuaniEMarker         | `0x8200d591` | `Spell2_impact`   | `0.3461499810218811` | Absent             |
| SejuaniEMarkerMax      | `0xc2978695` | `Spell2_impact`   | `0.3461499810218811` | Absent             |
| SejuaniEPassive        | `0x7a53274c` | No spell payload  | No spell payload     | No spell payload   |
| SejuaniEPassiveBuff    | `0x5e275ef5` | No spell payload  | No spell payload     | No spell payload   |
| SejuaniEPassiveMissile | `0x859d7934` | Empty string      | `0.25`               | `0.5`              |

The timing columns name `spellCastTime` and `spellTotalTime`. Their units and precedence in
the preview still need a playback reference. Discovery retains the buff-like objects even
where they have no `mSpell` payload. Selecting such an object must not fabricate one.

## Passive missile

Object: `Characters/Sejuani/Spells/SejuaniEAbility/SejuaniEPassiveMissile`.

| Field                                 | Written value                                                |
| ------------------------------------- | ------------------------------------------------------------ |
| `mScriptName`                         | `SejuaniEPassiveMissile`                                     |
| `mSpell` class                        | `SpellDataResource`, `0x43368569`                            |
| `mAnimationName`                      | Empty string                                                 |
| `spellCastTime`                       | `0.25`                                                       |
| `spellTotalTime`                      | `0.5`                                                        |
| `castFrame`                           | `7.5`                                                        |
| `useAnimatorFramerate`                | `true`                                                       |
| `missileSpeed`                        | `5000`                                                       |
| `mMissileSpec` class                  | `MissileSpecification`, `0xbffcb1fc`                         |
| `movementComponent` class             | `FixedSpeedMovement`, `0x06302899`                           |
| Movement `mSpeed`                     | `5000`                                                       |
| Movement `mTargetBoneName`            | `r_hand`                                                     |
| Movement `mTargetHeightAugment`       | `100`                                                        |
| Movement `mOffsetInitialTargetHeight` | `100`                                                        |
| `verticalFacing` class                | `VeritcalFacingMatchVelocity`, `0xece61617`                  |
| First behavior                        | `CastOnMovementComplete`, `0x9dac1d45`, no written fields    |
| Second behavior                       | `DestroyOnMovementComplete`, `0xfb0dfd42`, no written fields |

`VeritcalFacingMatchVelocity` preserves the schema's spelling.

The record has no written `Script` link, missile-effect key or name, hit-effect key or name,
`mResourceResolvers`, or `mParticleStartOffset`. The movement has no written `mStartBoneName`,
`mStartDelay` or `mTracksTarget`. The missile specification has no written height solver,
visibility component, group spawners or width.

The arrival-cast behavior carries no field naming its child spell. Matching another spell by
name or path alone would be an assumption. The empty animation name also prevents treating
this child as an ordinary character cast.

## Other components and the base skin

`SejuaniE2` also has `FixedSpeedMovement`. Its movement speed is `2000`, both height values are
`100`, and its facing and two arrival behaviors match the passive missile. It has no written
missile-effect key or name. Its `Spell4` animation name does not establish an E-slot animation
mapping for the preview.

`SejuaniECD`, `SejuaniEMarker` and `SejuaniEMarkerMax` each write `castFrame = 12` and
`mHitEffectKey = 0xaff315f7`. The resolver reached from `Characters/Sejuani/Skins/Skin0` is
object `0xd85a82d4`. Its resource map contains 54 entries, including:

| Effect key   | Referenced system object |
| ------------ | ------------------------ |
| `0xaff315f7` | `0xd793bbad`             |

This verifies a key-to-object mapping. The referenced system was not loaded or visually checked
for this report. The different hashes also provide a concrete fixture against treating an
effect key as a system identity.

## Playback gates

1. Keep the passive missile as a movement fixture. Resolve its flight effect through additional
   script or resource evidence, or an explicit user choice.
2. Determine what `CastOnMovementComplete` invokes when its block has no written fields.
3. Verify the target-bone and two height offsets together against observed playback.
4. Compare another spell with explicit effect references before selecting a complete cast
   fixture. This E group does not yet establish an automatic full sequence.

## Reproduction

The stage 2 reader was run against this same archive with `--spell`. Its projection retained
speed `5000`, missing start delay and bone, target bone `r_hand` and both height values `100`.
It returned no flight-effect key or name and reported `verticalFacing` and `behaviors` as
unsupported. With explicit points 1000 units apart, the motion test reaches its endpoint in
0.2 seconds. The particle tests cover repeatable replay and emission stop using a synthetic
effect, so they do not establish the passive missile's actual effect or in-game placement.

The existing example reads any bin object despite its VFX name:

```powershell
cargo run -p ltk-manager-core --example dump_vfx -- `
  "C:/Riot Games/League of Legends/Game/DATA/FINAL/Champions/Sejuani.wad.client" `
  "*" "Characters/Sejuani/Spells/SejuaniEAbility/SejuaniEPassiveMissile" --json
```

For the discovery list, use `"*" "*" "Characters/Sejuani/Spells/SejuaniEAbility"` after the
archive path. The example prints declaring chunk hashes and resolves names through the app's
hashtables. No archive is modified.
