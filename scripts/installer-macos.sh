#!/usr/bin/env bash
set -euo pipefail

echo "Tesseract Barebones Demo - macOS Installer"

need_cmd() { command -v "$1" >/dev/null 2>&1; }

if ! need_cmd brew; then
  echo "Homebrew not found. Installing Homebrew is recommended for Node install." >&2
  echo "Visit https://brew.sh and install Homebrew, then re-run this installer." >&2
  exit 1
fi

if ! need_cmd node; then
  echo "Installing Node.js LTS via Homebrew…"
  brew install node@20
fi

if ! need_cmd pnpm; then
  echo "Installing pnpm via Corepack…"
  corepack enable || true
  corepack prepare pnpm@latest --activate
fi

PREFIX="/usr/local/lib/tesseract-demo"
BIN="/usr/local/bin"
mkdir -p "$PREFIX"

echo "Building packages…"
pnpm install
pnpm -r --filter @tesseract-demo/shared build
pnpm -r --filter @tesseract-demo/relay-lite build
pnpm -r --filter @tesseract-demo/cli build

echo "Copying artifacts to $PREFIX…"
rsync -a apps/relay-lite/dist "$PREFIX/relay-lite" --delete
rsync -a apps/cli/dist "$PREFIX/cli" --delete
rsync -a packages/shared/dist "$PREFIX/shared" --delete

echo "Creating launchers…"
cat > "$BIN/tesseract-demo-host" <<EOF
#!/usr/bin/env bash
node "$PREFIX/relay-lite/index.js" "${@}"
EOF
chmod +x "$BIN/tesseract-demo-host"

cat > "$BIN/tesseract-demo-client" <<EOF
#!/usr/bin/env bash
node "$PREFIX/cli/index.js" "${@}"
EOF
chmod +x "$BIN/tesseract-demo-client"

echo "Install complete. Try:\n  tesseract-demo-host --ports=4000,4100\n  tesseract-demo-client ws://localhost:4000/ws ws://localhost:4100/ws\n  # In the client, use: /targets all | /targets 1,2 or prefix once: >>1,2 hello"
