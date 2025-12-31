#!/usr/bin/env bash
set -euo pipefail

# JVSHomeControl - Debian install/update bootstrap
#
# Why this file exists:
# - If this script itself changes in git, a "one-file" installer can require a second run
#   to pick up the updated logic.
#
# What this file does:
# - Updates/clones the repo into /opt/jvshomecontrol
# - Preserves user-specific config/certs across updates
# - Hands off to the *repo version* runner script, which contains the real install logic:
#   /opt/jvshomecontrol/scripts/install-debian-run.sh

APP_USER="${APP_USER:-jvshome}"
APP_GROUP="${APP_GROUP:-jvshome}"
APP_DIR="${APP_DIR:-/opt/jvshomecontrol}"
REPO_URL="${REPO_URL:-https://github.com/jeamajoal/JVSHomeControl.git}"
CONFIG_FILE_REL="${CONFIG_FILE_REL:-server/data/config.json}"
CERT_DIR_REL="${CERT_DIR_REL:-server/data/certs}"

log() { echo "[install] $*"; }
warn() { echo "[install][WARN] $*"; }

die() {
  echo "[install][ERROR] $*" >&2
  exit 1
}

require_root() {
  if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
    die "Run as root (use sudo)."
  fi
}

install_prereqs() {
  log "Installing base packages (git/curl/ca-certificates)…"
  apt-get update
  apt-get install -y ca-certificates curl git
}

ensure_user() {
  if id -u "${APP_USER}" >/dev/null 2>&1; then
    log "User ${APP_USER} already exists; skipping user creation."
    return 0
  fi

  log "Creating system user ${APP_USER}…"
  useradd \
    --system \
    --create-home \
    --home-dir "${APP_DIR}" \
    --shell /usr/sbin/nologin \
    "${APP_USER}"
}

ensure_repo() {
  mkdir -p "${APP_DIR}"
  chown -R "${APP_USER}:${APP_GROUP}" "${APP_DIR}"

# Optional weather overrides
# OPEN_METEO_LAT=...
# OPEN_METEO_LON=...
EOF

  chmod 600 "${ENV_FILE}"
}

ensure_service() {
  # Always write the service file so installs can move directories safely.
  # Back up any existing service file first.
  if [[ -f "${SERVICE_FILE}" ]]; then
    local stamp
    stamp="$(date -u +%Y%m%dT%H%M%SZ)"
    local backup
    backup="${SERVICE_FILE}.${stamp}.bak"
    log "Backing up existing service file to: ${backup}"
    cp -a "${SERVICE_FILE}" "${backup}"
  fi

  log "Writing systemd service: ${SERVICE_FILE}"
  cat >"${SERVICE_FILE}" <<EOF
[Unit]
Description=JVS Home Control Server
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${APP_USER}
Group=${APP_GROUP}
WorkingDirectory=${APP_DIR}/server
EnvironmentFile=${ENV_FILE}
ExecStart=/usr/bin/node ${APP_DIR}/server/server.js
Restart=on-failure
RestartSec=5

# Hardening (safe defaults; remove if they break your environment)
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=${APP_DIR}/server/data

[Install]
WantedBy=multi-user.target
EOF

  log "Reloading systemd…"
  systemctl daemon-reload

  log "Enabling and starting service…"
  systemctl enable jvshomecontrol
  systemctl restart jvshomecontrol
}

main() {
  require_root
  install_prereqs
  ensure_user
  ensure_repo

  local runner
  runner="${APP_DIR}/scripts/install-debian-run.sh"
  if [[ ! -f "${runner}" ]]; then
    die "Runner script not found: ${runner}"
  fi

  log "Handing off to repo installer: ${runner}"
  exec bash "${runner}"
}

main "$@"
