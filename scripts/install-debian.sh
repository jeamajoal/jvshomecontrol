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

  # Preserve user-specific files across updates (the update uses git clean).
  local cfg cert_dir
  cfg="${APP_DIR}/${CONFIG_FILE_REL}"
  cert_dir="${APP_DIR}/${CERT_DIR_REL}"

  local cfg_backup cert_backup_dir
  cfg_backup=""
  cert_backup_dir=""

  if [[ -f "${cfg}" ]]; then
    local stamp
    stamp="$(date -u +%Y%m%dT%H%M%SZ)"
    cfg_backup="/tmp/jvshomecontrol.config.${stamp}.json"
    log "Backing up existing config.json to ${cfg_backup}…"
    cp -a "${cfg}" "${cfg_backup}"
  fi

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
