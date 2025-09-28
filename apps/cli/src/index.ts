import blessed from 'blessed';
import { WebSocket } from 'ws';
import { type NostrEvent, type RelayToClient, signEvent, randomPrivateKeyHex, getPublicKey } from '@tesseract-demo/shared';

// Parse relay URLs: supports RELAYS env (comma/space separated) or argv list
function parseRelays(): string[] {
  const env = process.env.RELAYS || process.env.RELAY_URL || '';
  const args = process.argv.slice(2).join(' ');
  const raw = [env, args].filter(Boolean).join(' ').trim();
  const list = raw ? raw.split(/[\s,]+/).filter(Boolean) : [];
  if (list.length) return Array.from(new Set(list));
  // Default to a single local relay
  return ['ws://localhost:4000/ws'];
}

type Conn = { id: number; url: string; ws: WebSocket; status: 'connecting' | 'open' | 'closed' };

const screen = blessed.screen({ smartCSR: true, title: 'Tesseract Demo CLI' });
const log = blessed.log({ top: 0, left: 0, width: '100%', height: '80%', border: 'line', label: 'Feed' });
const status = blessed.box({ bottom: 3, left: 0, width: '100%', height: 3, border: 'line', label: 'Status' });
const input = blessed.textbox({
  bottom: 0,
  left: 0,
  width: '100%',
  height: 3,
  border: 'line',
  label: 'Compose (Enter=send, /setuser name, /targets all|1,2, /quit)',
  inputOnFocus: true,
  keys: true,
  mouse: true,
});
screen.append(log);
screen.append(status);
screen.append(input);

// Key management (ephemeral for demo; allow override via NOSTR_SK)
const SK = process.env.NOSTR_SK || randomPrivateKeyHex();
const PK = getPublicKey(SK);

let sendAll = true;
let targetIds = new Set<number>();
let username: string | null = null;
function renderStatus(conns: Conn[]) {
  const parts = conns.map(c => `[${c.id}] ${c.status === 'open' ? '✓' : c.status === 'connecting' ? '…' : '×'} ${shortUrl(c.url)}`).join('  ');
  const targetText = sendAll ? 'all' : Array.from(targetIds).sort((a,b)=>a-b).join(',') || 'none';
  status.setContent(`Relays: ${parts}\nSend to: ${targetText}   User: ${username || '(unset)'}   Pubkey: ${PK.slice(0, 12)}…`);
}

function shortUrl(u: string) {
  try {
    const { host, pathname } = new URL(u);
    return `${host}${pathname}`;
  } catch { return u; }
}

const urls = parseRelays();
log.log(`Connecting to ${urls.length} relay(s)…`);
screen.render();

const conns: Conn[] = urls.map((url, i) => ({ id: i + 1, url, ws: new WebSocket(url), status: 'connecting' }));
renderStatus(conns);

for (const c of conns) {
  const ws = c.ws;
  ws.on('open', () => {
    c.status = 'open';
    log.log(`[R${c.id}] Connected -> ${c.url}`);
    log.log(`[R${c.id}] Subscribing to recent notes…`);
    renderStatus(conns); screen.render();
    const subId = `sub-${c.id}-${Math.random().toString(36).slice(2)}`;
    ws.send(JSON.stringify(['REQ', subId, { kinds: [1], limit: 50 }]))
  });
  ws.on('message', (buf: Buffer) => {
    try {
      const msg = JSON.parse(String(buf)) as RelayToClient;
      if (Array.isArray(msg)) {
        if (msg[0] === 'EVENT') {
          const [, , ev] = msg as ['EVENT', string, NostrEvent];
          log.log(`[R${c.id}] [${new Date(ev.created_at * 1000).toLocaleTimeString()}] ${ev.pubkey.slice(0, 8)}: ${ev.content}`);
        } else if (msg[0] === 'EOSE') {
          const [, subId] = msg as ['EOSE', string];
          log.log(`[R${c.id}] EOSE (${subId})`);
        } else if (msg[0] === 'NOTICE') {
          log.log(`[R${c.id}] NOTICE: ${msg[1]}`);
        } else if (msg[0] === 'OK') {
          log.log(`[R${c.id}] OK: ${msg[1]} accepted=${msg[2]} reason=${msg[3]}`);
        }
      }
    } catch {}
    screen.render();
  });
  ws.on('close', () => { c.status = 'closed'; log.log(`[R${c.id}] Disconnected.`); renderStatus(conns); screen.render(); });
  ws.on('error', (e: unknown) => { log.log(`[R${c.id}] Error: ${(e as any).message}`); });
}

