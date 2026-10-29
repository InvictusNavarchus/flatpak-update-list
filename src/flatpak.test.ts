import { afterEach, beforeEach, expect, spyOn, test } from "bun:test";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getUpdateComparisons } from "./flatpak.ts";
import { formatComparisonTable } from "./formatter.ts";

let directory: string;
let restoreSpawn: () => void;

const installed = {
  name: "QOwnNotes",
  application_id: "org.qownnotes.QOwnNotes",
  version: "26.10.1",
  branch: "stable",
  arch: "x86_64",
  active_commit: "71103ec9d5ff",
  installation: "system",
  origin: "flathub",
};

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "flatpak-update-list-test-"));
  const executable = join(directory, "flatpak");
  // Exercise real process execution without touching the host Flatpak installation.
  writeFileSync(executable, `#!${process.execPath}
import { appendFileSync, readFileSync, existsSync } from "node:fs";
const directory = import.meta.dir;
const args = process.argv.slice(2);
const log = directory + "/commands";
appendFileSync(log, JSON.stringify(args) + "\\n");
if (args[0] === "update") {
  if (existsSync(directory + "/fail-refresh")) {
    console.error("AppStream refresh failed");
    process.exit(1);
  }
  console.log("AppStream metadata updated");
} else if (args[0] === "list") {
  console.log(readFileSync(directory + "/installed", "utf8"));
} else if (args[0] === "remote-ls") {
  const commands = readFileSync(log, "utf8").trim().split("\\n").map(JSON.parse);
  const refreshed = commands.some(command => command[0] === "update");
  console.log(readFileSync(directory + (refreshed ? "/fresh" : "/cached"), "utf8"));
} else {
  process.exit(2);
}
`);
  chmodSync(executable, 0o755);
  const originalSpawn = Bun.spawn.bind(Bun);
  // Bun caches executable lookup, so redirect explicitly rather than changing PATH.
  const spawn = spyOn(Bun, "spawn").mockImplementation(((args: string[], options: { stdout: "pipe"; stderr: "pipe" }) =>
    originalSpawn([executable, ...args.slice(1)], options)) as typeof Bun.spawn);
  restoreSpawn = () => spawn.mockRestore();
  setVersions("26.10.13");
});

afterEach(() => {
  restoreSpawn();
  rmSync(directory, { recursive: true, force: true });
});

function setVersions(availableVersion?: string, currentVersion: string | undefined = "26.10.1") {
  writeFileSync(join(directory, "installed"), JSON.stringify([{ ...installed, version: currentVersion }]));
  const remote = { ...installed, commit: "326cfe625f8d", download_size: "29.6 MB" };
  writeFileSync(join(directory, "fresh"), JSON.stringify([{ ...remote, version: availableVersion }]));
  writeFileSync(join(directory, "cached"), JSON.stringify([remote]));
}

function commands(): string[][] {
  return readFileSync(join(directory, "commands"), "utf8").trim().split("\n").map(line => JSON.parse(line));
}

test("refreshes both catalogs before reading versions and detects a previously hidden release", async () => {
  const [result] = await getUpdateComparisons({});
  expect(result?.currentVersion).toBe("26.10.1");
  expect(result?.availableVersion).toBe("26.10.13");
  expect(result?.isVersionBump).toBe(true);
  expect(result?.isRebuild).toBe(false);
  expect(result?.versionMetadataCached).toBe(false);
  const calls = commands();
  const remoteIndex = calls.findIndex(args => args[0] === "remote-ls");
  expect(calls.slice(0, remoteIndex).filter(args => args[0] === "update")).toEqual([
    ["update", "--appstream", "--user"],
    ["update", "--appstream", "--system"],
  ]);
  expect(formatComparisonTable([result!])).toContain("1 reported version change");
});

for (const scope of ["user", "system"] as const) {
  test(`refreshes only the ${scope} catalog when filtered`, async () => {
    await getUpdateComparisons({ [scope]: true });
    expect(commands().filter(args => args[0] === "update")).toEqual([
      ["update", "--appstream", `--${scope}`],
    ]);
    expect(commands().find(args => args[0] === "remote-ls")).toContain(`--${scope}`);
  });
}

test("cached checks skip refresh and never claim equal stale versions are rebuilds", async () => {
  const results = await getUpdateComparisons({ cached: true });
  expect(commands().some(args => args[0] === "update")).toBe(false);
  expect(commands().find(args => args[0] === "remote-ls")).toContain("--cached");
  expect(results[0]?.availableVersion).toBe("26.10.1");
  expect(results[0]?.isRebuild).toBe(false);
  expect(results[0]?.versionMetadataCached).toBe(true);
  const table = formatComparisonTable(results);
  expect(table).toContain("(cached)");
  expect(table).toContain("version unverified");
  expect(table).not.toContain("possible rebuild");
});

test("refresh failure prevents the remote comparison instead of accepting stale metadata", async () => {
  writeFileSync(join(directory, "fail-refresh"), "");
  await expect(getUpdateComparisons({})).rejects.toThrow("AppStream refresh failed");
  expect(commands().some(args => args[0] === "remote-ls")).toBe(false);
});

test("equal refreshed versions are labeled possible rebuilds rather than proven rebuilds", async () => {
  setVersions("26.10.1");
  const results = await getUpdateComparisons({});
  expect(results[0]?.isRebuild).toBe(true);
  expect(results[0]?.isVersionBump).toBe(false);
  expect(formatComparisonTable(results)).toContain("possible rebuild: 71103ec -> 326cfe6");
});

test("missing available versions are unverified", async () => {
  setVersions(undefined);
  const results = await getUpdateComparisons({});
  expect(results[0]?.isRebuild).toBe(false);
  expect(results[0]?.isVersionBump).toBe(false);
  expect(formatComparisonTable(results)).toContain("1 update with unverified versions");
});

test("missing installed versions are unverified", async () => {
  setVersions("26.10.13", "");
  const results = await getUpdateComparisons({});
  expect(results[0]?.isRebuild).toBe(false);
  expect(results[0]?.isVersionBump).toBe(false);
});

test("unmatched installed refs do not imply a version upgrade", async () => {
  writeFileSync(join(directory, "installed"), "[]");
  const results = await getUpdateComparisons({});
  expect(results[0]?.isRebuild).toBe(false);
  expect(results[0]?.isVersionBump).toBe(false);
  expect(formatComparisonTable(results)).toContain("version unverified");
});

test("reports progress events for AppStream refresh and remote updates", async () => {
  const events: string[] = [];
  await getUpdateComparisons({ user: true }, (msg) => events.push(msg));
  expect(events).toEqual([
    "Refreshing AppStream metadata (user)...",
    "Querying remote updates...",
  ]);
});

test("reports progress events for multiple refresh scopes", async () => {
  const events: string[] = [];
  await getUpdateComparisons({}, (msg) => events.push(msg));
  expect(events).toEqual([
    "Refreshing AppStream metadata (user, system)...",
    "Querying remote updates...",
  ]);
});

test("reports progress for cached checks without AppStream refresh", async () => {
  const events: string[] = [];
  await getUpdateComparisons({ cached: true }, (msg) => events.push(msg));
  expect(events).toEqual([
    "Checking local cache for updates...",
  ]);
});
