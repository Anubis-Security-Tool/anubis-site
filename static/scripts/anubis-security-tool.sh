#!/usr/bin/env bash
# Anubis-Security-Tool desktop installer bootstrapper (Linux / macOS).
#   curl -fsSL https://download.anubis.locker/scripts/anubis-security-tool.sh | bash
#   # or: wget -qO- https://download.anubis.locker/scripts/anubis-security-tool.sh | bash
#
# Picks the right package for the OS (deb/rpm/AppImage on Linux, dmg on macOS),
# downloads it from the release manifest on ANUBIS_UPDATE_URL, installs it
# (sudo requested only if needed), and reports success/failure to
# ANUBIS_API_URL/api/report.
set -Eeuo pipefail

ANUBIS_UPDATE_URL="${ANUBIS_UPDATE_URL:-https://update.anubis.locker}"
ANUBIS_API_URL="${ANUBIS_API_URL:-https://api.anubis.locker}"
VERBOSE=0
for arg in "$@"; do
  case "$arg" in
    --console|-v|--verbose) VERBOSE=1 ;;
  esac
done

TMP_DIR="$(mktemp -d /tmp/anubis-install.XXXXXX)"
REL_JSON="${TMP_DIR}/anubis-release.json"
INSTALL_ID="$(cat /proc/sys/kernel/random/uuid 2>/dev/null || uuidgen 2>/dev/null || date +%s%N)"

log () { [ "$VERBOSE" = 1 ] && printf '\033[1;34m[anubis]\033[0m %s\n' "$*" || true; }

report () {
  # type message -- best-effort, never fails the script
  local type="$1" msg="${2:-}"
  curl -fsSL -m 5 -X POST "${ANUBIS_API_URL}/api/report" \
    -H 'Content-Type: application/json' \
    -d "{\"installId\":\"${INSTALL_ID}\",\"type\":\"${type}\",\"app\":\"anubis-desktop\",\"platform\":\"$(uname -s)\",\"message\":\"${msg}\"}" \
    >/dev/null 2>&1 || true
}

die () { echo "[anubis] ERROR: $*" >&2; report error "$*"; exit 1; }
trap 'die "failed at line ${LINENO}"' ERR

command -v curl >/dev/null 2>&1 || die "curl is required"

log "Fetching release manifest from ${ANUBIS_UPDATE_URL}"
curl -fsSL "${ANUBIS_UPDATE_URL}/data/anubis-release.json" -o "${REL_JSON}" || die "could not fetch release manifest"

OS="$(uname -s)"
ARCH_RAW="$(uname -m)"
case "$ARCH_RAW" in
  x86_64|amd64) ARCH="x64" ;;
  arm64|aarch64) ARCH="arm64" ;;
  *) ARCH="$ARCH_RAW" ;;
esac

pick_asset () {
  # $1 = node -e script body selecting a name; prints browser_download_url or empty
  node -e "
    const j = require('${REL_JSON}');
    const assets = j.release.assets || [];
    const pats = $1;
    for (const p of pats) {
      const a = assets.find(x => new RegExp(p).test(x.name));
      if (a) { console.log(a.browser_download_url); process.exit(0); }
    }
  " 2>/dev/null || true
}

if command -v node >/dev/null 2>&1; then
  if [ "$OS" = "Darwin" ]; then
    ASSET_URL="$(pick_asset "['mac-${ARCH}.*\\\\.dmg$', '\\\\.dmg$']")"
  elif command -v dpkg >/dev/null 2>&1; then
    ASSET_URL="$(pick_asset "['linux-${ARCH}.*\\\\.deb$', '\\\\.deb$']")"
  elif command -v rpm >/dev/null 2>&1; then
    ASSET_URL="$(pick_asset "['linux-${ARCH}.*\\\\.rpm$', '\\\\.rpm$']")"
  else
    ASSET_URL="$(pick_asset "['linux-${ARCH}.*\\\\.AppImage$', '\\\\.AppImage$']")"
  fi
else
  die "node is required to parse the release manifest (install Node.js 20+)"
fi

[ -n "${ASSET_URL:-}" ] || die "no matching release asset found for ${OS}/${ARCH}"

ASSET_NAME="$(basename "$ASSET_URL")"
ASSET_PATH="${TMP_DIR}/${ASSET_NAME}"
log "Downloading ${ASSET_NAME}"
curl -fsSL "$ASSET_URL" -o "$ASSET_PATH" || die "download failed"

SUDO=""
[ "$(id -u)" -ne 0 ] && command -v sudo >/dev/null 2>&1 && SUDO="sudo"

case "$ASSET_NAME" in
  *.deb)
    log "Installing via dpkg"
    $SUDO dpkg -i "$ASSET_PATH" || $SUDO apt-get -f install -y
    ;;
  *.rpm)
    log "Installing via rpm"
    $SUDO rpm -Uvh "$ASSET_PATH"
    ;;
  *.AppImage)
    log "Installing AppImage to /opt/anubis"
    $SUDO mkdir -p /opt/anubis
    $SUDO cp "$ASSET_PATH" /opt/anubis/anubis.AppImage
    $SUDO chmod +x /opt/anubis/anubis.AppImage
    $SUDO ln -sf /opt/anubis/anubis.AppImage /usr/local/bin/anubis 2>/dev/null || true
    ;;
  *.dmg)
    log "Mounting and installing dmg"
    MOUNT_DIR="$(mktemp -d)"
    hdiutil attach "$ASSET_PATH" -mountpoint "$MOUNT_DIR" -nobrowse -quiet
    APP_SRC="$(find "$MOUNT_DIR" -maxdepth 1 -name '*.app' | head -n1)"
    [ -n "$APP_SRC" ] || die "no .app bundle found inside dmg"
    $SUDO cp -R "$APP_SRC" /Applications/
    hdiutil detach "$MOUNT_DIR" -quiet
    ;;
  *)
    die "unsupported asset type: ${ASSET_NAME}"
    ;;
esac

log "Install complete."
report install ""
echo "Anubis-Security-Tool installed. Launch it from your applications menu."
