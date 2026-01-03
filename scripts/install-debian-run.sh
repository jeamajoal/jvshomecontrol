#!/usr/bin/env bash
set -euo pipefail

# JVSHomeControl - Debian install/update runner
#
# This is the "real" installer logic. It is intended to be executed via:
#   scripts/install-debian.sh
# which updates the repo first and then invokes this file from the updated checkout.

# Supported Node.js baseline (modern toolchain); recommend the latest LTS.
MIN_NODE_MAJOR=20
RECOMMENDED_NODE_MAJOR=22

# Resolve repo root based on this script location (works both in /opt and when run from a clone)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

APP_USER="${APP_USER:-jvshome}"
APP_GROUP="${APP_GROUP:-jvshome}"
APP_DIR="${APP_DIR:-${ROOT_DIR}}"

REPO_URL="${REPO_URL:-https://github.com/jeamajoal/JVSHomeControl.git}"
ENV_FILE="${ENV_FILE:-/etc/jvshomecontrol.env}"
SERVICE_FILE="${SERVICE_FILE:-/etc/systemd/system/jvshomecontrol.service}"
CONFIG_FILE_REL="${CONFIG_FILE_REL:-server/data/config.json}"
CERT_DIR_REL="${CERT_DIR_REL:-server/data/certs}"

log() { echo "[install] $*"; }
warn() { echo "[install][WARN] $*"; }

die() {
  echo "[install][ERROR] $*" >&2
  exit 1
}

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

require_root() {
  if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
    die "Run as root (use sudo)."
  fi
}

install_prereqs() {
  log "Installing base packages (git/curl/ca-certificates)…"
  apt-get update
  apt-get install -y ca-certificates curl git

  if ! command -v git >/dev/null 2>&1; then
    die "git is required but was not found after install. Install git and re-run."
  fi

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

ensure_config_json() {
  local cfg example
  cfg="${APP_DIR}/${CONFIG_FILE_REL}"
  example="${APP_DIR}/server/data/config.example.json"

  if [[ ! -f "${example}" ]]; then
    warn "Config example not found; skipping: ${example}"
    return 0
  fi

  mkdir -p "$(dirname "${cfg}")"

  if [[ ! -f "${cfg}" ]]; then
    log "Creating config.json from config.example.json…"
    cp -a "${example}" "${cfg}"
    chown "${APP_USER}:${APP_GROUP}" "${cfg}" || true
    return 0
  fi

  log "Merging new default config keys into existing config.json (preserving your values)…"
  local stamp backup
  stamp="$(date -u +%Y%m%dT%H%M%SZ)"
  backup="${cfg}.${stamp}.bak"
  cp -a "${cfg}" "${backup}"

  # Use Node to perform a deep "defaults" merge:
  # - Existing user values win
  # - Missing keys are filled from config.example.json
  CFG_PATH="${cfg}" EXAMPLE_PATH="${example}" node - <<'NODE'
const fs = require('fs');
const path = require('path');

const cfg = process.env.CFG_PATH;
const example = process.env.EXAMPLE_PATH;

function isPlainObject(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function mergeDefaults(target, defaults) {
  if (Array.isArray(defaults)) {
    return Array.isArray(target) ? target : defaults;
  }

  if (isPlainObject(defaults)) {
    const out = isPlainObject(target) ? { ...target } : {};
    for (const [k, defVal] of Object.entries(defaults)) {
      if (Object.prototype.hasOwnProperty.call(out, k)) {
        const cur = out[k];
        if (isPlainObject(cur) && isPlainObject(defVal)) {
          out[k] = mergeDefaults(cur, defVal);
        }
        // else: user value wins
      } else {
        out[k] = defVal;
      }
    }
    return out;
  }

  // Primitive default: only apply if key was missing entirely.
  return target;
}

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

const existing = readJson(cfg);
const defaults = readJson(example);
const merged = mergeDefaults(existing, defaults);

const before = JSON.stringify(existing);
const after = JSON.stringify(merged);
if (before === after) {
  process.exit(0);
}

fs.writeFileSync(cfg, JSON.stringify(merged, null, 2) + '\n');
NODE

  chown "${APP_USER}:${APP_GROUP}" "${cfg}" || true
  warn "Config backup left in place: ${backup}"
}

install_and_build() {
  log "Installing server dependencies…"
  sudo -u "${APP_USER}" -H bash -lc "cd '${APP_DIR}/server' && npm ci --omit=dev"

  log "Installing client dependencies and building UI…"
  sudo -u "${APP_USER}" -H bash -lc "cd '${APP_DIR}/client' && npm ci && npm run build && npm prune --omit=dev"
}

ensure_https_setup() {
  # Offer to create or recreate a self-signed certificate and place it in server/data/certs.
  local cert_dir
  cert_dir="${APP_DIR}/${CERT_DIR_REL}"
  local cert_path key_path
  cert_path="${cert_dir}/localhost.crt"
  key_path="${cert_dir}/localhost.key"

  local should_create
  should_create=0

  if [[ -f "${cert_path}" && -f "${key_path}" ]]; then
    if [[ ! -t 0 ]]; then
      log "HTTPS cert already present: ${cert_path}"
      return 0
    fi

    if ! confirm "HTTPS certificate already exists. Recreate it (overwrite)?"; then
      log "Keeping existing HTTPS certificate: ${cert_path}"
      return 0
    fi

    should_create=1

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

  if (( should_create == 0 )); then
    if ! confirm "HTTPS certificate not found. Create a self-signed certificate now?"; then
      log "HTTPS: skipping certificate creation. Server will run HTTP unless you add a cert."
      return 0
    fi

    should_create=1
  fi

  if (( should_create == 0 )); then
    return 0
  fi

  local default_host
  default_host="$(hostname -f 2>/dev/null || hostname 2>/dev/null || echo localhost)"
  local cert_host
  read -r -p "Hostname (or IP) to include in the HTTPS certificate [${default_host}]: " cert_host
  cert_host="${cert_host:-${default_host}}"

  log "Creating self-signed HTTPS certificate in ${cert_dir} for '${cert_host}'…"
  sudo -u "${APP_USER}" -H bash -lc "cd '${APP_DIR}/server' && HTTPS=1 HTTPS_SETUP_ASSUME_YES=1 HTTPS_CERT_HOSTNAME='${cert_host}' node scripts/https-setup.js"
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

# Optional: If your HUBITAT_HOST uses https:// and Hubitat presents a self-signed
# cert, set this to disable TLS verification for Hubitat requests.
# HUBITAT_TLS_INSECURE=1

# Optional: Poll interval for Maker API full refresh (milliseconds)
# Default is 2000. Example: poll once per minute:
# HUBITAT_POLL_INTERVAL_MS=60000

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
  ensure_config_json
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
