#!/usr/bin/env bash
# Reelix guided installer.
#
# Handles everything infrastructure-level on a fresh Linux box (Docker,
# install directory, ports, media mounts). Once this finishes, open the
# printed URL in a browser — the rest of the setup (admin account,
# libraries) happens there.
#
# Usage: curl -fsSL https://get.reelix.dev/install.sh | bash
#    or: ./install.sh   (after copying this repo's deploy/ dir to the server)

set -euo pipefail

IMAGE="novexlabs/reelix:latest"
DEFAULT_INSTALL_DIR="/opt/reelix"
DEFAULT_PORT="8096"

log()  { printf '\033[1;36m==>\033[0m %s\n' "$1"; }
warn() { printf '\033[1;33m!!\033[0m %s\n' "$1"; }
die()  { printf '\033[1;31mERROR:\033[0m %s\n' "$1" >&2; exit 1; }

prompt() {
  # prompt <var-name> <question> <default>
  local __var="$1" __question="$2" __default="$3" __answer
  read -r -p "$__question [$__default]: " __answer || true
  printf -v "$__var" '%s' "${__answer:-$__default}"
}

require_root_or_sudo() {
  if [[ "$(id -u)" -ne 0 ]] && ! command -v sudo >/dev/null 2>&1; then
    die "This script needs root or sudo to install Docker / write to the install directory."
  fi
}

as_root() {
  if [[ "$(id -u)" -eq 0 ]]; then
    "$@"
  else
    sudo "$@"
  fi
}

check_or_install_docker() {
  if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    log "Docker + Compose plugin already installed."
    return
  fi

  warn "Docker (with the Compose plugin) was not found."
  read -r -p "Install Docker now via the official get.docker.com script? [y/N]: " confirm
  if [[ "${confirm:-N}" =~ ^[Yy]$ ]]; then
    log "Installing Docker (this runs get.docker.com as root)..."
    curl -fsSL https://get.docker.com | as_root sh
    as_root systemctl enable --now docker
  else
    die "Docker is required. Install it yourself, then re-run this script."
  fi
}

main() {
  log "Reelix installer"
  require_root_or_sudo
  check_or_install_docker

  prompt INSTALL_DIR "Install directory" "$DEFAULT_INSTALL_DIR"
  prompt PORT "HTTP port" "$DEFAULT_PORT"

  if [[ -f "$INSTALL_DIR/docker-compose.yml" ]]; then
    warn "$INSTALL_DIR/docker-compose.yml already exists."
    read -r -p "Skip setup and just pull + restart the existing stack? [Y/n]: " reuse
    if [[ ! "${reuse:-Y}" =~ ^[Nn]$ ]]; then
      as_root mkdir -p "$INSTALL_DIR"
      (cd "$INSTALL_DIR" && as_root docker compose pull && as_root docker compose up -d)
      print_ready_message
      exit 0
    fi
  fi

  echo
  log "Media paths — one per library root you want Reelix to see (movies, series, photos, ...)."
  log "Leave the path empty to stop adding more."
  declare -a MOUNTS=()
  while true; do
    read -r -p "Host path to mount (e.g. /srv/media/Filme), or empty to finish: " host_path
    [[ -z "$host_path" ]] && break
    if [[ ! -d "$host_path" ]]; then
      warn "'$host_path' does not exist or is not a directory — skipping."
      continue
    fi
    read -r -p "  Mount name inside the container [$(basename "$host_path")]: " mount_name
    mount_name="${mount_name:-$(basename "$host_path")}"
    MOUNTS+=("      - ${host_path}:/media/${mount_name}:ro")
  done

  as_root mkdir -p "$INSTALL_DIR"

  {
    echo "services:"
    echo "  reelix:"
    echo "    image: ${IMAGE}"
    echo "    container_name: reelix"
    echo "    restart: unless-stopped"
    echo "    ports:"
    echo "      - \"${PORT}:8096\""
    echo "    volumes:"
    echo "      - reelix_config:/config"
    echo "      - reelix_transcode:/transcode"
    for line in "${MOUNTS[@]}"; do
      echo "$line"
    done
    echo "volumes:"
    echo "  reelix_config:"
    echo "  reelix_transcode:"
  } | as_root tee "$INSTALL_DIR/docker-compose.yml" >/dev/null

  log "Wrote $INSTALL_DIR/docker-compose.yml"

  (cd "$INSTALL_DIR" && as_root docker compose pull && as_root docker compose up -d)

  log "Waiting for Reelix to become healthy..."
  for _ in $(seq 1 30); do
    if curl -fsS "http://localhost:${PORT}/api/health" >/dev/null 2>&1; then
      print_ready_message
      exit 0
    fi
    sleep 1
  done

  warn "Reelix didn't respond within 30s. Check logs with: docker compose -f $INSTALL_DIR/docker-compose.yml logs"
}

print_ready_message() {
  local ip
  ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
  echo
  log "Reelix is up. Open this URL to finish setup (create your admin account, add libraries):"
  echo
  echo "    http://${ip:-<this-servers-ip>}:${PORT}"
  echo
}

main "$@"
