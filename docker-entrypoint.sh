#!/bin/sh
set -e

# ── docker-entrypoint.sh ──────────────────────────────────────────────────
# Prepares the container environment before handing off to the Node server.
#
# 1. Ensures all required data directories exist (they live on the mounted
#    volume so they survive container recreation).
# 2. Seeds config.example.json → config.json on first run.
# 3. Copies bundled control-icon manifests into the data volume if they are
#    missing (new volume or upgrade).
# 4. Fixes ownership so the node user can write to the data volume.
# 5. Execs the final CMD (node server.js) so PID 1 is the Node process and
#    signals propagate correctly.
# ──────────────────────────────────────────────────────────────────────────

DATA_DIR="/app/server/data"
CONFIG_FILE="$DATA_DIR/config.json"
EXAMPLE_CONFIG="/app/server/data-defaults/config.example.json"

# ── 1. Ensure data sub-directories ──────────────────────────────────────
for dir in \
    "$DATA_DIR" \
    "$DATA_DIR/backups" \
    "$DATA_DIR/sounds" \
    "$DATA_DIR/backgrounds" \
    "$DATA_DIR/device-icons" \
    "$DATA_DIR/control-icons" \
    "$DATA_DIR/certs"
do
    mkdir -p "$dir"
done

echo "[entrypoint] Data directories verified."

# ── 2. Seed config.json on first run ────────────────────────────────────
if [ ! -f "$CONFIG_FILE" ]; then
    if [ -f "$EXAMPLE_CONFIG" ]; then
        cp "$EXAMPLE_CONFIG" "$CONFIG_FILE"
        echo "[entrypoint] Seeded config.json from config.example.json."
    else
        echo '{}' > "$CONFIG_FILE"
        echo "[entrypoint] Created empty config.json."
    fi
fi

# ── 3. Seed bundled control-icon manifests ──────────────────────────────
#    The image ships manifests in /app/server/data/control-icons/.
#    On a fresh volume they won't exist yet, so copy any missing ones.
BUNDLED_ICONS="/app/server/data-defaults/control-icons"
TARGET_ICONS="$DATA_DIR/control-icons"
if [ -d "$BUNDLED_ICONS" ]; then
    for manifest in "$BUNDLED_ICONS"/*.manifest.json; do
        [ -f "$manifest" ] || continue
        base="$(basename "$manifest")"
        if [ ! -f "$TARGET_ICONS/$base" ]; then
            cp "$manifest" "$TARGET_ICONS/$base"
            echo "[entrypoint] Copied default $base"
        fi
    done
fi

# ── 4. Fix ownership (when running as root with a mapped volume) ────────
#    If we're root, chown everything to the `node` user (uid 1000 on Alpine)
#    so the app can read/write without permission errors.
if [ "$(id -u)" = "0" ]; then
    chown -R node:node "$DATA_DIR" 2>/dev/null || true
fi

echo "[entrypoint] Starting JVSHomeControl server..."

# ── 5. Exec into the final command ─────────────────────────────────────
exec "$@"
