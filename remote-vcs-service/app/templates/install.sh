#!/usr/bin/env bash
set -euo pipefail

download=${DICODE_DOWNLOAD_BASE_URL:-"__DOWNLOAD_BASE_URL__"}
base=${DICODE_BASE_URL:-"__DICODE_BASE_URL__"}
download=${download%/}
base=${base%/}
version=${VERSION:-}
modify=true
dir=${DICODE_INSTALL_DIR:-"$HOME/.dicode/bin"}

usage() {
  cat <<EOF
Dicode Installer

Usage: install.sh [options]

  -v, --version VERSION  Install a specific version
      --no-modify-path   Do not update shell configuration
  -h, --help             Show this help

Examples:
  curl -fsSL ${download}/install.sh | bash
  curl -fsSL ${download}/install.sh | bash -s -- --version 1.0.0
  dicode upgrade
EOF
}

die() {
  echo "dicode: $1" >&2
  exit 1
}

fetch() {
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL --connect-timeout 15 --max-time 600 "$1" -o "$2"
    return
  fi
  if command -v wget >/dev/null 2>&1; then
    wget -q --timeout=600 "$1" -O "$2"
    return
  fi
  die "curl or wget is required"
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    -v|--version)
      [ "$#" -gt 1 ] || die "--version requires a value"
      version=$2
      shift 2
      ;;
    --no-modify-path)
      modify=false
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      die "unknown option: $1"
      ;;
  esac
done

case "$(uname -s)" in
  Linux*) os=linux ;;
  Darwin*) os=darwin ;;
  *) die "unsupported operating system: $(uname -s)" ;;
esac

case "$(uname -m)" in
  x86_64|amd64) arch=x64 ;;
  arm64|aarch64) arch=arm64 ;;
  *) die "unsupported architecture: $(uname -m)" ;;
esac

target="dicode-${os}-${arch}"
if [ "$arch" = x64 ]; then
  if [ "$os" = linux ] && ! grep -qwi avx2 /proc/cpuinfo 2>/dev/null; then
    target="${target}-baseline"
  elif [ "$os" = darwin ] && [ "$(sysctl -n hw.optional.avx2_0 2>/dev/null || true)" != 1 ]; then
    target="${target}-baseline"
  fi
fi
if [ "$os" = linux ] && { [ -f /etc/alpine-release ] || ldd --version 2>&1 | grep -qi musl; }; then
  target="${target}-musl"
fi

tmp=$(mktemp -d "${TMPDIR:-/tmp}/dicode.XXXXXX")
trap 'rm -rf "$tmp"' EXIT

if [ -z "$version" ]; then
  fetch "${download}/dicode/pkg/latest.json" "$tmp/latest.json"
  version=$(sed -n 's/.*"tag_name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$tmp/latest.json" | head -n 1)
  [ -n "$version" ] || die "latest version could not be determined"
fi
version=${version#v}

archive="${target}.tar.gz"
url="${download}/dicode/pkg/${version}/${archive}"
echo "Installing Dicode ${version} for ${os}/${arch}..."
if ! fetch "$url" "$tmp/$archive" 2>/dev/null; then
  case "$target" in
    *-x64-musl)
      target="${target%-musl}-baseline-musl"
      ;;
    *-x64)
      target="${target}-baseline"
      ;;
    *)
      die "no package is available for ${os}/${arch}"
      ;;
  esac
  archive="${target}.tar.gz"
  url="${download}/dicode/pkg/${version}/${archive}"
  echo "Optimized package unavailable; using baseline package..."
  fetch "$url" "$tmp/$archive" || die "failed to download ${archive}"
fi
fetch "${url}.sha256" "$tmp/$archive.sha256"

expected=$(awk '{print $1}' "$tmp/$archive.sha256")
if command -v sha256sum >/dev/null 2>&1; then
  actual=$(sha256sum "$tmp/$archive" | awk '{print $1}')
elif command -v shasum >/dev/null 2>&1; then
  actual=$(shasum -a 256 "$tmp/$archive" | awk '{print $1}')
else
  die "sha256sum or shasum is required"
fi
[ "$actual" = "$expected" ] || die "package checksum verification failed"

mkdir -p "$tmp/unpack"
tar -xzf "$tmp/$archive" -C "$tmp/unpack"
binary=$(find "$tmp/unpack" -type f \( -name dicode -o -name cs \) | head -n 1)
[ -n "$binary" ] || die "the package does not contain a dicode executable"
chmod 755 "$binary"

mkdir -p "$dir"
new="$dir/.dicode.new.$$"
cp "$binary" "$new"
chmod 755 "$new"
if ! (cd "$dir" && "$new" --version) >/dev/null 2>&1; then
  rm -f "$new"
  die "the downloaded executable failed its verification check"
fi
if [ -f "$dir/dicode" ]; then
  mv "$dir/dicode" "$dir/dicode.old"
fi
mv "$new" "$dir/dicode"
if ! (cd "$dir" && "$dir/dicode" --version) >/dev/null 2>&1; then
  rm -f "$dir/dicode"
  if [ -f "$dir/dicode.old" ]; then
    mv "$dir/dicode.old" "$dir/dicode"
  fi
  die "the installed executable failed its verification check"
fi
rm -f "$dir/dicode.old"

if [ "$modify" = true ]; then
  case "${SHELL:-}" in
    */zsh) rc="$HOME/.zshrc" ;;
    */bash) rc="$HOME/.bashrc" ;;
    *) rc="$HOME/.profile" ;;
  esac
  touch "$rc"
  clean="$tmp/rc"
  awk '
    $0 == "# Dicode" { skip=1; next }
    skip && /^export / { next }
    { skip=0; print }
  ' "$rc" > "$clean"
  cp "$clean" "$rc"
  {
    echo
    echo "# Dicode"
    echo "export PATH=\"$dir:\$PATH\""
    echo "export DICODE_BASE_URL=\"$base\""
    echo "export DICODE_DOWNLOAD_BASE_URL=\"$download\""
  } >> "$rc"
  echo "Updated Dicode configuration in $rc"
fi

echo "Dicode ${version} installed at $dir/dicode"
echo "Restart your shell, then run: dicode --version"
echo "To update later, run: dicode upgrade"
