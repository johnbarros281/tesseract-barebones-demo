import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import type { WebSocket } from 'ws';
import { verifyEvent, type NostrEvent, type NostrFilter, type RelayToClient } from '@tesseract-demo/shared';

const server = Fastify({ logger: true });
server.register(cors, { origin: true });
server.register(websocket);

// In-memory store
const MAX_EVENTS = 5000;
const events: NostrEvent[] = [];
const seen = new Set<string>();

type Sub = { id: string; filter: NostrFilter };

// Simple filter matching
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

server.get('/', async () => ({
  name: 'Tesseract Relay Lite',
  description: 'Minimal NIP-01 relay (in-memory)',
  software: 'tesseract/relay-lite',
  supported_nips: [1, 11]
}));

server.get('/health', async () => ({ status: 'ok' }));

// WebSocket endpoint
server.get('/ws', { websocket: true }, (conn: any, _req: any) => {
  const ws: WebSocket = conn.socket as WebSocket;
  const subs = new Map<string, Sub>();
  ws.on('message', async (buffer: Buffer) => {
  let msg: any;
  try { msg = JSON.parse(buffer.toString()); } catch { ws.send(JSON.stringify(['NOTICE', 'invalid json'] as RelayToClient)); return; }
    const t = msg[0];
    if (t === 'EVENT') {
      const ev: NostrEvent = msg[1];
      if (!ev || !ev.id || !ev.sig) { ws.send(JSON.stringify(['OK', ev?.id ?? '', false, 'invalid event'] as RelayToClient)); return; }
      const valid = await verifyEvent(ev);
      if (!valid) { ws.send(JSON.stringify(['OK', ev.id, false, 'invalid'] as RelayToClient)); return; }
      if (!seen.has(ev.id)) {
        seen.add(ev.id); events.push(ev);
        if (events.length > MAX_EVENTS) { const drop = events.length - MAX_EVENTS; events.splice(0, drop); }
      }
      // Broadcast to matching subs
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
});

const PORT = parseInt(process.env.PORT || '4000', 10);
const HOST = process.env.HOST || '0.0.0.0';

server.listen({ port: PORT, host: HOST }, (err, addr) => {
  if (err) { console.error(err); process.exit(1); }
  console.log(`Relay-lite listening on ${addr}`);
});
