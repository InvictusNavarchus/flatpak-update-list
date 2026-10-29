# flatpak-update-list

A lightweight, zero-bloat CLI utility written in TypeScript and executed via [Bun](https://bun.sh) to quickly inspect pending Flatpak application updates and compare current vs. available versions side-by-side.

## Features

- **Side-by-Side Version Comparison**: Displays `CURRENT → AVAILABLE` versions in a clean, terminal-aligned table.
- **Fresh Version Metadata**: Refreshes AppStream for the selected user/system installations before querying online updates. This updates catalog metadata only; it does not install application or runtime updates. Refresh failures stop the check instead of silently using stale versions.
- **Cautious Rebuild Detection**: Different reported versions indicate a version change. Equal versions with different commits are labeled **possible rebuilds**, since catalog metadata cannot prove that the application version stayed unchanged.
- **Native JSON Queries**: Fetches installed applications concurrently with the remote update check via native JSON flags (`-j`), avoiding brittle text parsing.
- **Filtering Options**: Easily filter by `--user` or `--system` installations, or check `--all` (including runtimes).
- **Offline / Stale Cache Mode**: `--cached` skips AppStream refresh and queries local OSTree caches without hitting remotes. Available versions are marked `(cached)`; equal cached versions are unverified, not classified as rebuilds.
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

### Version information

Flatpak tracks updates by commit, while displayed versions come from AppStream catalogs. Previously, this utility could show a current remote commit alongside an old catalog version and incorrectly label a new release as a rebuild. Online checks now refresh catalogs first. The `--user` and `--system` filters also limit the refresh; by default both installations are refreshed.

JSON comparisons include `versionMetadataCached` to identify potentially stale version metadata. `isRebuild` is a heuristic for a possible rebuild with equal known versions after refresh; it is always false in cached mode. Missing versions or an unmatched installation are unverified rather than assumed to be version upgrades. `isVersionBump` means the two reported version strings differ, not that their ordering has been verified.

## Validation

```bash
bun test
bun run typecheck
```
