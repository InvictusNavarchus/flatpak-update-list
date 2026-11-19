#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: bash install.sh [--help]

Install or update this checkout's flatpak-update-list command using Bun.
Requires Bash, Bun, and Flatpak with JSON output support on PATH (Linux).

Installs locked dependencies with bun install --frozen-lockfile, then uses
bun link to register the command in Bun's configured global bin directory.
Bun, this checkout, and its dependencies remain required at runtime.
Source edits take effect immediately; rerun after dependency changes.

No sudo, Git updates, shell configuration edits, or service setup.
Remove the command by running bun unlink from this checkout.

Options:
  -h, --help  Show this help without making changes.
EOF
}

die() {
  printf 'Error: %s\n' "$*" >&2
  exit 1
}

show_help=false
for argument in "$@"; do
  case "$argument" in
    -h|--help) show_help=true ;;
    *) die "Unknown argument: $argument. Use --help for usage." ;;
  esac
done
if "$show_help"; then
  usage
  exit 0
fi

command -v bun >/dev/null 2>&1 || die "Bun is required. Install it from https://bun.com first."
command -v flatpak >/dev/null 2>&1 || die "Flatpak is required. Install it with your Linux distribution's package manager."
for subcommand in list remote-ls; do
  flatpak_help="$(LC_ALL=C flatpak "$subcommand" --help)" || die "Could not check Flatpak's $subcommand command. Verify that Flatpak is working."
  [[ "$flatpak_help" == *--json* ]] ||
    die "This tool requires JSON output in 'flatpak $subcommand'. Update Flatpak to a release with --json support (available in stable Flatpak 1.18 or later)."
done

checkout_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
cd -- "$checkout_dir"
entrypoint="$checkout_dir/src/index.ts"
[[ -x "$entrypoint" ]] || die "Expected an executable entrypoint at $entrypoint."
[[ -f bun.lock ]] || die "bun.lock is missing; run this installer from a complete checkout."

bin_dir="$(bun pm bin -g)"
[[ "$bin_dir" == /* ]] || die "Bun did not report an absolute global bin directory: $bin_dir"
installed_command="$bin_dir/flatpak-update-list"

# Only refresh links that already resolve to this checkout's entrypoint.
if [[ -e "$installed_command" || -L "$installed_command" ]]; then
  [[ -L "$installed_command" && "$installed_command" -ef "$entrypoint" ]] ||
    die "Refusing to replace $installed_command. Remove the existing installation using its original installation method first."
fi
resolved_command="$(type -P flatpak-update-list || true)"
if [[ -n "$resolved_command" && ! "$resolved_command" -ef "$entrypoint" ]]; then
  die "Another installation is on PATH at $resolved_command. Remove it using its original installation method before linking this checkout."
fi

bun install --frozen-lockfile
# Help exercises the entrypoint and dependencies without querying Flatpak.
bun run src/index.ts --help >/dev/null
bun link
[[ -L "$installed_command" && "$installed_command" -ef "$entrypoint" && -x "$installed_command" ]] ||
  die "Bun did not create the expected command link at $installed_command."
"$installed_command" --help >/dev/null

printf '\nInstalled: %s\n' "$installed_command"
printf 'Version: '
"$installed_command" --version
printf 'Checkout: %s\n' "$checkout_dir"
printf 'Runtime: Bun and Flatpak on PATH; keep this checkout and node_modules.\n'
printf 'Local source edits are immediately visible to the installed command.\n'

resolved_command="$(type -P flatpak-update-list || true)"
if [[ -z "$resolved_command" ]]; then
  printf '\nThe command is not on PATH. For Bash, add Bun\047s bin directory:\n'
  printf '  export PATH=%q:"$PATH"\n' "$bin_dir"
elif [[ ! "$resolved_command" -ef "$entrypoint" ]]; then
  printf '\nWarning: %s takes precedence on PATH over %s.\n' "$resolved_command" "$installed_command" >&2
fi
