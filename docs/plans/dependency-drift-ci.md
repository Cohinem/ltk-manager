# Dependency drift across the LTK stack — CI proposals

> Status: **proposed** (2026-08-26). Nothing here is implemented.
>
> Written after `ltk_wad` 0.5.3 reached ltk-manager while league-mod's CI was still building
> against 0.5.1, which is how a fantome import lost packed-WAD chunk names for three releases
> without anything going red.

Three separate problems answer to the name "version drift", and they take different fixes.
Conflating them is what makes the whole thing feel unsolvable.

| Problem                   | What it is                                                     | Fixed by |
| ------------------------- | -------------------------------------------------------------- | -------- |
| **Floor drift**           | Two repos declaring different minimums for the same crate      | 1        |
| **Lockfile drift**        | What CI tests against vs. what a consumer resolving today gets | 1, 2     |
| **Release-chain latency** | A fix upstream needs three hops to reach the app               | 3        |

## The stack

`ltk-manager` consumes four crates that `league-mod` publishes (`ltk_fantome`, `ltk_modpkg`,
`ltk_mod_project`, `ltk_overlay`). Both repos then consume the format crates on top of that
(`ltk_wad`, `ltk_file`, `ltk_hash`, `ltk_meta`, `ltk_texture`, `ltk_io_ext`), and ltk-manager
alone pins two git revs (`ritoclient`, and `ltk_hashdb` + `ltk_mimir_cache` from mimir).

Neither repo has Renovate, Dependabot, or any other dependency automation today.

### Floors that disagree, as of writing

| Crate      | league-mod | ltk-manager |
| ---------- | ---------- | ----------- |
| `ltk_file` | `0.2.8`    | `0.2.11`    |
| `ltk_rst`  | `0.2.0`    | `0.2.1`     |
| `ltk_wad`  | `0.5.3`    | `0.5.3`     |

These are caret requirements, so the resolver unifies them and nothing breaks. What they cost is
honesty: the declared floor is meant to say "the oldest version this is tested against", and
neither number was ever chosen deliberately.

## The root cause of lockfile drift

The two CI configs are asymmetric, and each is pinned the wrong way round.

- **league-mod** runs `cargo clippy --locked`, `cargo test --locked` and `cargo build --locked`.
  Fully pinned, so it only ever tests the exact lockfile. This is why 0.5.1 sat in the lock while
  0.5.2 and 0.5.3 shipped.
- **ltk-manager** runs `cargo test --all-features` and `cargo build --release` with no `--locked`
  anywhere, so a release build can resolve differently from the committed lock and say nothing.

The library is where forward compatibility needs proving. The app is where reproducible builds
matter. Each repo has the other one's setting.

The net effect is that **nothing in the stack exercises what a consumer resolving fresh would
get**, which is the hole `ltk_wad` 0.5.3 fell through.

## Proposals, in priority order

### 1. Renovate on both repos, with `ltk_*` grouped into one PR

Highest value for the least work, and it closes floor drift as a side effect.

Grouping is the substance of it, not a tidiness preference. `ltk_mod_project` re-exports
`ltk_fantome` types, and `ltk_overlay` and `ltk_mod_project` have to agree on `ltk_wad`. Five
separate PRs are each green in isolation and prove nothing about the set. One PR moving the family
together gets one CI run that proves the set is coherent.

`rangeStrategy: "bump"` is what ends floor drift: the declared minimum moves with the lock, so it
always names a version that was actually tested.

```json
{
  "$schema": "https://docs.renovatebot.com/renovate-schema.json",
  "extends": ["config:recommended"],
  "packageRules": [
    {
      "matchPackagePatterns": ["^ltk_"],
      "groupName": "LTK crates",
      "rangeStrategy": "bump"
    },
    {
      "matchPackageNames": ["ltk_hashdb", "ltk_mimir_cache"],
      "groupName": "mimir"
    }
  ]
}
```

The second rule is a real constraint, not housekeeping. `ltk_mimir_cache` hands back `ltk_hashdb`
types, so the two revs must move together. That is written as a comment in ltk-manager's
`Cargo.toml` today and nothing enforces it. Renovate also handles git-rev pins, which is why it is
the choice over Dependabot — `ritoclient` and the mimir pair are all revs.

### 2. Fix the CI asymmetry

Two edits and one new job:

- Add `--locked` to ltk-manager's `cargo test`, `cargo clippy` and `cargo build --release` steps
  in `.github/workflows/ci.yml`.
- Add to **both** repos a scheduled, non-blocking job that runs `cargo update` and then the test
  suite. This is the "does today's ecosystem still work" canary, and it is the job that would have
  caught the `ltk_wad` gap.

Non-blocking matters. A red canary means the world moved, not that the PR is bad, and a job that
blocks merges on somebody else's release gets disabled within a month.

### 3. A `[patch.crates-io]` canary in ltk-manager

A scheduled workflow that patches the `ltk_*` crates to league-mod's `main` and runs the suite:

```toml
[patch.crates-io]
ltk_fantome = { git = "https://github.com/LeagueToolkit/league-mod", branch = "main" }
ltk_mod_project = { git = "https://github.com/LeagueToolkit/league-mod", branch = "main" }
ltk_modpkg = { git = "https://github.com/LeagueToolkit/league-mod", branch = "main" }
ltk_overlay = { git = "https://github.com/LeagueToolkit/league-mod", branch = "main" }
```

This turns three hops of publish latency into a next-day signal. It is what would have caught the
`ModProject::from(FantomeInfo)` layer reset at its source rather than during an implementation
that happened to walk into it.

The patch block is written by the CI job and never committed. It is not a path dependency and does
not touch the rule against them — the manifest in the repo keeps its crates.io versions, and the
canary is a throwaway resolution in a runner.

### 4. Turn on duplicate detection

league-mod's `deny.toml` has a `[bans]` section with nothing in it. Set:

```toml
[bans]
multiple-versions = "warn"
```

ltk-manager has no `deny.toml` at all and wants one. league-mod already has
`.github/workflows/supply-chain.yml` to run it from.

What this catches is two `ltk_*` crates pulling different `ltk_wad` minors into one build, whose
symptom is `expected ltk_wad::Wad, found ltk_wad::Wad` and an hour of disbelief.

### 5. The structural question, named and then left alone

If ltk-manager is the only consumer of `ltk_overlay` and `ltk_fantome`, the three-hop publish
chain buys nothing and one workspace would remove it outright.

Against that: the `league-mod` CLI is its own deliverable, and the crates are public. Keeping the
split and paying for it with proposal 3 is the cheaper trade. Recorded here so the question stops
being re-litigated from scratch, not because the answer is expected to change.

## What does not need building

**release-plz already cascades inside league-mod.** Bumping `ltk_fantome` bumps
`ltk_mod_project`'s requirement on it and releases that too. The dual
`{ version = "0.8.0", path = "../ltk_fantome" }` form on every internal dependency is what buys
this, and `release-plz.toml` marks each publishable crate.

The gap is only at the league-mod to ltk-manager boundary, which is what proposal 3 addresses.
