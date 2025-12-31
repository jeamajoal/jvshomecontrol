#!/usr/bin/env bash
set -euo pipefail

# JVSHomeControl - Debian install/update script
# - Installs Node.js 22 LTS (via NodeSource) *only with explicit confirmation*
# - If Node is already installed, we do not change it unless it's too old and the user confirms an upgrade
# - Creates unprivileged service user
# - Clones or updates repo in /opt/jvshomecontrol
# - Installs server deps and builds client
# - Creates systemd service + env file if missing

# Supported Node.js baseline (modern toolchain); recommend the latest LTS.
MIN_NODE_MAJOR=20
RECOMMENDED_NODE_MAJOR=22

APP_USER="jvshome"
APP_GROUP="jvshome"
APP_DIR="/opt/jvshomecontrol"
REPO_URL="https://github.com/jeamajoal/JVSHomeControl.git"
ENV_FILE="/etc/jvshomecontrol.env"
SERVICE_FILE="/etc/systemd/system/jvshomecontrol.service"
CONFIG_FILE_REL="server/data/config.json"
CERT_DIR_REL="server/data/certs"

log() { echo "[install] $*"; }
warn() { echo "[install][WARN] $*"; }

confirm() {
  local prompt="$1"

  # Explicitly require confirmation unless the caller opts in.
  if [[ "${JVS_ASSUME_YES:-}" == "1" ]]; then
    return 0
  fi

  # If we're not attached to a TTY, we cannot ask; default to NO.
  if [[ ! -t 0 ]]; then
    return 1
  fi

  local reply
  read -r -p "${prompt} [y/N] " reply
  case "${reply}" in
    y|Y|yes|YES) return 0 ;;
    *) return 1 ;;
  esac
}

get_node_major() {
  if ! command -v node >/dev/null 2>&1; then
    echo ""
    return 0
  fi

  node -p "parseInt(process.versions.node.split('.')[0], 10)" 2>/dev/null || true
}

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

  if command -v node >/dev/null 2>&1; then
    local v major
    v="$(node -v | sed 's/^v//' || true)"
    major="$(get_node_major || true)"
    log "Node already installed (v${v})."

    if [[ -n "${major}" ]] && (( major < MIN_NODE_MAJOR )); then
      warn "Detected Node.js ${major}.x; this project expects Node ${MIN_NODE_MAJOR}+ (recommended: ${RECOMMENDED_NODE_MAJOR} LTS)."
      if ! confirm "Upgrade Node to ${RECOMMENDED_NODE_MAJOR} LTS via NodeSource?"; then
        die "Node.js ${MIN_NODE_MAJOR}+ is required. Install/upgrade Node (recommended ${RECOMMENDED_NODE_MAJOR} LTS) and re-run."
      fi
    else
      return 0
    fi
  else
    if ! confirm "Node.js not found. Install Node ${RECOMMENDED_NODE_MAJOR} LTS via NodeSource now?"; then
      die "Node.js ${MIN_NODE_MAJOR}+ is required. Install Node (recommended ${RECOMMENDED_NODE_MAJOR} LTS) and re-run."
    fi
  fi

  log "Installing Node.js ${RECOMMENDED_NODE_MAJOR} LTS (NodeSource)…"
  curl -fsSL "https://deb.nodesource.com/setup_${RECOMMENDED_NODE_MAJOR}.x" | bash -
  apt-get install -y nodejs

  log "Node installed: $(node -v)"
  log "npm installed: $(npm -v)"
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

  # Preserve any existing config.json across git operations.
  # This repo is public; config is user-specific and must not be overwritten.
  local cfg
  cfg="${APP_DIR}/${CONFIG_FILE_REL}"
  local cfg_backup
  cfg_backup=""
  if [[ -f "${cfg}" ]]; then
    local stamp
    stamp="$(date -u +%Y%m%dT%H%M%SZ)"
    cfg_backup="/tmp/jvshomecontrol.config.${stamp}.json"
    log "Backing up existing config.json to ${cfg_backup}…"
    cp -a "${cfg}" "${cfg_backup}"
  fi

  # Preserve any existing HTTPS certs across git operations.
  # These are installation-specific and should not be deleted by `git clean`.
  local cert_dir
  cert_dir="${APP_DIR}/${CERT_DIR_REL}"
  local cert_backup_dir
  cert_backup_dir=""
  if [[ -d "${cert_dir}" ]]; then
    local stamp
    stamp="$(date -u +%Y%m%dT%H%M%SZ)"
    cert_backup_dir="/tmp/jvshomecontrol.certs.${stamp}"
    log "Backing up existing certs dir to ${cert_backup_dir}…"
    mkdir -p "${cert_backup_dir}"
    cp -a "${cert_dir}/." "${cert_backup_dir}/" || true
  fi

  if [[ -d "${APP_DIR}/.git" ]]; then
    log "Updating existing repo in ${APP_DIR}…"
    # The app may create/modify files inside the repo (e.g., config.json) and users may have local edits.
    # For upgrades/updates, we intentionally discard local repo changes after backing up config.json.
    sudo -u "${APP_USER}" -H bash -lc "cd '${APP_DIR}' && git fetch origin main && git checkout -f main && git reset --hard origin/main && git clean -fd"
  else
    log "Cloning repo into ${APP_DIR}…"
    sudo -u "${APP_USER}" -H bash -lc "cd '${APP_DIR}' && git clone '${REPO_URL}' ."
  fi

  if [[ -n "${cfg_backup}" && -f "${cfg_backup}" ]]; then
    log "Restoring config.json to ${cfg}…"
    mkdir -p "$(dirname "${cfg}")"
    cp -a "${cfg_backup}" "${cfg}"
    chown "${APP_USER}:${APP_GROUP}" "${cfg}" || true
  fi

  if [[ -n "${cert_backup_dir}" && -d "${cert_backup_dir}" ]]; then
    log "Restoring certs dir to ${cert_dir}…"
    mkdir -p "${cert_dir}"
    cp -a "${cert_backup_dir}/." "${cert_dir}/" || true
    chown -R "${APP_USER}:${APP_GROUP}" "${cert_dir}" || true
  fi
}

