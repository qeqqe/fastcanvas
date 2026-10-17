#!/usr/bin/env bash
set -euo pipefail

DIR="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")" && pwd)"
MEDIA_DIR="$HOME/images/fastfetch/media"
LOG="${XDG_CACHE_HOME:-$HOME/.cache}/fastfetch-canvas.log"

mkdir -p "$(dirname "$LOG")"
node "$DIR/dist/index.js" > "$LOG" 2>&1 || echo "fetchcanvas: update failed, see $LOG" >&2

file=$(ls -1t "$MEDIA_DIR"/* 2>/dev/null | head -n1 || true)
if [ -z "$file" ]; then
    echo "No media file found in $MEDIA_DIR" >&2
    exit 1
fi

ext="${file##*.}"
case "${ext,,}" in
    jpg|jpeg)
        kitten icat -n --place 45x45@0x6 --scale-up --align left "$file" | fastfetch --logo-width 45 --raw -
        ;;
    gif)
        kitten icat -n --place 30x30@0x6 --scale-up --align left "$file" | fastfetch --logo-width 30 --raw -
        ;;
    *)
        echo "Unsupported media type: .$ext" >&2
        exit 2
        ;;
esac
