// Prints the build attestation of a manager version and commit, signed with the Ed25519
// key in LTK_PATCHER_ATTESTATION_KEY (PKCS#8 PEM). The delivery service verifies it.
//
// Usage: node scripts/attest-build.mjs <version> <commit>

import { createPrivateKey, sign } from "node:crypto";
import { pathToFileURL } from "node:url";

// Separates an attestation signature from any other signature the same key makes.
const PURPOSE = "ltk-manager-attestation\0";

/** Returns the release version of `version`: its core without a pre-release or build suffix. */
export function releaseVersion(version) {
  const match = /^(\d+\.\d+\.\d+)(?:[-+].*)?$/.exec(version);
  if (match === null) {
    throw new Error(`Not a semver version: ${version}`);
  }

  return match[1];
}

/**
 * Returns the attestation of a build of `version` at `commit`, signed with the PEM private
 * key `pem`: `base64url(statement).base64url(signature)`, where the statement is
 * `{"manager":"<release version>","commit":"<commit>"}`. Fails if `commit` is not 40 hex.
 */
export function attest(version, commit, pem) {
  if (!/^[0-9a-f]{40}$/.test(commit)) {
    throw new Error(`Not a commit hash: ${commit}`);
  }

  const statement = Buffer.from(JSON.stringify({ manager: releaseVersion(version), commit }));
  const signature = sign(
    null,
    Buffer.concat([Buffer.from(PURPOSE), statement]),
    createPrivateKey(pem),
  );

  return `${statement.toString("base64url")}.${signature.toString("base64url")}`;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const [version, commit] = process.argv.slice(2);
  const pem = process.env.LTK_PATCHER_ATTESTATION_KEY;
  if (!version || !commit || !pem) {
    console.error(
      "Usage: LTK_PATCHER_ATTESTATION_KEY=<pem> node scripts/attest-build.mjs <version> <commit>",
    );
    process.exit(2);
  }

  process.stdout.write(attest(version, commit, pem));
}
