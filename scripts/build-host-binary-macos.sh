#!/usr/bin/env bash
set -euo pipefail

# Build a self-contained macOS host binary using 'pkg' (no Node runtime required)

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="$ROOT_DIR/out/host-binary"
STAGE="$OUT_DIR/stage"

echo "Building self-contained host binary (pkg)"
rm -rf "$OUT_DIR"
mkdir -p "$STAGE"

echo "1) Build TS: shared + relay"
pnpm -C "$ROOT_DIR" -r --filter @tesseract-demo/shared --filter @tesseract-demo/relay-lite build

echo "2) Stage JS outputs"
mkdir -p "$STAGE/relay-lite" "$STAGE/shared"
rsync -a "$ROOT_DIR/apps/relay-lite/dist/" "$STAGE/relay-lite/"
rsync -a "$ROOT_DIR/packages/shared/dist/" "$STAGE/shared/"

echo "3) Create minimal runtime package.jsons"
# Copy shared package.json to retain dependencies (@noble/*) and adjust main
cp "$ROOT_DIR/packages/shared/package.json" "$STAGE/shared/package.json"
# Switch main from dist/index.js to index.js for staged layout
sed -i '' 's#"main": "dist/index.js"#"main": "index.js"#' "$STAGE/shared/package.json"
# Drop scripts and devDependencies from staged shared package.json
python3 - "$STAGE/shared/package.json" <<'PY'
import json,sys,os
p = sys.argv[1]
data=json.load(open(p))
data.pop('scripts',None)
data.pop('devDependencies',None)
open(p,'w').write(json.dumps(data,indent=2))
PY

echo "4) Install production dependencies in staged shared"
(
  cd "$STAGE/shared"
  npm install --production --no-audit --no-fund --prefer-offline
)

cat > "$STAGE/relay-lite/package.json" <<'EOF'
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

echo "5) Install production dependencies in staged relay"
(
  cd "$STAGE/relay-lite"
  npm install --production --no-audit --no-fund --prefer-offline
)

echo "6) Build binary with pkg"
BIN_DIR="$OUT_DIR/bin"
mkdir -p "$BIN_DIR"

# Prefer local npx; if pkg not installed it will fetch it
(
  cd "$STAGE/relay-lite"
  npx pkg ./index.js \
    --targets node18-macos-arm64 \
    --output "$BIN_DIR/tesseract-demo-host-macos-arm64"
)

echo "\nBuilt binary: $BIN_DIR/tesseract-demo-host-macos-arm64"
echo "Try: $BIN_DIR/tesseract-demo-host-macos-arm64 --ports=4000,4100"
