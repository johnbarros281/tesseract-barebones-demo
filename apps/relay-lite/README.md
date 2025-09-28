# Relay Lite (multi-port host)

Start one or more relays on different ports:

- One port (default 4000):
  - `pnpm start`
  - `node dist/index.js`
- Specific port:
  - `node dist/index.js --port=4100`
- Multiple ports:
  - `node dist/index.js --ports=4000,4100`

The TUI will prefix messages with `[port]` so you can see where they arrived. WebSocket upgrade is on `/ws`.
