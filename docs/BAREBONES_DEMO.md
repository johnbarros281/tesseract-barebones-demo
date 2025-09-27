# Tesseract Barebones Demo

Minimal Nostr (NIP-01) demo: a relay-lite server and a terminal client.

## Quick start (macOS)

1. Run the installer:
   - scripts/installer-macos.sh
2. Start the host:
   - tesseract-demo-host
3. Start the client:
   - tesseract-demo-client ws://localhost:4000/ws

## Notes

- Relay is in-memory only. No Postgres required.
- Client is read-only in the initial skeleton. Publishing will be added next.
