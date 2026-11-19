import { expect, test } from "bun:test";
import { formatComparisonTable } from "./formatter.ts";
import type { UpdateComparison } from "./types.ts";

test.each([
  [{}, "No pending application updates found for the user and default system installations."],
  [{ user: true, cached: true }, "No pending application updates found in the local cache for the user installation."],
  [{ all: true, system: true }, "No pending package updates found for the default system installation."],
])("describes the scope and source of an empty result for %j", (options, expected) => {
  expect(formatComparisonTable([], options)).toBe(expected);
});

const rebuild: UpdateComparison = {
  name: "Visual Studio Code",
  id: "com.visualstudio.code",
  currentVersion: "1.108.3",
  availableVersion: "1.108.3",
  currentCommit: "71103ecabc",
  availableCommit: "326cfe6def",
  downloadSize: "125.0 MB",
  origin: "flathub",
  installation: "system",
  branch: "stable",
  arch: "x86_64",
  isVersionBump: false,
  isRebuild: true,
  versionMetadataCached: false,
};

test("switches to stacked entries when the table exceeds terminal width", () => {
  const output = formatComparisonTable([rebuild], {}, 80);
  expect(output).toContain("1.108.3 → 1.108.3 (possible rebuild: 71103ec -> 326cfe6)");
  expect(output).toContain("com.visualstudio.code");
  expect(output).toContain("125.0 MB · flathub (system)");
  expect(output).toContain("Found 1 update (1 possible rebuild).");
  expect(output.split("\n").every(line => Bun.stringWidth(line) <= 80)).toBe(true);
});

test("aligns table columns by display width for Unicode application names", () => {
  const output = formatComparisonTable([rebuild, { ...rebuild, name: "文本编辑器" }], {}, 160);
  const lines = output.split("\n");
  const idColumn = (line: string) => Bun.stringWidth(line.slice(0, line.indexOf(rebuild.id)));
  expect(lines[0]).toContain("APPLICATION ID");
  expect(lines[2]).toContain(rebuild.id);
  expect(lines[3]).toContain(rebuild.id);
  expect(idColumn(lines[2]!)).toBe(idColumn(lines[3]!));
});