async function publishTo(text: string, targetConnIds: number[]) {
  const base = {
    pubkey: PK,
    kind: 1,
    created_at: Math.floor(Date.now() / 1000),
    tags: [] as string[][],
    content: username ? `[${username}] ${text}` : text,
  };
  try {
    const ev = await signEvent(base as any, SK);
    const targets = conns.filter(c => targetConnIds.includes(c.id));
    const openTargets = targets.filter(c => c.status === 'open');
    const closedTargets = targets.filter(c => c.status !== 'open');
    for (const c of openTargets) c.ws.send(JSON.stringify(['EVENT', ev]));
    log.log(`Published to ${openTargets.map(c=>`R${c.id}`).join(', ') || 'none'}: ${text}`);
    if (closedTargets.length) log.log(`Skipped (not open): ${closedTargets.map(c=>`R${c.id}`).join(', ')}`);
  } catch (e) {
    log.log(`Failed to publish: ${(e as any)?.message || e}`);
  }
}

function parseTargets(arg: string): number[] | 'all' | null {
  const s = arg.trim().toLowerCase();
  if (!s) return null;
  if (s === 'all' || s === '*') return 'all';
  const list = s.split(/[\s,]+/).map(x => parseInt(x, 10)).filter(n => Number.isFinite(n));
  const valid = list.filter(n => conns.some(c => c.id === n));
  return valid.length ? valid : null;
}

input.on('submit', async (value: string) => {
  const text = String(value || '').trim();
  input.clearValue();
  if (!text) { input.focus(); screen.render(); return; }
  if (text === '/quit') { process.exit(0); }

  // Commands: /setuser name
  if (text.startsWith('/setuser ')) {
    const name = text.slice('/setuser '.length).trim();
    if (!name) { log.log('Usage: /setuser <name>'); }
    else { username = name; log.log(`Username set: ${username}`); }
    renderStatus(conns); input.focus(); screen.render(); return;
  }

  // Commands: /targets all | /targets 1,2
  if (text.startsWith('/targets ')) {
    const arg = text.slice('/targets '.length);
    const parsed = parseTargets(arg);
    if (parsed === 'all') { sendAll = true; targetIds.clear(); log.log('Targets set to: all'); }
    else if (parsed && Array.isArray(parsed)) { sendAll = false; targetIds = new Set(parsed); log.log(`Targets set to: ${Array.from(targetIds).join(',')}`); }
    else { log.log('Usage: /targets all | /targets 1,2'); }
    renderStatus(conns); input.focus(); screen.render(); return;
  }

  // One-shot prefix: >>1,2 message
  if (text.startsWith('>>')) {
    const m = text.match(/^>>([^\s]+)\s+(.*)$/);
    if (m) {
      const parsed = parseTargets(m[1]);
      const msg = m[2];
      const ids = parsed === 'all' ? conns.map(c=>c.id) : Array.isArray(parsed) ? parsed : [];
      await publishTo(msg, ids);
      input.focus(); screen.render(); return;
    }
  }

  const ids = sendAll ? conns.map(c => c.id) : Array.from(targetIds);
  await publishTo(text, ids);
  input.focus();
  screen.render();
});

screen.key(['C-c'], () => process.exit(0));
input.focus();
renderStatus(conns);
screen.render();
