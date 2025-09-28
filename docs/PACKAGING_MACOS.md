# Packaging the Host (macOS .pkg)

This creates a signed-unverified (ad-hoc) pkg that installs the host relay under
`/usr/local/lib/tesseract-demo` and a launcher at `/usr/local/bin/tesseract-demo-host`.

Steps:

1. Build and package:
   - `bash scripts/package-host-macos.sh`
2. Install:
   - Open the generated `.pkg` in `out/host-pkg/` or run:
     - `sudo installer -pkg out/host-pkg/TesseractDemoHost.pkg -target /`
3. Run:
   - `tesseract-demo-host --ports=4000,4100`

Notes:
- This script bundles JS and node_modules; Node must be present on the target. For a self-contained binary, see below.
- For public access, pair with Cloudflare Tunnel:
  - `cloudflared tunnel --url http://localhost:4000`

## Self-contained binary (no Node required)

We provide two scripts:

1) Build the binary using pkg

```
bash scripts/build-host-binary-macos.sh
```

This produces `out/host-binary/bin/tesseract-demo-host-macos-arm64`.

2) Wrap the binary in a .pkg installer

```
bash scripts/package-host-binary-macos.sh
```

This produces `out/host-binary-pkg/TesseractDemoHostBinary.pkg` that installs
the binary to `/usr/local/lib/tesseract-demo/bin/` and creates a launcher at
`/usr/local/bin/tesseract-demo-host`.

Architectures:
- The script currently targets `node20-macos-arm64` (Apple Silicon). For Intel Macs,
   change the pkg target to `node20-macos-x64` and rebuild. We can make this selectable.
