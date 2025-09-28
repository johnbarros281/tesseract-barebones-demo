#!/usr/bin/env bash
set -euo pipefail

# Package the self-contained host binary into a .pkg
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="$ROOT_DIR/out/host-binary-pkg"
BIN_SOURCE="$ROOT_DIR/out/host-binary/bin/tesseract-demo-host-macos-arm64"
STAGE_ROOT="$OUT_DIR/root"
PREFIX="/usr/local/lib/tesseract-demo"
PKG_ID="com.tesseract.demo.host.bin"
PKG_NAME="TesseractDemoHostBinary"

if [ ! -f "$BIN_SOURCE" ]; then
  echo "Binary not found at $BIN_SOURCE. Run scripts/build-host-binary-macos.sh first." >&2
  exit 1
fi

rm -rf "$OUT_DIR"
mkdir -p "$STAGE_ROOT$PREFIX/bin" "$ROOT_DIR/packaging/macos/scripts"

cp "$BIN_SOURCE" "$STAGE_ROOT$PREFIX/bin/tesseract-demo-host"
chmod +x "$STAGE_ROOT$PREFIX/bin/tesseract-demo-host"

cat > "$ROOT_DIR/packaging/macos/scripts/postinstall" <<'EOF'
#!/usr/bin/env bash
set -e
BIN="/usr/local/bin/tesseract-demo-host"
SRC="/usr/local/lib/tesseract-demo/bin/tesseract-demo-host"
mkdir -p "/usr/local/bin"
ln -sf "$SRC" "$BIN"
chmod +x "$SRC"
echo "Installed tesseract-demo-host binary -> $SRC"
EOF
chmod +x "$ROOT_DIR/packaging/macos/scripts/postinstall"

PKG_PATH="$OUT_DIR/$PKG_NAME.pkg"
pkgbuild \
  --root "$STAGE_ROOT" \
  --identifier "$PKG_ID" \
  --version "0.1.0" \
  --install-location "/" \
  --scripts "$ROOT_DIR/packaging/macos/scripts" \
  "$PKG_PATH"

echo "\nPkg created: $PKG_PATH"
echo "Install with: sudo installer -pkg \"$PKG_PATH\" -target /"