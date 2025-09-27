# Tesseract Barebones Demo (New Workspace)

This is a minimal Nostr demo monorepo with:
- apps/relay-lite: a lightweight NIP-01 relay (in-memory)
- apps/cli: a terminal client to read from a relay

## Quick start (dev)

- Install deps for this workspace:
  - pnpm -C tesseract-barebones-demo install
- Start relay-lite (dev):
  - pnpm -C tesseract-barebones-demo/apps/relay-lite dev
- Start CLI (dev):
  - pnpm -C tesseract-barebones-demo/apps/cli dev -- ws://localhost:4000/ws

## Build

- Shared package:
  - pnpm -C tesseract-barebones-demo -r --filter @tesseract-demo/shared build
- Relay-lite:
  - pnpm -C tesseract-barebones-demo -r --filter @tesseract-demo/relay-lite build
- CLI:
  - pnpm -C tesseract-barebones-demo -r --filter @tesseract-demo/cli build

## Installer

See scripts/installer-macos.sh for a simple macOS installer that will build and place shims:
- tesseract-demo-host
- tesseract-demo-client

