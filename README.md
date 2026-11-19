# flatpak-update-list

A lightweight, zero-bloat CLI utility written in TypeScript and executed via [Bun](https://bun.sh) to quickly inspect pending Flatpak application updates and compare current vs. available versions side-by-side.

## Features

- **Side-by-Side Version Comparison**: Displays `CURRENT → AVAILABLE` versions in a clean, terminal-aligned table.
- **Fresh Version Metadata**: Refreshes AppStream for the selected user/system installations before querying online updates. The refresh updates catalog metadata only. A failed refresh or a diagnostic from Flatpak on stderr stops the check and suggests an explicit `--cached` retry.
- **Cautious Rebuild Detection**: Different reported versions indicate a version change. Equal versions with different commits are labeled **possible rebuilds**, since catalog metadata cannot prove that the application version stayed unchanged.
- **Native JSON Queries**: Fetches installed applications concurrently with the remote update check via native JSON flags (`-j`), avoiding brittle text parsing.
- **Filtering Options**: Checks the user and default system installations separately, so each update appears under the installation that reported it. Use `--user` or `--system` to narrow the check, or `--all` to include runtimes.
- **Offline / Stale Cache Mode**: `--cached` skips AppStream refresh and queries local OSTree caches without hitting remotes. Available versions are marked `(cached)`; equal cached versions are unverified, not classified as rebuilds.
- **Machine-Readable**: `--json` flag prints structured JSON for scripting or piping to tools like `jq`.

## Installation & Requirements

Requires Linux, Bash, [Bun](https://bun.com), and Flatpak on `PATH`. The installer
is verified with Bun 1.4.4. Git is needed to clone and fetch updates; Bun and
Flatpak are needed at runtime. No compilation or standalone executable is provided.

```bash
# Clone the repository
git clone https://github.com/InvictusNavarchus/flatpak-update-list.git
cd flatpak-update-list

# Install locked dependencies and register the command
bash install.sh

# Verify the installed command without checking for updates
command -v flatpak-update-list
flatpak-update-list --version
flatpak-update-list --help
```

The installer uses `bun install --frozen-lockfile` and `bun link`. Bun owns the
command link in its configured global bin directory (`bun pm bin -g`, normally
`~/.bun/bin`). Run the installer again to refresh the same link. It refuses to
replace another installation and reports missing PATH setup. For Bash:

```bash
export PATH="$(bun pm bin -g):$PATH"
```

Keep the checkout at its installed location, along with `node_modules`: the
command runs directly from it, so source edits take effect immediately. Installation
requires no `sudo` and does not change shell configuration, configure services,
fetch Git updates, or query Flatpak metadata. `bash install.sh --help` describes
the installer without making changes; unknown arguments are rejected.

### Update

From this checkout, on a clean branch tracking its remote:

```bash
git pull --ff-only
bash install.sh
flatpak-update-list --version
```

Fetching source is an explicit step. Rerunning the installer uses the current
checkout, including local edits, and refreshes dependencies from the lockfile;
it does not upgrade dependency versions. Source changes affect subsequent
invocations immediately. Already running CLI processes are not restarted.
Flatpak applications, configuration, and data are preserved.

### Uninstall

From the installed checkout, before moving or deleting it:

```bash
bun unlink
```

This removes Bun's command link and package registration. It keeps the checkout,
its dependencies, and all Flatpak applications, configuration, and data. Bun and
Flatpak themselves are retained.

### Development

From the repository root, without registering a command:

```bash
bun install --frozen-lockfile
bun run start --help
```

If the checkout is already linked, source and dependency edits also affect the
installed command. No rebuild or relink is needed for source edits; rerun
`bash install.sh` after dependency or command registration changes.

## Usage

After installation:

```bash
flatpak-update-list
flatpak-update-list --cached
```

Or run directly from the checkout with Bun:

```bash
bun run start
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
bun run start

# Quick check using local cache
bun run start --cached

# Inspect user-level flatpaks only
bun run start --user

# Include runtimes and output to JSON
bun run start --all --json
```

### Version information

When no updates are found, the text output names the installations checked and identifies cached results. JSON output in this case is an empty array.

Flatpak tracks updates by commit, while displayed versions come from AppStream catalogs. Previously, this utility could show a current remote commit alongside an old catalog version and incorrectly label a new release as a rebuild. Online checks now refresh catalogs first. The `--user` and `--system` filters also limit the refresh; by default both installations are refreshed.

JSON comparisons include `versionMetadataCached` to identify potentially stale version metadata. `isRebuild` is a heuristic for a possible rebuild with equal known versions after refresh; it is always false in cached mode. Missing versions or an unmatched installation are unverified rather than assumed to be version upgrades. `isVersionBump` means the two reported version strings differ, not that their ordering has been verified.

## Validation

```bash
bun test
bun run typecheck
```
