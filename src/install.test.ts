import { afterEach, beforeEach, expect, test } from "bun:test";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let directory: string;
let checkout: string;
let tools: string;
let command: string;
let environment: Record<string, string | undefined>;

function run(args: string[], env = environment) {
  const result = Bun.spawnSync(args, { cwd: checkout, env });
  return {
    code: result.exitCode,
    output: result.stdout.toString() + result.stderr.toString(),
  };
}

function install(...args: string[]) {
  // Deliberately invoke from outside the checkout to test script-relative paths.
  const result = Bun.spawnSync(
    ["/bin/bash", join(checkout, "install.sh"), ...args],
    {
      cwd: directory,
      env: environment,
    },
  );
  return {
    code: result.exitCode,
    output: result.stdout.toString() + result.stderr.toString(),
  };
}

function setSource(version: string) {
  writeFileSync(
    join(checkout, "src/index.ts"),
    `#!/usr/bin/env bun\nconsole.log(${JSON.stringify(version)});\n`,
    { mode: 0o755 },
  );
}

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "flatpak-install-test-"));
  checkout = join(directory, "checkout with spaces");
  tools = join(directory, "tools");
  command = join(directory, "command bin", "flatpak-update-list");
  mkdirSync(join(checkout, "src"), { recursive: true });
  mkdirSync(tools);
  symlinkSync(process.execPath, join(tools, "bun"));
  // Only help is available during installation. Queries would fail the smoke check.
  writeFileSync(join(tools, "flatpak"), `#!/bin/bash
if [[ $# == 2 && ( "$1" == list || "$1" == remote-ls ) && "$2" == --help ]]; then
  if [[ "$FLATPAK_WITHOUT_JSON" != "$1" ]]; then
    printf '  -j, --json    Show output in JSON format\\n'
  fi
  exit 0
fi
exit 99
`, {
    mode: 0o755,
  });
  environment = {
    ...process.env,
    PATH: `${tools}:/usr/bin:/bin`,
    FLATPAK_WITHOUT_JSON: undefined,
    BUN_INSTALL: join(directory, "bun"),
    BUN_INSTALL_GLOBAL_DIR: join(directory, "global"),
    BUN_INSTALL_BIN: join(directory, "command bin"),
    BUN_INSTALL_CACHE_DIR: join(directory, "cache"),
  };
  copyFileSync(
    join(import.meta.dir, "../install.sh"),
    join(checkout, "install.sh"),
  );
  writeFileSync(
    join(checkout, "package.json"),
    JSON.stringify({
      name: "flatpak-update-list",
      version: "0.1.0",
      type: "module",
      bin: { "flatpak-update-list": "src/index.ts" },
      dependencies: { "fixture-dependency": "file:./dependency" },
    }),
  );
  mkdirSync(join(checkout, "dependency"));
  writeFileSync(
    join(checkout, "dependency/package.json"),
    JSON.stringify({ name: "fixture-dependency", version: "1.0.0" }),
  );
  setSource("fixture-v1");
  // A local dependency exercises real Bun install/link/unlink without network.
  expect(
    run([process.execPath, "install", "--offline", "--lockfile-only"]).code,
  ).toBe(0);
});

afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

test("help and invalid arguments leave the installation untouched", () => {
  expect(install("--help").code).toBe(0);
  const invalid = install("--bin-dir", "/tmp/unexpected");
  expect(invalid.code).not.toBe(0);
  expect(invalid.output).toContain("Unknown argument");
  expect(existsSync(join(directory, "global"))).toBe(false);
  expect(existsSync(join(directory, "command bin"))).toBe(false);
});

for (const prerequisite of ["bun", "flatpak"]) {
  test(`missing ${prerequisite} fails before installation`, () => {
    rmSync(join(tools, prerequisite));
    environment.PATH = tools;
    const result = install();
    expect(result.code).not.toBe(0);
    expect(result.output).toContain(
      prerequisite === "bun" ? "Bun is required" : "Flatpak is required",
    );
    expect(existsSync(join(directory, "global"))).toBe(false);
  });
}

