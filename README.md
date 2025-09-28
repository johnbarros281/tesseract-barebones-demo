# Tesseract Barebones Demo

A minimal Nostr demo in a pnpm monorepo with:
- apps/relay-lite: a lightweight NIP-01 relay (in-memory) with a Blessed TUI
- apps/cli: a terminal client that can connect to multiple relays, select targets, and publish signed notes

This README covers:
- Installing the host as a macOS package (no Node required) or via build+shims
- Running the host on one or multiple ports; handling busy ports gracefully
- Setting up a temporary Cloudflare Tunnel for public access
- Running the demo client (multi-relay, targets, /setuser)
- Clean-environment testing and troubleshooting

---

## 1) Install the Host

You have two ways to install the host on macOS.

### Option A: Self-contained binary (.pkg) – No Node required

Build and package (from this repo):

```
bash scripts/build-host-binary-macos.sh
bash scripts/package-host-binary-macos.sh
```

Install on the target Mac:

```
sudo installer -pkg "out/host-binary-pkg/TesseractDemoHostBinary.pkg" -target /
```

This installs:
- Binary: /usr/local/lib/tesseract-demo/bin/tesseract-demo-host
- Launcher: /usr/local/bin/tesseract-demo-host

### Option B: Build and install shims (requires Node)

On a Mac that has Node and pnpm:

```
bash scripts/installer-macos.sh
```

This builds the workspace and installs:
- /usr/local/lib/tesseract-demo/{relay-lite,shared,cli}
- Launchers:
  - tesseract-demo-host
  - tesseract-demo-client

---

## 2) Run the Host

Start one or more relay instances. The host opens a full-screen TUI that shows messages like a chat feed.

Examples:

```
# One port (default 4000)
tesseract-demo-host --port=4000

# Multiple ports in one process
tesseract-demo-host --ports=4000,4100
```

Behavior when ports are busy:
- If a requested port is already in use (e.g., a permanent relay bound via Cloudflare), the host will NOT exit.
- The TUI will display: "Port <port> is already in use. Skipping this relay (UI stays open)."
- Any free ports will start; if all requested ports are busy you will see an informational message and the TUI stays open.

HTTP endpoints (per instance):
- GET / → basic info
- GET /health → { status: "ok" }
WebSocket path: /ws

---

## 3) Temporary public access with Cloudflare Tunnel

On the same machine that runs the host:

```
brew install cloudflared    # once
cloudflared tunnel --url http://localhost:4000
```

Cloudflare prints a temporary https URL. The relay WebSocket is available at:

```
wss://<random-subdomain>.trycloudflare.com/ws
```

If you started the host on a different port, swap the port in the tunnel command. You can run multiple tunnels (one per local port) if needed.

---

## 4) Run the Demo Client (multi-relay)

From this workspace (built CLI) or copied dist files:

```
# Connect to one relay
node apps/cli/dist/index.js ws://localhost:4000/ws

# Connect to multiple relays
node apps/cli/dist/index.js ws://localhost:4000/ws ws://localhost:4100/ws

# Or with a tunnel URL
node apps/cli/dist/index.js wss://<random-subdomain>.trycloudflare.com/ws
```

Inside the client:
- /setuser Alice → sets a display name; outgoing notes will be prefixed like "[Alice] hello"
- /targets all → send to all relays (default)
- /targets 1,2 → send only to relays 1 and 2 (IDs shown in the status bar)
- >>1,2 hello → one-shot message to relays 1 and 2
- /quit → exit

Environment variables:
- RELAYS="ws://host1/ws ws://host2/ws" → multiple relay URLs
- NOSTR_SK=<hex> → use a fixed secret key; otherwise an ephemeral key is generated per run

---

## 5) Clean-environment test (prove no dependencies required)

When installed from the binary .pkg, you can run the host in an empty environment:

```
env -i PATH=/usr/bin:/bin:/usr/sbin:/sbin \
  /usr/local/lib/tesseract-demo/bin/tesseract-demo-host --port=4000
```

Quick checks (from another terminal or machine):

```
curl http://<host-ip>:4000/health
node apps/cli/dist/index.js ws://<host-ip>:4000/ws
```

Finding your LAN IP:

```
IF=$(route -n get default 2>/dev/null | awk '/interface:/{print $2}'); ipconfig getifaddr "$IF"
```

---

## 6) Development

Install deps and build:

```
pnpm -C tesseract-barebones-demo install
pnpm -C tesseract-barebones-demo -r --filter @tesseract-demo/shared --filter @tesseract-demo/relay-lite --filter @tesseract-demo/cli build
```

Dev servers:

```
pnpm -C tesseract-barebones-demo/apps/relay-lite dev
pnpm -C tesseract-barebones-demo/apps/cli dev -- ws://localhost:4000/ws
```

Packaging docs:
- docs/PACKAGING_MACOS.md covers both the “JS + deps” pkg and the self-contained binary pkg.

---

## 7) Troubleshooting

- Port already in use (EADDRINUSE):
  - The host now stays up and shows a message for each busy port. Remove the busy port from --ports or stop the conflicting process to start a relay on that port. You can still use the UI and any other ports that started.

- Can’t connect from another device on LAN:
  - Verify the host is listening (default 0.0.0.0) and macOS firewall allows incoming for the binary.
  - Confirm the IP and port: curl http://<host-ip>:4000/health
  - Use ws://<host-ip>:4000/ws in the client.

- Public connectivity:
  - Use Cloudflare Tunnel: cloudflared tunnel --url http://localhost:<port>
  - Client connects to wss://<tunnel>/ws

- Clean reinstall:
  - Remove and forget receipts:
    - sudo rm -rf /usr/local/lib/tesseract-demo /usr/local/bin/tesseract-demo-host
    - sudo pkgutil --forget com.tesseract.demo.host.bin 2>/dev/null || true
    - sudo pkgutil --forget com.tesseract.demo.host 2>/dev/null || true

