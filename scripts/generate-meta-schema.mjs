// Refreshes the embedded meta schema snapshot from the LTK Meta Wiki API.
//
// The comparison runs against /v1, a few hundred bytes carrying both halves of
// what the snapshot records: dataset.fetchedAt against its hashSource.fetchedAt,
// and dataset.latestBuild against its latest. The two move independently, so
// both are compared, and agreement means the body would arrive unchanged.
// Nothing is kept between runs.
//
// The runtime cache's If-None-Match path is deliberately not repeated here. Its
// tag comes back weak on the gzip GET and strong on HEAD, and a script holding
// no state has no tag to send anyway.
//
// `--check` runs the comparison, writes nothing, and exits non-zero when the
// snapshot is behind. `--force` downloads whatever the comparison says.

import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync, gzipSync } from "node:zlib";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const crateSrc = join(repoRoot, "crates", "ltk-manager-core", "src");
const snapshotPath = join(crateSrc, "meta_schema", "schema-snapshot.json.gz");
const embedPath = join(crateSrc, "meta_schema.rs");

const rootUrl = "https://meta-api.leaguetoolkit.dev/v1";
const dbUrl = `${rootUrl}/db`;

// A release job runs this unattended, so a stalled connection has to end the run
// rather than the runner's own limit.
const requestTimeoutMs = 60_000;

const checkOnly = process.argv.includes("--check");
const force = process.argv.includes("--force");

try {
  await refresh();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}

async function refresh() {
  const shipped = readShipped();
  const published = parseJson(await getText(rootUrl), rootUrl);
  const generation = published.dataset?.fetchedAt;
  const reaches = published.dataset?.latestBuild;
  if (typeof generation !== "string" || typeof reaches !== "number") {
    fail(`${rootUrl} answered without a dataset to compare against.`);
  }

  const publishedAt = describe({ generation, latest: reaches });
  const current = shipped?.generation === generation && shipped?.latest === reaches;

  if (checkOnly) {
    if (!current) {
      fail(
        `The snapshot is at ${describe(shipped)}, and the publisher is at ${publishedAt}. ` +
          "Run `pnpm generate:meta-schema` and commit the result.",
      );
    }
    console.log(`The snapshot is current at ${describe(shipped)}.`);
    return;
  }

  if (current && !force) {
    console.log(`The snapshot is current at ${describe(shipped)}, so nothing was downloaded.`);
    return;
  }

  // Written as it was served rather than re-serialized, so a diff of the
  // decompressed blob is a diff of the publisher's own JSON.
  const body = await getText(dbUrl);
  const database = readDatabase(body);

  if (database.generation !== generation || database.latest !== reaches) {
    console.warn(
      `${rootUrl} named ${publishedAt} and the database carries ${describe(database)}, so the next run will download again.`,
    );
  }

  const compressed = gzipSync(Buffer.from(body), { level: 9 });
  const temporary = `${snapshotPath}.tmp`;
  writeFileSync(temporary, compressed);
  renameSync(temporary, snapshotPath);

  console.log(`Wrote ${compressed.length} bytes to ${snapshotPath}, at ${describe(database)}.`);
}

/* A snapshot that will not read is a reason to download, not to stop. */
function readShipped() {
  try {
    const json = JSON.parse(gunzipSync(readFileSync(snapshotPath)));
    return { generation: json.hashSource.fetchedAt, latest: json.latest };
  } catch {
    return null;
  }
}

/* Parsed and refused before it is written, because MetaSchema::shipped panics on
   a snapshot the build cannot read. */
function readDatabase(served) {
  const parsed = parseJson(served, dbUrl);
  const reads = readFormatVersion();
  if (parsed.formatVersion !== reads) {
    fail(`${dbUrl} is format version ${parsed.formatVersion}, and this build reads ${reads}.`);
  }
  if (typeof parsed.hashSource?.fetchedAt !== "string" || typeof parsed.latest !== "number") {
    fail(`${dbUrl} answered without hashSource.fetchedAt or latest.`);
  }
  return { generation: parsed.hashSource.fetchedAt, latest: parsed.latest };
}

/* Read out of the crate rather than repeated here, so a bump to the layout the
   build reads cannot leave this writing a snapshot that build refuses. */
function readFormatVersion() {
  const match = readFileSync(embedPath, "utf8").match(/const FORMAT_VERSION: u32 = (\d+);/);
  if (!match) fail(`${embedPath} declares no FORMAT_VERSION.`);
  return Number(match[1]);
}

function describe(snapshot) {
  return snapshot
    ? `${snapshot.generation}, reaching build ${snapshot.latest}`
    : "a generation that will not read";
}

/* The timeout covers the body as well as the headers, so the read is inside the
   handler too - a stall part-way through the download is a message, not a stack. */
async function getText(url) {
  try {
    const response = await mustSettle(
      fetch(url, { signal: AbortSignal.timeout(requestTimeoutMs) }),
    );
    if (!response.ok) {
      throw new Error(`answered ${response.status} ${response.statusText}`);
    }
    return await mustSettle(response.text());
  } catch (error) {
    fail(`${url} could not be read: ${error.message}`);
  }
}

/* The signal closes the socket but does not always end the wait: a timeout
   landing just as the response settles leaves fetch's promise pending for good
   on Node 22, which surfaces as an unsettled top-level await rather than as a
   message. Losing this race is that case and nothing else. */
function mustSettle(work) {
  let timer;
  const abandoned = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new Error("the request never settled")),
      requestTimeoutMs + 1_000,
    );
  });
  return Promise.race([work, abandoned]).finally(() => clearTimeout(timer));
}

function parseJson(text, url) {
  try {
    return JSON.parse(text);
  } catch (error) {
    fail(`${url} did not answer with JSON: ${error.message}`);
  }
}

function fail(message) {
  throw new Error(message);
}
