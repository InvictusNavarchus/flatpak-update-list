#!/usr/bin/env bun
import { cac } from "cac";
import { getUpdateComparisons } from "./flatpak.ts";
import { formatComparisonTable } from "./formatter.ts";
import type { CliOptions } from "./types.ts";

const cli = cac("flatpak-update-list");

cli.usage("[options]");

cli
  .option("-a, --all", "Include runtimes in addition to applications")
  .option("-c, --cached", "Use local cache even if stale (faster check)")
  .option("-u, --user", "Show only user-installed packages")
  .option("-s, --system", "Show only system-installed packages")
  .option("-j, --json", "Output results in JSON format");

cli.help();
cli.version("0.1.0");

cli.example("flatpak-update-list");
cli.example("flatpak-update-list --cached");
cli.example("flatpak-update-list --user");
cli.example("flatpak-update-list --all --json");

async function main() {
  const parsed = cli.parse(process.argv);

  if (parsed.options.help || parsed.options.version) {
    return;
  }

  const options: CliOptions = {
    all: Boolean(parsed.options.all),
    cached: Boolean(parsed.options.cached),
    user: Boolean(parsed.options.user),
    system: Boolean(parsed.options.system),
    json: Boolean(parsed.options.json),
  };

  try {
    console.log("Fetching updates...")
    const comparisons = await getUpdateComparisons(options);

    if (options.json) {
      console.log(JSON.stringify(comparisons, null, 2));
      return;
    }

    console.log(formatComparisonTable(comparisons));
  } catch (error) {
    const isColor = Boolean(process.stderr.isTTY && !process.env.NO_COLOR);
    const prefix = isColor ? "\x1b[31merror:\x1b[0m" : "error:";
    console.error(`${prefix} ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

main();
