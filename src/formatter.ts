import type { CliOptions, UpdateComparison } from "./types.ts";

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
  gray: (t: string) => c("90", t),
};

function formatAvailableRaw(item: UpdateComparison): string {
  const version = `${item.availableVersion}${item.versionMetadataCached ? " (cached)" : ""}`;
  if (item.isRebuild) {
    const curShort = item.currentCommit ? item.currentCommit.slice(0, 7) : "?";
    const availShort = item.availableCommit ? item.availableCommit.slice(0, 7) : "?";
    return `${version} (possible rebuild: ${curShort} -> ${availShort})`;
  }
  if (!item.isVersionBump) {
    return `${version} (version unverified)`;
  }
  return version;
}

export function formatComparisonTable(
  items: UpdateComparison[],
  options: CliOptions = {},
  columns = process.stdout.columns,
): string {
  const wrap = (message: string) => columns
    ? Bun.wrapAnsi(message, columns, { hard: true, trim: false })
    : message;

  if (items.length === 0) {
    const kind = options.all ? "package" : "application";
    const scope = options.user && !options.system ? "the user installation"
      : options.system && !options.user ? "the default system installation"
      : "the user and default system installations";
    const source = options.cached ? " in the local cache" : "";
    return wrap(style.green(`No pending ${kind} updates found${source} for ${scope}.`));
  }

  let versionBumpCount = 0;
  let rebuildCount = 0;
  let unverifiedCount = 0;

  const rows = items.map((item) => {
    const available = formatAvailableRaw(item);
    if (item.isRebuild) {
      rebuildCount++;
    } else if (item.isVersionBump) {
      versionBumpCount++;
    } else {
      unverifiedCount++;
    }

    return [
      item.name,
      style.gray(item.id),
      item.currentVersion,
      style.dim("→"),
      item.isVersionBump && !item.isRebuild ? style.green(available) : style.yellow(available),
      item.downloadSize,
      style.dim(`${item.origin} (${item.installation})`),
    ] as const;
  });

  // Summary statistics
  const summaryParts: string[] = [];
  if (versionBumpCount > 0) {
    summaryParts.push(`${versionBumpCount} reported version change${versionBumpCount > 1 ? "s" : ""}`);
  }
  if (rebuildCount > 0) {
    summaryParts.push(`${rebuildCount} possible rebuild${rebuildCount > 1 ? "s" : ""}`);
  }
  if (unverifiedCount > 0) {
    summaryParts.push(`${unverifiedCount} update${unverifiedCount > 1 ? "s" : ""} with unverified versions`);
  }

  const summary = style.bold(`Found ${items.length} update${items.length > 1 ? "s" : ""} (${summaryParts.join(", ")}).`);
  const headers = ["APPLICATION", "APPLICATION ID", "CURRENT", "", "AVAILABLE", "SIZE", "REMOTE / SCOPE"];
  const widths = headers.map((header, index) => rows.reduce(
    (width, row) => Math.max(width, Bun.stringWidth(row[index] ?? "")),
    Bun.stringWidth(header),
  ));
  const gap = "  ";
  const tableWidth = widths.reduce((total, width) => total + width, 0) + gap.length * (headers.length - 1);

  if (columns && tableWidth > columns) {
    const entries = rows.map(([name, id, current, arrow, available, size, scope]) => [
      style.bold(name),
      `  ${current} ${arrow} ${available}`,
      `  ${id}`,
      `  ${size} · ${scope}`,
    ].join("\n"));
    return wrap([...entries, summary].join("\n\n"));
  }

  const formatRow = (cells: readonly string[]) => cells.map((cell, index) => {
    const padding = " ".repeat((widths[index] ?? 0) - Bun.stringWidth(cell));
    return index === 5 ? padding + cell : cell + padding;
  }).join(gap).trimEnd();
  const divider = widths.map((width, index) => (headers[index] ? "-" : " ").repeat(width)).join(gap);
  return [style.bold(formatRow(headers)), style.dim(divider), ...rows.map(formatRow), "", wrap(summary)].join("\n");
}
