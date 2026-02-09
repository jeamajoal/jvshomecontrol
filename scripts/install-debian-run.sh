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
SERVICE_FILE="${SERVICE_FILE:-/etc/systemd/system/jvshomecontrol.service}"
CONFIG_FILE_REL="${CONFIG_FILE_REL:-server/data/config.json}"

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
  if [[ "${EUID:-$(/usr/bin/id -u)}" -ne 0 ]]; then
    die "Run as root (use sudo)."
  fi
}

install_prereqs() {
  log "Installing base packages (git/curl/ca-certificates/ffmpeg)…"
  /usr/bin/apt-get update
  # ffmpeg is required for RTSP camera previews (server-side RTSP -> MPEG1 websocket).
  /usr/bin/apt-get install -y ca-certificates curl git ffmpeg

  if ! command -v git >/dev/null 2>&1; then
    die "git is required but was not found after install. Install git and re-run."
  fi

  if ! command -v curl >/dev/null 2>&1; then
    die "curl is required but was not found after install. Install curl and re-run."
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
  /usr/bin/apt-get install -y nodejs

  log "Node installed: $(node -v)"
  log "npm installed: $(npm -v)"
}

ensure_user() {
  if /usr/bin/id -u "${APP_USER}" >/dev/null 2>&1; then
    log "User ${APP_USER} already exists; skipping user creation."
    return 0
  fi

  log "Creating system user ${APP_USER}…"
  /usr/sbin/useradd \
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

  /usr/bin/mkdir -p "$(/usr/bin/dirname "${cfg}")"

  if [[ ! -f "${cfg}" ]]; then
    log "Creating config.json from config.example.json…"
    /usr/bin/cp -a "${example}" "${cfg}"
    /usr/bin/chown "${APP_USER}:${APP_GROUP}" "${cfg}" || true
    /usr/bin/chmod 600 "${cfg}" || true
    return 0
  fi

  log "Merging new default config keys into existing config.json (preserving your values)…"
  local stamp backup
  stamp="$(/usr/bin/date -u +%Y%m%dT%H%M%SZ)"
  backup="${cfg}.${stamp}.bak"
  /usr/bin/cp -a "${cfg}" "${backup}"

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

  /usr/bin/chown "${APP_USER}:${APP_GROUP}" "${cfg}" || true
  /usr/bin/chmod 600 "${cfg}" || true
  /usr/bin/chmod 600 "${backup}" || true
  warn "Config backup left in place: ${backup}"
}

install_and_build() {
  log "Installing server dependencies…"
  sudo -u "${APP_USER}" -H bash -lc "cd '${APP_DIR}/server' && npm ci --omit=dev"

  log "Installing client dependencies and building UI…"
  sudo -u "${APP_USER}" -H bash -lc "cd '${APP_DIR}/client' && npm ci && npm run build && npm prune --omit=dev"
}

ensure_service() {
  # Always write the service file so installs can move directories safely.
  # Back up any existing service file first.
  if [[ -f "${SERVICE_FILE}" ]]; then
    local stamp
    stamp="$(/usr/bin/date -u +%Y%m%dT%H%M%SZ)"
    local backup
    backup="${SERVICE_FILE}.${stamp}.bak"
    log "Backing up existing service file to: ${backup}"
    /usr/bin/cp -a "${SERVICE_FILE}" "${backup}"
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
ExecStart=/usr/bin/node ${APP_DIR}/server/server.js
Restart=on-failure
RestartSec=5

# Hardening (safe defaults; remove if they break your environment)
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=${APP_DIR}/server/data

# Allow binding to privileged ports (< 1024) such as 443 without running as root
AmbientCapabilities=CAP_NET_BIND_SERVICE
CapabilityBoundingSet=CAP_NET_BIND_SERVICE

[Install]
WantedBy=multi-user.target
EOF

  log "Reloading systemd…"
  /usr/bin/systemctl daemon-reload

  log "Enabling and starting service…"
  /usr/bin/systemctl enable jvshomecontrol
  /usr/bin/systemctl restart jvshomecontrol
}

main() {
  require_root
  install_prereqs
  ensure_user
  ensure_config_json
  install_and_build
  ensure_service

  log "Done! Open http://$(hostname -I 2>/dev/null | awk '{print $1}' || echo 'your-server-ip') in a browser."
  log "Configure Hubitat and HTTPS from Settings."
  log "View logs: journalctl -u jvshomecontrol -f"
}

main "$@"
