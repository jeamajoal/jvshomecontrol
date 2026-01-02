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
REPO_BRANCH="${REPO_BRANCH:-main}"
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

install_prereqs() {
  log "Installing base packages (git/curl/ca-certificates)…"
  apt-get update
  apt-get install -y ca-certificates curl git

  if ! command -v git >/dev/null 2>&1; then
    die "git is required but was not found after install. Install git and re-run."
  fi
}

list_remote_branches() {
  git ls-remote --heads "${REPO_URL}" 2>/dev/null \
    | awk '{print $2}' \
    | sed 's#^refs/heads/##' \
    | sort -u
}

remote_branch_exists() {
  local branch="$1"
  [[ -n "${branch}" ]] || return 1

  local hit
  hit="$(git ls-remote --heads "${REPO_URL}" "refs/heads/${branch}" 2>/dev/null || true)"
  [[ -n "${hit}" ]]
}

choose_repo_branch() {
  # If caller set a branch explicitly (env/args), trust it but validate.
  if [[ -n "${REPO_BRANCH:-}" ]] && [[ "${REPO_BRANCH}" != "main" ]]; then
    if ! remote_branch_exists "${REPO_BRANCH}"; then
      die "Branch '${REPO_BRANCH}' not found on remote: ${REPO_URL}"
    fi
    return 0
  fi

  # Non-interactive session: keep default.
  if [[ "${JVS_ASSUME_YES:-}" == "1" ]] || [[ ! -t 0 ]]; then
    return 0
  fi

  local input
  while true; do
    read -r -p "Git branch to install [${REPO_BRANCH}] (? to list): " input
    input="${input:-${REPO_BRANCH}}"

    case "${input}" in
      "?"|"list"|"ls")
        log "Fetching remote branch list…"
        local branches
        branches="$(list_remote_branches || true)"
        if [[ -z "${branches}" ]]; then
          warn "Could not retrieve branches from remote."
        else
          echo "Available branches:" >&2
          echo "${branches}" | sed 's/^/  - /' >&2
        fi
        continue
        ;;
    esac

    if remote_branch_exists "${input}"; then
      REPO_BRANCH="${input}"
      return 0
    fi

    warn "Branch '${input}' not found on remote. Enter '?' to list branches."
    if ! confirm "Use '${REPO_BRANCH}' instead?"; then
      continue
    fi
    return 0
  done
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      -b|--branch)
        shift
        [[ $# -gt 0 ]] || die "Missing value for --branch"
        REPO_BRANCH="$1"
        ;;
      --list-branches)
        log "Remote branches:" >&2
        list_remote_branches || true
        exit 0
        ;;
      -h|--help)
        cat >&2 <<EOF
Usage: install-debian.sh [--branch <name>] [--list-branches]

Environment:
  REPO_BRANCH   Branch to install (default: main)

Examples:
  sudo bash scripts/install-debian.sh --branch develop
  sudo REPO_BRANCH=dev bash scripts/install-debian.sh
EOF
        exit 0
        ;;
    esac
    shift
  done
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
    sudo -u "${APP_USER}" -H bash -lc "cd '${APP_DIR}' && git fetch --prune origin && git checkout -B '${REPO_BRANCH}' 'origin/${REPO_BRANCH}' && git reset --hard 'origin/${REPO_BRANCH}' && git clean -fd"
  else
    log "Cloning repo into ${APP_DIR}…"
    sudo -u "${APP_USER}" -H bash -lc "cd '${APP_DIR}' && git clone --branch '${REPO_BRANCH}' --single-branch '${REPO_URL}' ."
  fi

  if [[ -n "${cfg_backup}" && -f "${cfg_backup}" ]]; then
    log "Restoring config.json to ${cfg}…"
    mkdir -p "$(dirname "${cfg}")"
    cp -a "${cfg_backup}" "${cfg}"
    chown "${APP_USER}:${APP_GROUP}" "${cfg}" || true

    warn "Backup left in /tmp: ${cfg_backup}"
    warn "After confirming your settings are correct, you should remove it (e.g. sudo rm -f '${cfg_backup}')."
  fi

  if [[ -n "${cert_backup_dir}" && -d "${cert_backup_dir}" ]]; then
    log "Restoring certs dir to ${cert_dir}…"
    mkdir -p "${cert_dir}"
    cp -a "${cert_backup_dir}/." "${cert_dir}/" || true
    chown -R "${APP_USER}:${APP_GROUP}" "${cert_dir}" || true

    warn "Backup left in /tmp: ${cert_backup_dir}"
    warn "After confirming HTTPS is working, you should remove it (e.g. sudo rm -rf '${cert_backup_dir}')."
  fi
}

main() {
  parse_args "$@"
  require_root
  install_prereqs
  ensure_user
  choose_repo_branch
  log "Installing branch: ${REPO_BRANCH}"
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
