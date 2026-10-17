#!/usr/bin/env bash
# Builds the project and installs `fetchcanvas` into ~/.local/bin.
set -euo pipefail

DIR="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")" && pwd)"
BIN_DIR="${XDG_BIN_HOME:-$HOME/.local/bin}"

missing=()
for cmd in node pnpm ffmpeg fastfetch kitten; do
    command -v "$cmd" > /dev/null || missing+=("$cmd")
done
if [ "${#missing[@]}" -gt 0 ]; then
    echo "Missing required commands: ${missing[*]}" >&2
    exit 1
fi

if ! node -e 'process.exit(typeof process.loadEnvFile === "function" ? 0 : 1)'; then
    echo "Node.js 20.12+ is required (found $(node --version))" >&2
    exit 1
fi

cd "$DIR"
pnpm install --frozen-lockfile
pnpm run build
[ -f .env ] || { cp .env.example .env; echo "Created .env, fill it in (see README)"; }

mkdir -p "$BIN_DIR"
ln -sf "$DIR/script.sh" "$BIN_DIR/fetchcanvas"
echo "Installed $BIN_DIR/fetchcanvas -> $DIR/script.sh"

case ":$PATH:" in
    *":$BIN_DIR:"*) ;;
    *) echo "Note: $BIN_DIR is not in your PATH, add it to your shell config" >&2 ;;
esac
