#!/usr/bin/env bash
set -euo pipefail

# Build a macOS .pkg that installs the host relay under /usr/local/lib/tesseract-demo
# and creates a launcher at /usr/local/bin/tesseract-demo-host

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="$ROOT_DIR/out/host-pkg"
STAGE_ROOT="$OUT_DIR/root"
PREFIX="/usr/local/lib/tesseract-demo"
PKG_ID="com.tesseract.demo.host"
PKG_NAME="TesseractDemoHost"

echo "Packaging host relay (.pkg)"
rm -rf "$OUT_DIR"
mkdir -p "$STAGE_ROOT$PREFIX" "$OUT_DIR" "$ROOT_DIR/packaging/macos/scripts"

echo "1) Build relay and shared"
pnpm -C "$ROOT_DIR" -r --filter @tesseract-demo/shared --filter @tesseract-demo/relay-lite build

echo "2) Stage files"
mkdir -p "$STAGE_ROOT$PREFIX/relay-lite" "$STAGE_ROOT$PREFIX/shared" "$STAGE_ROOT$PREFIX/bin"

# Copy built JS
rsync -a "$ROOT_DIR/apps/relay-lite/dist/" "$STAGE_ROOT$PREFIX/relay-lite/"
rsync -a "$ROOT_DIR/packages/shared/dist/" "$STAGE_ROOT$PREFIX/shared/"

echo "3) Create minimal package.jsons for runtime"
# Copy shared package.json (retain dependencies) and adjust main for staged layout
cp packages/shared/package.json "$STAGE_ROOT$PREFIX/shared/package.json"
sed -i '' 's#"main": "dist/index.js"#"main": "index.js"#' "$STAGE_ROOT$PREFIX/shared/package.json"

cat > "$STAGE_ROOT$PREFIX/relay-lite/package.json" <<'EOF'
{
  "name": "tesseract-demo-host-runtime",
  "private": true,
  "type": "commonjs",
  "main": "index.js",
  "dependencies": {
    "@fastify/cors": "^9.0.1",
    "blessed": "^0.1.81",
    "fastify": "^4.29.1",
    "ws": "^8.18.0",
    "@tesseract-demo/shared": "file:../shared"
  }
}
EOF

echo "4) Install production dependencies into staged relay"
(
  cd "$STAGE_ROOT$PREFIX/relay-lite"
  npm install --production --no-audit --no-fund --prefer-offline
)

echo "5) Create launcher script"
cat > "$STAGE_ROOT$PREFIX/bin/tesseract-demo-host" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
exec node "$DIR/relay-lite/index.js" "$@"
EOF
chmod +x "$STAGE_ROOT$PREFIX/bin/tesseract-demo-host"

echo "6) Prepare pkg scripts (postinstall symlink)"
cat > "$ROOT_DIR/packaging/macos/scripts/postinstall" <<'EOF'
#!/usr/bin/env bash
set -e
BIN="/usr/local/bin/tesseract-demo-host"
SRC="/usr/local/lib/tesseract-demo/bin/tesseract-demo-host"
mkdir -p "/usr/local/bin"
ln -sf "$SRC" "$BIN"
chmod +x "$SRC"
echo "Installed tesseract-demo-host -> $SRC"
EOF
chmod +x "$ROOT_DIR/packaging/macos/scripts/postinstall"

echo "7) Build .pkg"
PKG_PATH="$OUT_DIR/$PKG_NAME.pkg"
pkgbuild \
  --root "$STAGE_ROOT" \
  --identifier "$PKG_ID" \
  --version "0.1.0" \
  --install-location "/" \
  --scripts "$ROOT_DIR/packaging/macos/scripts" \
  "$PKG_PATH"

echo "\nPkg created: $PKG_PATH"
echo "To install: open the .pkg or run: sudo installer -pkg \"$PKG_PATH\" -target /"
echo "After install: run 'tesseract-demo-host --ports=4000,4100'"