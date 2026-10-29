import type { CliOptions, FlatpakInstalledItem, FlatpakRemoteItem, UpdateComparison } from "./types.ts";

async function runFlatpak(args: string[]): Promise<string> {
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

  return stdout;
}

async function runFlatpakJson<T>(args: string[]): Promise<T[]> {
  const trimmed = (await runFlatpak(args)).trim();
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
): Promise<FlatpakRemoteItem[]> {
  if (!options.cached) {
    // remote-ls can refresh commits while still reading stale AppStream versions.
    // Refresh each selected installation before reading its version metadata.
    const scopes = options.user || options.system
      ? [options.user && "--user", options.system && "--system"].filter((scope): scope is string => Boolean(scope))
      : ["--user", "--system"];
    const scopeNames = scopes.map((scope) => scope.replace(/^--/, "")).join(", ");
    onProgress?.(`Refreshing AppStream metadata (${scopeNames})...`);
    for (const scope of scopes) {
      await runFlatpak(["update", "--appstream", scope]);
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
  if (options.user) {
    args.push("--user");
  }
  if (options.system) {
    args.push("--system");
  }
  args.push("--columns=name,application,version,branch,arch,commit,download-size,origin", "-j");

  return runFlatpakJson<FlatpakRemoteItem>(args);
}

export async function getUpdateComparisons(
  options: CliOptions,
  onProgress?: (message: string) => void
): Promise<UpdateComparison[]> {
  const [installed, updates] = await Promise.all([
    fetchInstalledApps(options),
    fetchAvailableUpdates(options, onProgress),
  ]);

  // Group installed apps by appId/arch/branch to handle potential user + system installs
  const installedMap = new Map<string, FlatpakInstalledItem[]>();
  for (const item of installed) {
    const key = `${item.application_id}/${item.arch}/${item.branch}`;
    const list = installedMap.get(key) ?? [];
    list.push(item);
    installedMap.set(key, list);
  }

  const comparisons: UpdateComparison[] = [];

  for (const update of updates) {
    const key = `${update.application_id}/${update.arch}/${update.branch}`;
    const matches = installedMap.get(key) ?? [];

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
          installation: inst.installation || "unknown",
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
        installation: "unknown",
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
