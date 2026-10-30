# `ltk-manager-audio` fixtures

Shipped files of the retail 16.x client. The banks and the package are copied from the `ltk_wwise`
0.1.0 test fixtures (`crates/ltk_wwise/tests/fixtures` in LeagueToolkit/league-toolkit).

| File                 | Source                                     | Shape                                                 |
| -------------------- | ------------------------------------------ | ----------------------------------------------------- |
| `media_v134.bnk`     | `Companions.wad.client` `27e235d8d6599498` | version 134, alignment 0, `BKHD` `DIDX` `DATA`        |
| `media_v145.bnk`     | `Map22.wad.client`                         | version 145, `BKHD` `DIDX` `DATA`, one media          |
| `events_v134.bnk`    | `Map22.wad.client` `8fc9adcb677d5298`      | version 134, `BKHD` `HIRC`, kinds 2, 3, 4, 5, 7, 14   |
| `events_v145.bnk`    | `Map22.wad.client`                         | version 145, `BKHD` `HIRC`, kinds 2, 3, 4, 5, 7, 14   |
| `package.wpk`        | `Map22.wad.client` `1009b74f7b2ce352`      | `r3d2` version 1, two WEM entries                     |
| `clipped_vorbis.wem` | `Ahri.wad.client`, source ID 127311        | Wwise Vorbis whose first packets clip at `i16` bounds |

`media_v145.bnk` holds every data bank source of `events_v145.bnk`.

`events_v134.bnk` is also `LEGACY_EVENT_BANK` in the `test_util` of `ltk-manager-assets`, which
the tests of the audio Problems rules read.
