import type { UpdateComparison } from "./types.ts";

const isColorSupported = Boolean(
  process.stdout.isTTY &&
  !process.env.NO_COLOR &&
  process.env.TERM !== "dumb"
);

function c(code: string, text: string): string {
  if (!isColorSupported) {
    return text;
  }
  return `\x1b[${code}m${text}\x1b[0m`;
}

const style = {
  bold: (t: string) => c("1", t),
  dim: (t: string) => c("2", t),
  green: (t: string) => c("32", t),
  yellow: (t: string) => c("33", t),
  cyan: (t: string) => c("36", t),
  gray: (t: string) => c("90", t),
};

function formatAvailableRaw(item: UpdateComparison): string {
  if (item.isRebuild) {
    const curShort = item.currentCommit ? item.currentCommit.slice(0, 7) : "?";
    const availShort = item.availableCommit ? item.availableCommit.slice(0, 7) : "?";
    return `${item.availableVersion} (rebuild: ${curShort} -> ${availShort})`;
  }
  return item.availableVersion;
}

export function formatComparisonTable(items: UpdateComparison[]): string {
  if (items.length === 0) {
    return style.green("✓ All Flatpak packages are up to date.");
  }

  // Pre-calculate raw text lengths for perfect column alignment
  const headers = {
    name: "APPLICATION",
    id: "APPLICATION ID",
    current: "CURRENT",
    arrow: "",
    available: "AVAILABLE",
    size: "SIZE",
    scope: "REMOTE / SCOPE",
  };

  let maxName = headers.name.length;
  let maxId = headers.id.length;
  let maxCurrent = headers.current.length;
  let maxAvailable = headers.available.length;
  let maxSize = headers.size.length;
  let maxScope = headers.scope.length;

  for (const item of items) {
    if (item.name.length > maxName) maxName = item.name.length;
    if (item.id.length > maxId) maxId = item.id.length;
    if (item.currentVersion.length > maxCurrent) maxCurrent = item.currentVersion.length;

    const availRaw = formatAvailableRaw(item);
    if (availRaw.length > maxAvailable) maxAvailable = availRaw.length;

    if (item.downloadSize.length > maxSize) maxSize = item.downloadSize.length;

    const scope = `${item.origin} (${item.installation})`;
    if (scope.length > maxScope) maxScope = scope.length;
  }

  const lines: string[] = [];

  // Header row
  const headerLine = [
    style.bold(headers.name.padEnd(maxName)),
    style.bold(headers.id.padEnd(maxId)),
    style.bold(headers.current.padEnd(maxCurrent)),
    "  ", // arrow space
    style.bold(headers.available.padEnd(maxAvailable)),
    style.bold(headers.size.padStart(maxSize)),
    style.bold(headers.scope.padEnd(maxScope)),
  ].join("  ");

  lines.push(headerLine);
  lines.push(
    style.dim(
      [
        "-".repeat(maxName),
        "-".repeat(maxId),
        "-".repeat(maxCurrent),
        "  ",
        "-".repeat(maxAvailable),
        "-".repeat(maxSize),
        "-".repeat(maxScope),
      ].join("  ")
    )
  );

  let versionBumpCount = 0;
  let rebuildCount = 0;

  for (const item of items) {
    const rawAvail = formatAvailableRaw(item);
    const scope = `${item.origin} (${item.installation})`;

    let styledAvailable: string;
    if (item.isRebuild) {
      rebuildCount++;
      styledAvailable = style.yellow(rawAvail.padEnd(maxAvailable));
    } else {
      versionBumpCount++;
      styledAvailable = style.green(rawAvail.padEnd(maxAvailable));
    }

    const row = [
      item.name.padEnd(maxName),
      style.gray(item.id.padEnd(maxId)),
      item.currentVersion.padEnd(maxCurrent),
      style.dim("→"),
      styledAvailable,
      item.downloadSize.padStart(maxSize),
      style.dim(scope.padEnd(maxScope)),
    ].join("  ");

    lines.push(row);
  }

  // Summary statistics
  const summaryParts: string[] = [];
  if (versionBumpCount > 0) {
    summaryParts.push(`${versionBumpCount} version upgrade${versionBumpCount > 1 ? "s" : ""}`);
  }
  if (rebuildCount > 0) {
    summaryParts.push(`${rebuildCount} build/rebuild update${rebuildCount > 1 ? "s" : ""}`);
  }

  const summary = `Found ${items.length} update${items.length > 1 ? "s" : ""} (${summaryParts.join(", ")}).`;
  lines.push("");
  lines.push(style.bold(summary));

  return lines.join("\n");
}
