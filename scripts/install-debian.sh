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
BACKGROUNDS_DIR_REL="${BACKGROUNDS_DIR_REL:-server/data/backgrounds}"
BACKUP_DIR_REL="${BACKUP_DIR_REL:-server/data/backups}"
MAX_INSTALLER_BACKUPS=10

log() { echo "[install] $*"; }
warn() { echo "[install][WARN] $*"; }

die() {
  echo "[install][ERROR] $*" >&2
  exit 1
}

require_root() {
  if [[ "${EUID:-$(/usr/bin/id -u)}" -ne 0 ]]; then
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
  if /usr/bin/id -u "${APP_USER}" >/dev/null 2>&1; then
    log "User ${APP_USER} already exists; skipping user creation."
    return 0
  fi

  log "Creating system user ${APP_USER}…"
  /usr/sbin/useradd \
    --system \
    --no-create-home \
    --home-dir "${APP_DIR}" \
    --shell /usr/sbin/nologin \
    "${APP_USER}"
}

prune_installer_backups() {
  # Remove the oldest installer backup sets, keeping at most MAX_INSTALLER_BACKUPS.
  local bk_dir="${APP_DIR}/${BACKUP_DIR_REL}"
  [[ -d "${bk_dir}" ]] || return 0

  # Each installer run creates files matching "install.<stamp>.*"
  # Collect unique stamps, newest first.
  local stamps
  stamps="$(find "${bk_dir}" -maxdepth 1 -name 'install.*' -printf '%f\n' 2>/dev/null \
    | sed 's/^install\.\([0-9T]*Z\).*/\1/' \
    | sort -ru \
    | uniq)"
  [[ -n "${stamps}" ]] || return 0

  local count=0
  while IFS= read -r s; do
    count=$((count + 1))
    if (( count > MAX_INSTALLER_BACKUPS )); then
      log "Pruning old installer backup set: ${s}"
      /usr/bin/rm -rf "${bk_dir}"/install."${s}".* || true
    fi
  done <<< "${stamps}"
}

