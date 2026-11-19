import { expect, test } from "bun:test";
import { formatComparisonTable } from "./formatter.ts";

test.each([
  [{}, "No pending application updates found for the user and default system installations."],
  [{ user: true, cached: true }, "No pending application updates found in the local cache for the user installation."],
  [{ all: true, system: true }, "No pending package updates found for the default system installation."],
])("describes the scope and source of an empty result for %j", (options, expected) => {
  expect(formatComparisonTable([], options)).toBe(expected);
});
