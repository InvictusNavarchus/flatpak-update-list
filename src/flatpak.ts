import type { CliOptions, FlatpakInstalledItem, FlatpakRemoteItem, UpdateComparison } from "./types.ts";

type InstallationScope = "user" | "system";

async function runFlatpak(args: string[]) {
  const proc = Bun.spawn(["flatpak", ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  if (exitCode !== 0) {
    const errorMsg = stderr.trim() || `flatpak exited with code ${exitCode}`;
    throw new Error(`Flatpak command failed ("flatpak ${args.join(" ")}"): ${errorMsg}`);
  }

  return { stdout, stderr: stderr.trim() };
}

async function runFlatpakJson<T>(args: string[]): Promise<T[]> {
  const { stdout } = await runFlatpak(args);
  const trimmed = stdout.trim();
  if (!trimmed) {
    return [];
  }

  try {
    return JSON.parse(trimmed) as T[];
  } catch (err) {
    throw new Error(`Failed to parse Flatpak JSON output: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export async function fetchInstalledApps(options: CliOptions): Promise<FlatpakInstalledItem[]> {
  const args = ["list"];
  if (!options.all) {
    args.push("--app");
  }
  if (options.user) {
    args.push("--user");
  }
  if (options.system) {
    args.push("--system");
  }
  args.push("--columns=name,application,version,branch,arch,active,installation,origin", "-j");

  return runFlatpakJson<FlatpakInstalledItem>(args);
}

export async function fetchAvailableUpdates(
  options: CliOptions,
  onProgress?: (message: string) => void
): Promise<(FlatpakRemoteItem & { installation: InstallationScope })[]> {
  const scopes: InstallationScope[] = [];
  if (options.user || !options.system) scopes.push("user");
  if (options.system || !options.user) scopes.push("system");

  if (!options.cached) {
    // remote-ls can refresh commits while still reading stale AppStream versions.
    // Refresh each selected installation before reading its version metadata.
    onProgress?.(`Refreshing AppStream metadata (${scopes.join(", ")})...`);
    for (const scope of scopes) {
      try {
        const { stderr } = await runFlatpak(["update", "--appstream", `--${scope}`]);
        // Flatpak can report per-remote refresh errors on stderr and still exit successfully.
        if (stderr) throw new Error(stderr);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Could not confirm the ${scope} AppStream refresh. ${message}\nRetry with --cached to check local metadata.`);
      }
    }
  }

  onProgress?.(options.cached ? "Checking local cache for updates..." : "Querying remote updates...");

  const args = ["remote-ls", "--updates"];
  if (!options.all) {
    args.push("--app");
  }
  if (options.cached) {
    args.push("--cached");
  }
  args.push("--columns=name,application,version,branch,arch,commit,download-size,origin", "-j");

  // remote-ls filters updates per installation, but its rows have no installation column.
  const updatesByScope = await Promise.all(scopes.map(async (installation) => {
    const updates = await runFlatpakJson<FlatpakRemoteItem>([...args, `--${installation}`]);
    return updates.map(update => ({ ...update, installation }));
  }));
  return updatesByScope.flat();
}

function installationKey(item: FlatpakInstalledItem | (FlatpakRemoteItem & { installation: InstallationScope })): string {
  return `${item.installation}/${item.origin}/${item.application_id}/${item.arch}/${item.branch}`;
}

export async function getUpdateComparisons(
  options: CliOptions,
  onProgress?: (message: string) => void
): Promise<UpdateComparison[]> {
  const [installed, updates] = await Promise.all([
    fetchInstalledApps(options),
    fetchAvailableUpdates(options, onProgress),
  ]);

  const installedMap = new Map<string, FlatpakInstalledItem[]>();
  for (const item of installed) {
    const key = installationKey(item);
    const list = installedMap.get(key) ?? [];
    list.push(item);
    installedMap.set(key, list);
  }

  const comparisons: UpdateComparison[] = [];

  for (const update of updates) {
    const matches = installedMap.get(installationKey(update)) ?? [];

    if (matches.length > 0) {
      for (const inst of matches) {
        const currentVersion = inst.version?.trim() || "-";
        const availableVersion = update.version?.trim() || "-";
        const currentCommit = inst.active_commit?.trim() || "";
        const availableCommit = update.commit?.trim() || "";

        const isVersionBump = currentVersion !== "-" && availableVersion !== "-" && currentVersion !== availableVersion;
        // Equal catalog versions only suggest a rebuild; they do not prove one.
        const isRebuild = !options.cached && currentVersion !== "-" && currentVersion === availableVersion
          && Boolean(currentCommit) && Boolean(availableCommit) && currentCommit !== availableCommit;

        comparisons.push({
          id: update.application_id,
          name: update.name || inst.name || update.application_id,
          currentVersion,
          availableVersion,
          currentCommit,
          availableCommit,
          downloadSize: update.download_size || "-",
          origin: update.origin || inst.origin || "unknown",
          installation: update.installation,
          arch: update.arch,
          branch: update.branch,
          isRebuild,
          isVersionBump,
          versionMetadataCached: Boolean(options.cached),
        });
      }
    } else {
      // Fallback if not matched by full key
      const currentVersion = "-";
      const availableVersion = update.version?.trim() || "-";
      const availableCommit = update.commit?.trim() || "";

      comparisons.push({
        id: update.application_id,
        name: update.name || update.application_id,
        currentVersion,
        availableVersion,
        currentCommit: "",
        availableCommit,
        downloadSize: update.download_size || "-",
        origin: update.origin || "unknown",
        installation: update.installation,
        arch: update.arch,
        branch: update.branch,
        isRebuild: false,
        isVersionBump: false,
        versionMetadataCached: Boolean(options.cached),
      });
    }
  }

  // Sort by Name alphabetically
  comparisons.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));

  return comparisons;
}