ensure_repo() {
  /usr/bin/mkdir -p "${APP_DIR}"
  /usr/bin/chown -R "${APP_USER}:${APP_GROUP}" "${APP_DIR}"

  # Backup directory lives inside server/data/ which is gitignored,
  # so it survives git clean -fd.  All installer backups go here.
  local bk_dir="${APP_DIR}/${BACKUP_DIR_REL}"
  /usr/bin/mkdir -p "${bk_dir}"
  /usr/bin/chown "${APP_USER}:${APP_GROUP}" "${bk_dir}" || true

  # Preserve user-specific files across updates (the update uses git clean).
  local cfg cert_dir backgrounds_dir
  cfg="${APP_DIR}/${CONFIG_FILE_REL}"
  cert_dir="${APP_DIR}/${CERT_DIR_REL}"
  backgrounds_dir="${APP_DIR}/${BACKGROUNDS_DIR_REL}"

  local stamp
  stamp="$(/usr/bin/date -u +%Y%m%dT%H%M%SZ)"

  local cfg_backup="" cert_backup_dir="" backgrounds_backup_dir=""

  if [[ -f "${cfg}" ]]; then
    cfg_backup="${bk_dir}/install.${stamp}.config.json"
    log "Backing up config.json…"
    /usr/bin/cp -a "${cfg}" "${cfg_backup}"
    /usr/bin/chmod 600 "${cfg_backup}" || true
  fi

  if [[ -d "${cert_dir}" ]]; then
    cert_backup_dir="${bk_dir}/install.${stamp}.certs"
    log "Backing up certs…"
    /usr/bin/mkdir -p "${cert_backup_dir}"
    /usr/bin/cp -a "${cert_dir}/." "${cert_backup_dir}/" || true
    /usr/bin/chmod -R 600 "${cert_backup_dir}" || true
  fi

  if [[ -d "${backgrounds_dir}" ]]; then
    backgrounds_backup_dir="${bk_dir}/install.${stamp}.backgrounds"
    log "Backing up backgrounds…"
    /usr/bin/mkdir -p "${backgrounds_backup_dir}"
    /usr/bin/cp -a "${backgrounds_dir}/." "${backgrounds_backup_dir}/" || true
  fi

  # Check if this is a valid git repository
  if [[ -d "${APP_DIR}/.git" ]] && git -C "${APP_DIR}" rev-parse --git-dir >/dev/null 2>&1; then
    log "Updating existing repo in ${APP_DIR}…"
    sudo -u "${APP_USER}" -H bash -lc "cd '${APP_DIR}' && git fetch --prune origin && git checkout -B '${REPO_BRANCH}' 'origin/${REPO_BRANCH}' && git reset --hard 'origin/${REPO_BRANCH}' && git clean -fd"
  else
    # Not a valid git repo - need to initialize it
    log "Setting up git repository in ${APP_DIR}…"
    
    # If there's an invalid .git directory, remove it
    if [[ -d "${APP_DIR}/.git" ]]; then
      warn "Removing invalid .git directory…"
      /usr/bin/rm -rf "${APP_DIR}/.git" || true
    fi
    
    # Remove any default shell dotfiles that useradd might have created
    /usr/bin/rm -f "${APP_DIR}/.bashrc" "${APP_DIR}/.profile" "${APP_DIR}/.bash_logout" || true
    
    # Initialize as git repo and add remote
    if ! sudo -u "${APP_USER}" -H bash -lc "cd '${APP_DIR}' && git init -b '${REPO_BRANCH}'"; then
      die "Failed to initialize git repository in ${APP_DIR}"
    fi
    
    if ! sudo -u "${APP_USER}" -H bash -lc "cd '${APP_DIR}' && { git remote get-url origin >/dev/null 2>&1 && git remote set-url origin '${REPO_URL}' || git remote add origin '${REPO_URL}'; }"; then
      die "Failed to configure git remote: ${REPO_URL}"
    fi
    
    log "Fetching ${REPO_BRANCH} from remote…"
    if ! sudo -u "${APP_USER}" -H bash -lc "cd '${APP_DIR}' && git fetch origin '${REPO_BRANCH}'"; then
      die "Failed to fetch branch '${REPO_BRANCH}' from remote"
    fi
    
    if ! sudo -u "${APP_USER}" -H bash -lc "cd '${APP_DIR}' && git checkout -f -B '${REPO_BRANCH}' 'origin/${REPO_BRANCH}' && git reset --hard 'origin/${REPO_BRANCH}' && git clean -fd"; then
      die "Failed to checkout branch '${REPO_BRANCH}'"
    fi
  fi

  # Restore preserved files
  if [[ -n "${cfg_backup}" && -f "${cfg_backup}" ]]; then
    log "Restoring config.json…"
    /usr/bin/mkdir -p "$(/usr/bin/dirname "${cfg}")"
    /usr/bin/cp -a "${cfg_backup}" "${cfg}"
    /usr/bin/chown "${APP_USER}:${APP_GROUP}" "${cfg}" || true
    /usr/bin/chmod 600 "${cfg}" || true
  fi

  if [[ -n "${cert_backup_dir}" && -d "${cert_backup_dir}" ]]; then
    log "Restoring certs…"
    /usr/bin/mkdir -p "${cert_dir}"
    /usr/bin/cp -a "${cert_backup_dir}/." "${cert_dir}/" || true
    /usr/bin/chown -R "${APP_USER}:${APP_GROUP}" "${cert_dir}" || true
    /usr/bin/chmod -R 600 "${cert_dir}" || true
  fi

  if [[ -n "${backgrounds_backup_dir}" && -d "${backgrounds_backup_dir}" ]]; then
    log "Restoring backgrounds…"
    /usr/bin/mkdir -p "${backgrounds_dir}"
    /usr/bin/cp -a "${backgrounds_backup_dir}/." "${backgrounds_dir}/" || true
    /usr/bin/chown -R "${APP_USER}:${APP_GROUP}" "${backgrounds_dir}" || true
  fi

  # Prune old installer backup sets
  prune_installer_backups
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
