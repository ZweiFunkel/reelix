#!/usr/bin/env bash
# Reelix update script.
#
# Pulls the latest source, rebuilds the local Docker image, and restarts
# the stack. Asks where things live on first run, then remembers — pass
# --reconfigure to change those paths later.
#
# Usage: ./update.sh
#    or: ./update.sh --reconfigure

set -euo pipefail

CONFIG_FILE="${REELIX_UPDATE_CONFIG:-$HOME/.reelix-update.conf}"

log()  { printf '\033[1;36m==>\033[0m %s\n' "$1"; }
warn() { printf '\033[1;33m!!\033[0m %s\n' "$1"; }
die()  { printf '\033[1;31mERROR:\033[0m %s\n' "$1" >&2; exit 1; }

prompt() {
  # prompt <var-name> <question> <default>
  local __var="$1" __question="$2" __default="$3" __answer
  read -r -p "$__question [$__default]: " __answer || true
  printf -v "$__var" '%s' "${__answer:-$__default}"
}

load_config() {
  [[ -f "$CONFIG_FILE" ]] && source "$CONFIG_FILE"
}

save_config() {
  {
    echo "REPO_DIR=$REPO_DIR"
    echo "INSTALL_DIR=$INSTALL_DIR"
    echo "IMAGE_TAG=$IMAGE_TAG"
    echo "PORT=$PORT"
  } > "$CONFIG_FILE"
  log "Saved config to $CONFIG_FILE (delete it, or run with --reconfigure, to change these later)."
}

configure() {
  echo
  log "Where does your Reelix checkout live? (the folder with Dockerfile in it — 'git pull' runs here)"
  prompt REPO_DIR "Repo directory" "${REPO_DIR:-$HOME/reelix}"
  [[ -d "$REPO_DIR/.git" ]] || warn "'$REPO_DIR' doesn't look like a git checkout — double check the path."

  echo
  log "Where's your docker-compose.yml? (this is what gets restarted)"
  prompt INSTALL_DIR "Install directory" "${INSTALL_DIR:-/opt/reelix}"
  [[ -f "$INSTALL_DIR/docker-compose.yml" ]] || warn "No docker-compose.yml found in '$INSTALL_DIR' yet."

  echo
  prompt IMAGE_TAG "Local image tag (must match the 'image:' line in docker-compose.yml)" "${IMAGE_TAG:-reelix:local}"
  prompt PORT "HTTP port Reelix listens on" "${PORT:-8096}"

  save_config
}

main() {
  log "Reelix updater"

  load_config
  if [[ "${1:-}" == "--reconfigure" ]] || [[ -z "${REPO_DIR:-}" ]]; then
    configure
  else
    log "Using saved config from $CONFIG_FILE (repo: $REPO_DIR, install: $INSTALL_DIR, image: $IMAGE_TAG, port: $PORT)"
  fi

  [[ -d "$REPO_DIR" ]] || die "Repo directory '$REPO_DIR' doesn't exist. Re-run with --reconfigure."
  [[ -f "$INSTALL_DIR/docker-compose.yml" ]] || die "No docker-compose.yml in '$INSTALL_DIR'. Re-run with --reconfigure."

  log "Pulling latest source in $REPO_DIR..."
  (cd "$REPO_DIR" && git pull)

  log "Building $IMAGE_TAG from $REPO_DIR (this can take a few minutes)..."
  docker build -t "$IMAGE_TAG" "$REPO_DIR"

  log "Restarting the stack in $INSTALL_DIR..."
  (cd "$INSTALL_DIR" && docker compose up -d)

  log "Waiting for Reelix to become healthy..."
  for _ in $(seq 1 30); do
    if curl -fsS "http://localhost:${PORT}/api/health" >/dev/null 2>&1; then
      log "Reelix is back up on port $PORT."
      exit 0
    fi
    sleep 1
  done

  warn "Reelix didn't respond within 30s. Check logs with: docker compose -f $INSTALL_DIR/docker-compose.yml logs"
}

main "$@"
