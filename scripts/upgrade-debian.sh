#!/usr/bin/env bash
set -euo pipefail

# JVSHomeControl - Debian upgrade script
# Assumes initial install already completed (user/service/env file exist).
# - Updates repo in /opt/jvshomecontrol
# - Installs server deps and rebuilds client
# - Restarts systemd service

APP_USER="jvshome"
APP_DIR="/opt/jvshomecontrol"
SERVICE_NAME="jvshomecontrol"
CONFIG_FILE_REL="server/data/config.json"

log() { echo "[upgrade] $*"; }

die() {
  echo "[upgrade][ERROR] $*" >&2
  exit 1
}

require_root() {
  if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
    die "Run as root (use sudo)."
  fi
}

ensure_repo_exists() {
  if [[ ! -d "${APP_DIR}/.git" ]]; then
    die "Repo not found at ${APP_DIR}. Run scripts/install-debian.sh first (or adjust APP_DIR)."
  fi
}

stop_service() {
  log "Stopping systemd service (to freeze config writes): ${SERVICE_NAME}…"
  systemctl stop "${SERVICE_NAME}" || true
}

update_repo() {
  log "Updating repo in ${APP_DIR}…"
  # The app may create/modify files inside the repo (e.g., config.json) and users may have local edits.
  # For upgrades, we intentionally discard local repo changes after backing up config.json.
  sudo -u "${APP_USER}" -H bash -lc "cd '${APP_DIR}' && git fetch origin main && git checkout -f main && git reset --hard origin/main && git clean -fd"
}

backup_config() {
  local cfg
  cfg="${APP_DIR}/${CONFIG_FILE_REL}"
  if [[ ! -f "${cfg}" ]]; then
    log "No existing config.json at ${cfg}; skipping backup."
    return 0
  fi

  local stamp
  stamp="$(date -u +%Y%m%dT%H%M%SZ)"
  local backup
  backup="/tmp/jvshomecontrol.config.${stamp}.json"

  log "Backing up config.json to ${backup}…"
  cp -a "${cfg}" "${backup}"
  echo "${backup}"
}

restore_config() {
  local backup_path
  backup_path="${1:-}"
  if [[ -z "${backup_path}" ]]; then
    return 0
  fi
  if [[ ! -f "${backup_path}" ]]; then
    die "Config backup not found: ${backup_path}"
  fi

  local cfg_dir
  cfg_dir="${APP_DIR}/server/data"
  local cfg
  cfg="${APP_DIR}/${CONFIG_FILE_REL}"

  log "Restoring config.json to ${cfg}…"
  mkdir -p "${cfg_dir}"
  cp -a "${backup_path}" "${cfg}"
  chown "${APP_USER}:${APP_USER}" "${cfg}" || true
}

install_and_build() {
  log "Installing server dependencies…"
  sudo -u "${APP_USER}" -H bash -lc "cd '${APP_DIR}/server' && npm ci --omit=dev"

  log "Installing client dependencies and building UI…"
  sudo -u "${APP_USER}" -H bash -lc "cd '${APP_DIR}/client' && npm ci && npm run build && npm prune --omit=dev"
}

restart_service() {
  log "Restarting systemd service: ${SERVICE_NAME}…"
  systemctl daemon-reload
  systemctl restart "${SERVICE_NAME}"

  log "Status:"
  systemctl --no-pager --full status "${SERVICE_NAME}" || true
}

main() {
  require_root
  ensure_repo_exists
  stop_service
  local cfg_backup
  cfg_backup="$(backup_config || true)"
  update_repo
  restore_config "${cfg_backup}"
  install_and_build
  restart_service

  log "Done."
  log "Logs: journalctl -u ${SERVICE_NAME} -f"
}

main "$@"