test.each(["list", "remote-ls"])("missing Flatpak %s JSON support fails before installation", (subcommand) => {
  environment.FLATPAK_WITHOUT_JSON = subcommand;
  const result = install();
  expect(result.code).not.toBe(0);
  expect(result.output).toContain(`requires JSON output in 'flatpak ${subcommand}'`);
  expect(result.output).toContain("Update Flatpak");
  expect(existsSync(join(directory, "global"))).toBe(false);
  expect(existsSync(join(checkout, "node_modules"))).toBe(false);
});

test("installs in Bun's configured bin, exposes edits, and unlinks without deleting source", () => {
  const lockfile = readFileSync(join(checkout, "bun.lock"), "utf8");
  const result = install();
  expect(result.code).toBe(0);
  expect(result.output).toContain(`Installed: ${command}`);
  expect(result.output).toContain("not on PATH");
  expect(lstatSync(command).isSymbolicLink()).toBe(true);
  expect(run([command, "--version"]).output.trim()).toBe("fixture-v1");
  setSource("fixture-v2");
  expect(run([command, "--version"]).output.trim()).toBe("fixture-v2");
  environment.PATH = `${join(directory, "command bin")}:${environment.PATH}`;
  const update = install();
  expect(update.code).toBe(0);
  expect(update.output).not.toContain("not on PATH");
  expect(readFileSync(join(checkout, "bun.lock"), "utf8")).toBe(lockfile);
  expect(run([process.execPath, "unlink"]).code).toBe(0);
  expect(existsSync(command)).toBe(false);
  expect(existsSync(join(checkout, "src/index.ts"))).toBe(true);
});

for (const conflict of ["file", "directory", "symlink"]) {
  test(`refuses a conflicting ${conflict} without modifying it`, () => {
    mkdirSync(join(directory, "command bin"));
    if (conflict === "file") writeFileSync(command, "another owner");
    if (conflict === "directory") mkdirSync(command);
    if (conflict === "symlink")
      symlinkSync(join(directory, "missing"), command);
    const result = install();
    expect(result.code).not.toBe(0);
    expect(result.output).toContain("Refusing to replace");
    expect(lstatSync(command)).toBeDefined();
    if (conflict === "file")
      expect(readFileSync(command, "utf8")).toBe("another owner");
    expect(
      existsSync(join(directory, "global/node_modules/flatpak-update-list")),
    ).toBe(false);
  });
}

test("refuses another command on PATH instead of creating a competing installation", () => {
  writeFileSync(
    join(tools, "flatpak-update-list"),
    "#!/bin/bash\necho other\n",
    { mode: 0o755 },
  );
  const result = install();
  expect(result.code).not.toBe(0);
  expect(result.output).toContain("Another installation is on PATH");
  expect(existsSync(command)).toBe(false);
});

test("failed dependency installation preserves the registered command", () => {
  expect(install().code).toBe(0);
  rmSync(join(tools, "bun"));
  symlinkSync(process.execPath, join(tools, "real-bun"));
  writeFileSync(
    join(tools, "bun"),
    '#!/bin/bash\nif [[ "$1" == install ]]; then exit 42; fi\nexec "${BASH_SOURCE[0]%/*}/real-bun" "$@"\n',
    { mode: 0o755 },
  );
  expect(install().code).toBe(42);
  expect(run([command, "--version"]).output.trim()).toBe("fixture-v1");
});

test("an invalid entrypoint is not registered", () => {
  writeFileSync(
    join(checkout, "src/index.ts"),
    "#!/usr/bin/env bun\nconst = ;\n",
  );
  expect(install().code).not.toBe(0);
  expect(existsSync(command)).toBe(false);
  chmodSync(join(checkout, "src/index.ts"), 0o644);
  expect(install().output).toContain("Expected an executable entrypoint");
});
