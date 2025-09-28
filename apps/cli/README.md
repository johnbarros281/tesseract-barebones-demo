# Tesseract Demo CLI (multi-relay)

Quick usage:

- Start two local relays:
  - `pnpm -C ../relay-lite dev` or `node dist/index.js --ports=4000,4100`
- Connect client to multiple relays:
  - `pnpm start ws://localhost:4000/ws ws://localhost:4100/ws`

Inside the client:

- `/targets all` – send to all relays (default)
- `/targets 1,2` – send to specific relay IDs (shown in Status bar)
- `>>1,2 hello` – one-shot send of this message to relay 1 and 2
- `/quit` – exit the client

Environment:

- `RELAYS` can be a comma or space-separated list of relay URLs
- `NOSTR_SK` to use a fixed secret key (hex). Otherwise an ephemeral key is used
