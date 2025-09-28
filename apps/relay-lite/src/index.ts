import Fastify from 'fastify';
import cors from '@fastify/cors';
import { WebSocket, WebSocketServer } from 'ws';
import blessed from 'blessed';
import { verifyEvent, type NostrEvent, type NostrFilter, type RelayToClient } from '@tesseract-demo/shared';

// ---------------- Host TUI ----------------
let screen: blessed.Widgets.Screen | null = null;
let feed: blessed.Widgets.Log | null = null;

function initTUI(ports: number[]) {
  if (screen) return;
  screen = blessed.screen({ smartCSR: true, title: 'Relay Lite (Host)' });
  feed = blessed.log({ top: 0, left: 0, width: '100%', height: '100%', border: 'line', label: `Host Feed (ports: ${ports.join(',')})` });
  screen.append(feed);
  feed.log('Host ready. Waiting for messages…');
  screen.key(['C-c', 'q'], () => process.exit(0));
  screen.render();
}

function renderEvent(ev: NostrEvent, port: number) {
  if (!screen || !feed) return;
  const ts = new Date(ev.created_at * 1000).toLocaleTimeString();
  const short = (ev.pubkey || '').slice(0, 8);
  const content = (ev.content || '').replace(/\s+/g, ' ').trim();
  feed!.log(`[${ts}][${port}] ${short}: ${content}`);
  screen!.render();
}

// Simple filter matching (shared)
type Sub = { id: string; filter: NostrFilter };
function matches(ev: NostrEvent, f: NostrFilter): boolean {
  if (f.ids && !f.ids.includes(ev.id)) return false;
  if (f.authors && !f.authors.includes(ev.pubkey)) return false;
  if (f.kinds && !f.kinds.includes(ev.kind)) return false;
  if (f.since && ev.created_at < f.since) return false;
  if (f.until && ev.created_at > f.until) return false;
  if (f['#e']) {
    const eTags = ev.tags.filter(t => t[0] === 'e').map(t => t[1]);
    if (!f['#e'].some(id => eTags.includes(id))) return false;
  }
  if (f['#p']) {
    const pTags = ev.tags.filter(t => t[0] === 'p').map(t => t[1]);
    if (!f['#p'].some(pk => pTags.includes(pk))) return false;
  }
  return true;
}

function createRelay(PORT: number, HOST: string) {
  const server = Fastify({ logger: false });
  server.register(cors, { origin: true });

  // In-memory store per instance
  const MAX_EVENTS = 5000;
  const events: NostrEvent[] = [];
  const seen = new Set<string>();

server.get('/', async () => ({
  name: 'Tesseract Relay Lite',
  description: 'Minimal NIP-01 relay (in-memory)',
  software: 'tesseract/relay-lite',
  supported_nips: [1, 11]
}));

server.get('/health', async () => ({ status: 'ok' }));

// WebSocket endpoint
  const wss = new WebSocketServer({ noServer: true });
  wss.on('connection', (ws: WebSocket) => {
  const subs = new Map<string, Sub>();
  ws.on('message', async (buffer: Buffer) => {
    let msg: any;
    try { msg = JSON.parse(buffer.toString()); } catch { ws.send(JSON.stringify(['NOTICE', 'invalid json'] as RelayToClient)); return; }
    const t = msg[0];
    if (t === 'EVENT') {
      const ev: NostrEvent = msg[1];
      if (!ev || !ev.id || !ev.sig) { ws.send(JSON.stringify(['OK', ev?.id ?? '', false, 'invalid event'] as RelayToClient)); return; }
      const valid = await verifyEvent(ev);
      if (!valid) {
        server.log.info({ id: ev.id, pubkey: ev.pubkey, kind: ev.kind }, 'event-rejected-invalid');
        ws.send(JSON.stringify(['OK', ev.id, false, 'invalid'] as RelayToClient));
        return;
      }
      if (!seen.has(ev.id)) {
        seen.add(ev.id); events.push(ev);
        if (events.length > MAX_EVENTS) { const drop = events.length - MAX_EVENTS; events.splice(0, drop); }
        renderEvent(ev, PORT);
      }
  // Server-side visibility handled by TUI
      for (const [_id, s] of subs) if (matches(ev, s.filter)) ws.send(JSON.stringify(['EVENT', s.id, ev] as RelayToClient));
      ws.send(JSON.stringify(['OK', ev.id, true, ''] as RelayToClient));
    } else if (t === 'REQ') {
      const subId: string = msg[1];
      const filter: NostrFilter = msg[2] ?? {};
      subs.set(subId, { id: subId, filter });
      const limit = filter.limit && Number.isFinite(filter.limit) ? Math.min(500, filter.limit) : 300;
      const list = events.filter((e) => matches(e, filter));
      const slice = list.slice(-limit);
      for (const e of slice) ws.send(JSON.stringify(['EVENT', subId, e] as RelayToClient));
      ws.send(JSON.stringify(['EOSE', subId] as RelayToClient));
    } else if (t === 'CLOSE') {
      const subId: string = msg[1];
      subs.delete(subId);
    } else {
      ws.send(JSON.stringify(['NOTICE', `unknown type: ${t}`] as RelayToClient));
    }
  });
  ws.on('close', () => { /* quiet */ });
  });

  // Upgrade handler binds WS server to /ws
  server.server.on('upgrade', (request, socket, head) => {
  const url = request.url || '/';
  const path = url.split('?')[0];
  if (path === '/ws' || path === '/') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request as any);
    });
  } else {
    socket.destroy();
  }
  });

  return server;
}

// Entrypoint: support --ports=4000,4100 or single PORT env/flag
const HOST = process.env.HOST || '0.0.0.0';
let ports: number[] = [];
for (const arg of process.argv.slice(2)) {
  if (arg.startsWith('--port=')) {
    const p = parseInt(arg.split('=')[1], 10); if (!Number.isNaN(p)) ports = [p];
  } else if (arg.startsWith('--ports=')) {
    const list = arg.split('=')[1];
    ports = list.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !Number.isNaN(n));
  }
}
if (!ports.length) {
  const envPort = parseInt(process.env.PORT || '4000', 10);
  ports = [envPort];
}

initTUI(ports);
for (const p of ports) {
  const server = createRelay(p, HOST);
  server.listen({ port: p, host: HOST }, (err: any, addr: any) => {
    if (err) { console.error(err); process.exit(1); }
    console.log(`Relay-lite listening on ${addr}`);
  });
}
