# Patcher build attestation plan

Implementation plan, 2026-10-21, for [the spec](patcher-build-attestation.md). The checklist is
[patcher-build-attestation-tasks.md](patcher-build-attestation-tasks.md), and the task ids below
refer to it.

## Spec analysis

### Confirmed

- The Workers Web Crypto page lists Ed25519 as a standard algorithm for `importKey`, `sign` and
  `verify`, with no compatibility flag. The worker verifies with the platform API alone.
- An attestation is about 250 characters. `src/delivery.ts` accepts a registration field of
  1024 characters and a body of 4096 bytes, so no limit changes.
- Node 22 signs Ed25519 with `crypto.sign(null, data, key)`. Neither repository adds a
  dependency.
- `release.yml` is one Windows job. A value a step writes to `GITHUB_ENV` is visible to the
  build step's `env`, so the attestation never crosses a job.
- `reportEvent` writes a fixed blob list. The key ID position takes the attested version, so
  the Analytics Engine schema does not grow.

### Gaps found and amended in the spec

- `readToken` must validate the `manager` and `commit` claims by shape. A token from the key
  scheme fails that check, not an absence check.
- The admin deny route must validate the version in its path, or an arbitrary string becomes a
  KV key.
- Key generation had no tooling. `scripts/attest-keygen.mjs` in this repository prints the pair.
- The two repositories must agree on the signature prefix and the encoding. A fixture that the
  manager's script produced, checked into the service's tests, verifies that agreement.
- The registration field limit comment names the client key.

### Decisions to make before Phase 1

D1, D2, D3 and D5 were decided as recommended on 2026-10-21 and are recorded in the spec. D4
is open.

| Id  | Decision                                     | Recommendation                                                                                                                                      |
| --- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | `built` in the statement                     | Drop it. `commit` identifies the build, a rebuild of one commit then attests identically, and the service acts on neither.                          |
| D2  | PR #897 ships keys or attestations           | Attestations. Shipping keys means one KV entry and one secret for a single release, then a migration. Nothing from #897 reaches a user before then. |
| D3  | A denied version in the UI                   | Log only. The sync warns and the bundled DLL runs. A UI follow-up waits for a support case that needs it.                                           |
| D4  | The private spec's reason for per-key policy | Read it. If it names a case this design loses, record it in the spec's "Out of scope" or change the design.                                         |
| D5  | Key custody                                  | The maintainer generates both pairs locally with the keygen script. Private keys live in the repository secret and the password manager only.       |

### Risks

| Risk                                                       | Handling                                                                                        |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| The two repositories disagree on prefix or encoding        | S10 verifies a fixture the manager script produced (M7).                                        |
| The service deploys before the client changes              | Staging only. The key-scheme client fails to register until M4 lands, and runs the bundled DLL. |
| A staging key lands in the production var, or the reverse  | V1 fails on the first registration, before any user build.                                      |
| Two semver implementations treat a pre-release differently | Both apply Rust's rule, so the client reports its release version. M4 covers the strip.         |
| The secret is missing on the upstream repository           | M2 fails the release workflow. A fork degrades to no client.                                    |
| An old `clientkey:` entry is read by mistake               | S5 removes the readers, and S11 deletes the entries.                                            |

## Phases

### Phase 0: decisions and keys

Resolve D1 to D5. Generate the staging and production pairs (K1 to K3) and set the staging
var. Exit: the spec records the decisions, and both private keys are stored.

### Phase 1: service

Tasks S1 to S11 in `ltk-patcher-delivery`. One PR. Exit: the test suite passes with the
cross-repo fixture, staging runs the new worker, and a deny and a lift of a version through the
admin route each answer `204`. About one day.

### Phase 2: manager

Tasks M1 to M7 on the PR #897 branch. Exit: `cargo test -p ltk-manager-runtime`, `pnpm test`
and `pnpm check` pass, and a release-branch pull request build runs the `Attest build` step
and bakes a value. About half a day.

### Phase 3: verification on staging

Tasks V1 to V4 with a release-candidate build. Exit: the candidate registers, downloads the
staged DLL, is refused after a deny, and registers again after the lift. About an hour plus the
build.

### Phase 4: production

Tasks P1 to P3 when the production service exists. Exit: a stable release registers against
production, and the `shortcut:` constants are gone.

## Verification

| Check                                   | How                                                                             |
| --------------------------------------- | ------------------------------------------------------------------------------- |
| Service refuses a forged attestation    | S10 unit test                                                                   |
| Service refuses a version mismatch      | S10 unit test                                                                   |
| Service denies a version on every route | S10 unit test, V3 on staging                                                    |
| Workflow bakes the attestation          | A release-branch PR build's `Attest build` step log, and the installer's binary |
| Client registers and downloads          | V1 and V2: the `registration` event and the `Downloaded patcher DLL` log line   |
| Client runs the delivered DLL           | The incident report's patcher line shows the delivered hash without `stock`     |
| Build without the secret                | A fork build, or an unset `LTK_PATCHER_ATTESTATION` locally, builds no client   |

## Rollback

Both sides degrade to the bundled DLL. Redeploying the previous worker makes the attested
client fail registration with `400` for the missing `key` field, and the sync logs it. A manager
build without an attestation builds no client. Neither needs the other to roll back.
