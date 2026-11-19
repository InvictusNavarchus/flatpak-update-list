import { expect, test } from "bun:test";
import { join } from "node:path";

function runCli(...args: string[]) {
  return Bun.spawnSync([process.execPath, join(import.meta.dir, "index.ts"), ...args], {
    env: { ...process.env, PATH: "" },
  });
}

test.each([
  [["--bogus"], "Unknown option"],
  [["--help", "--bogus"], "Unknown option"],
  [["--cached.extra"], "Invalid use of --cached"],
  [["--version.extra"], "Invalid use of --version"],
  [["--cached", "extra"], "Unused args"],
  [["--cached", "--", "extra"], "Unexpected arguments after --"],
])("rejects invalid arguments %j before checking Flatpak", (args, message) => {
  const result = runCli(...args);
  expect(result.exitCode).toBe(2);
  expect(result.stdout.toString()).toBe("");
  expect(result.stderr.toString()).toContain(message);
  expect(result.stderr.toString()).toContain("Use --help for usage.");
  expect(result.stderr.toString().trim().split("\n")).toHaveLength(1);
});

test.each(["--help", "--version"])("%s works without Flatpak", (flag) => {
  const result = runCli(flag);
  expect(result.exitCode).toBe(0);
  expect(result.stdout.toString()).toContain("flatpak-update-list/");
  expect(result.stderr.toString()).toBe("");
});
