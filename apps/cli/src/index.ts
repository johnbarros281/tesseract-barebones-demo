import blessed from 'blessed';
import { WebSocket } from 'ws';
import { type NostrEvent, type RelayToClient, signEvent, randomPrivateKeyHex, getPublicKey } from '@tesseract-demo/shared';

const relay = process.env.RELAY_URL || process.argv[2] || '';
if (!relay) {
  console.log('Usage: tesseract-demo-client <ws://host:port/ws>');
  process.exit(1);
}

const screen = blessed.screen({ smartCSR: true, title: 'Tesseract Demo CLI' });
const log = blessed.log({ top: 0, left: 0, width: '100%', height: '80%', border: 'line', label: 'Feed' });
const input = blessed.textbox({ bottom: 0, left: 0, width: '100%', height: 3, border: 'line', label: 'Compose (/quit to exit)' });
screen.append(log);
screen.append(input);

log.log(`Connecting to ${relay}…`);
screen.render();
const ws = new WebSocket(relay);

// Key management (ephemeral for demo; allow override via NOSTR_SK)
const SK = process.env.NOSTR_SK || randomPrivateKeyHex();
const PK = getPublicKey(SK);

ws.on('open', () => {
  log.log(`Connected as npub (hex pubkey): ${PK.slice(0, 16)}…`);
  log.log('Subscribing to recent notes…');
  screen.render();
  const subId = 'sub-' + Math.random().toString(36).slice(2);
  ws.send(JSON.stringify(['REQ', subId, { kinds: [1], limit: 50 }]));
});

ws.on('message', (buf: Buffer) => {
  try {
    const msg = JSON.parse(String(buf)) as RelayToClient;
    if (Array.isArray(msg)) {
      if (msg[0] === 'EVENT') {
        const [, , ev] = msg as ['EVENT', string, NostrEvent];
        log.log(`[${new Date(ev.created_at * 1000).toLocaleTimeString()}] ${ev.pubkey.slice(0, 8)}: ${ev.content}`);
      } else if (msg[0] === 'EOSE') {
        const [, subId] = msg as ['EOSE', string];
        log.log(`EOSE (${subId})`);
      } else if (msg[0] === 'NOTICE') {
        log.log(`NOTICE: ${msg[1]}`);
      } else if (msg[0] === 'OK') {
        log.log(`OK: ${msg[1]} accepted=${msg[2]} reason=${msg[3]}`);
      }
    }
  } catch {}
  screen.render();
});

ws.on('close', () => { log.log('Disconnected.'); screen.render(); });
ws.on('error', (e: unknown) => { log.log(`Error: ${(e as any).message}`); screen.render(); });

input.on('submit', async (value: string) => {
  const text = String(value || '').trim();
  if (!text) { input.clearValue(); input.focus(); screen.render(); return; }
  if (text === '/quit') { process.exit(0); }
  // Publish a kind:1 note
  const base = {
    pubkey: PK,
    kind: 1,
    created_at: Math.floor(Date.now() / 1000),
    tags: [] as string[][],
    content: text,
  };
  try {
    const ev = await signEvent(base as any, SK);
    ws.send(JSON.stringify(['EVENT', ev]));
    log.log(`Published: ${text}`);
  } catch (e) {
    log.log(`Failed to publish: ${(e as any)?.message || e}`);
  }
  input.clearValue();
  input.focus();
  screen.render();
});

screen.key(['C-c'], () => process.exit(0));
input.focus();
screen.render();
