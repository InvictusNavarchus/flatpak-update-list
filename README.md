# flatpak-update-list

A lightweight, zero-bloat CLI utility written in TypeScript and executed via [Bun](https://bun.sh) to quickly inspect pending Flatpak application updates and compare current vs. available versions side-by-side.

## Features

- **Side-by-Side Version Comparison**: Displays `CURRENT → AVAILABLE` versions in a clean, terminal-aligned table.
- **Rebuild & Patch Detection**: Automatically distinguishes between upstream version bumps and flatpak rebuilds/manifest updates (e.g. `1.13.7 (rebuild: 092bb11 -> baf531d)`).
- **Fast Execution**: Concurrently fetches installed applications and remote updates directly via native JSON flags (`-j`), avoiding brittle text parsing.
- **Filtering Options**: Easily filter by `--user` or `--system` installations, or check `--all` (including runtimes).
- **Offline / Stale Cache Mode**: `--cached` flag queries local OSTree caches instantly without hitting remotes.
- **Machine-Readable**: `--json` flag prints structured JSON for scripting or piping to tools like `jq`.

## Installation & Requirements

Ensure [Bun](https://bun.sh) is installed on your system.

```bash
# Clone the repository
git clone <repo-url>
cd flatpak-update-list

# Install dependencies
bun install
```

## Usage

Run directly with Bun:

```bash
bun start
# or
bun run src/index.ts
```

### Options

| Flag | Description |
| :--- | :--- |
| `-c, --cached` | Query local caches without checking remotes (fastest) |
| `-u, --user` | Show only user-installed packages |
| `-s, --system` | Show only system-installed packages |
| `-a, --all` | Include runtimes in addition to applications |
| `-j, --json` | Output results as structured JSON |
| `-h, --help` | Display help and usage options |
| `-v, --version` | Display version number |

### Examples

```bash
# Standard update check (applications only)
bun start

# Quick check using local cache
bun start --cached

# Inspect user-level flatpaks only
bun start --user

# Include runtimes and output to JSON
bun start --all --json
```