install_and_build() {
  log "Installing server dependencies…"
  sudo -u "${APP_USER}" -H bash -lc "cd '${APP_DIR}/server' && npm ci --omit=dev"

  log "Installing client dependencies and building UI…"
  sudo -u "${APP_USER}" -H bash -lc "cd '${APP_DIR}/client' && npm ci && npm run build && npm prune --omit=dev"
}

ensure_https_setup() {
  # Offer to create a self-signed certificate and place it in server/data/certs.
  # - If a cert already exists, we keep it.
  # - If we're non-interactive, we skip prompting.
  local cert_dir
  cert_dir="${APP_DIR}/${CERT_DIR_REL}"
  local cert_path key_path
  cert_path="${cert_dir}/localhost.crt"
  key_path="${cert_dir}/localhost.key"

  if [[ -f "${cert_path}" && -f "${key_path}" ]]; then
    if [[ ! -t 0 ]]; then
      log "HTTPS cert already present: ${cert_path}"
      return 0
    fi

    if ! confirm "HTTPS certificate already exists. Recreate it (overwrite)?"; then
      log "Keeping existing HTTPS certificate: ${cert_path}"
      return 0
    fi

    local stamp
    stamp="$(date -u +%Y%m%dT%H%M%SZ)"
    log "Backing up existing cert/key…"
    cp -a "${cert_path}" "${cert_path}.${stamp}.bak" || true
    cp -a "${key_path}" "${key_path}.${stamp}.bak" || true
    rm -f "${cert_path}" "${key_path}" || true
  fi

  if [[ ! -t 0 ]]; then
    warn "Non-interactive session; skipping HTTPS certificate prompt."
    warn "To create a self-signed cert later: cd '${APP_DIR}/server' && node scripts/https-setup.js"
    return 0
  fi

  if ! confirm "HTTPS certificate not found. Create a self-signed certificate now?"; then
    log "HTTPS: skipping certificate creation. Server will run HTTP unless you add a cert."
    return 0
  fi

  local default_host
  default_host="$(hostname -f 2>/dev/null || hostname 2>/dev/null || echo localhost)"
  local cert_host
  read -r -p "Hostname (or IP) to include in the HTTPS certificate [${default_host}]: " cert_host
  cert_host="${cert_host:-${default_host}}"

  log "Creating self-signed HTTPS certificate in ${cert_dir} for '${cert_host}'…"
  sudo -u "${APP_USER}" -H bash -lc "cd '${APP_DIR}/server' && HTTPS=1 HTTPS_CERT_HOSTNAME='${cert_host}' node scripts/https-setup.js"
}

ensure_env_file() {
  if [[ -f "${ENV_FILE}" ]]; then
    log "Env file exists: ${ENV_FILE} (will not overwrite)"
    return 0
  fi

  log "Creating env file template: ${ENV_FILE}"
  cat >"${ENV_FILE}" <<'EOF'
# JVSHomeControl environment

# Hubitat Maker API (required to enable polling/commands)
HUBITAT_HOST=http://192.168.1.50
HUBITAT_APP_ID=30
HUBITAT_ACCESS_TOKEN=REPLACE_ME

# Optional: Dashboard device allowlists (comma-separated Hubitat device IDs)
# UI_ALLOWED_MAIN_DEVICE_IDS=24,25
# UI_ALLOWED_CTRL_DEVICE_IDS=24,25,26
# Legacy (treated as CTRL list):
# UI_ALLOWED_DEVICE_IDS=24

# Optional: Maker postURL ingest protection
# EVENTS_INGEST_TOKEN=REPLACE_ME

# Optional: Backup retention
# BACKUP_MAX_FILES=200

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
  install_and_build
  ensure_https_setup
  ensure_env_file
  ensure_service

  log "Done."
  log "Edit secrets/settings: ${ENV_FILE}"
  log "View logs: journalctl -u jvshomecontrol -f"
  log "Health: curl -s http://localhost:3000/api/hubitat/health | cat"
}

main "$@"
