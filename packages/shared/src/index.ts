import { schnorr, secp256k1 } from '@noble/curves/secp256k1';
import { sha256 } from '@noble/hashes/sha256';

export type NostrEvent = {
  id: string;
  pubkey: string;
  kind: number;
  created_at: number;
  tags: string[][];
  content: string;
  sig: string;
};

export type NostrFilter = {
  ids?: string[];
  authors?: string[];
  kinds?: number[];
  since?: number;
  until?: number;
  limit?: number;
  '#e'?: string[];
  '#p'?: string[];
};

export type ClientToRelay =
  | ['EVENT', NostrEvent]
  | ['REQ', string, NostrFilter]
  | ['CLOSE', string];

export type RelayToClient =
  | ['EVENT', string, NostrEvent]
  | ['EOSE', string]
  | ['OK', string, boolean, string]
  | ['NOTICE', string];

export function getEventHash(ev: Omit<NostrEvent, 'id' | 'sig'>): string {
  const payload = [0, ev.pubkey, ev.created_at, ev.kind, ev.tags, ev.content];
  const json = JSON.stringify(payload);
  const h = sha256(new TextEncoder().encode(json));
  return Buffer.from(h).toString('hex');
}

export async function signEvent(ev: Omit<NostrEvent, 'id' | 'sig'>, skHex: string): Promise<NostrEvent> {
  const id = getEventHash(ev);
  const sig = Buffer.from(await schnorr.sign(id, skHex)).toString('hex');
  return { ...ev, id, sig } as NostrEvent;
}

export async function verifyEvent(ev: NostrEvent): Promise<boolean> {
  try {
    const { id, sig, pubkey, ...rest } = ev as any;
    const calc = getEventHash({ pubkey, ...rest });
    if (calc !== id) return false;
    return await schnorr.verify(sig, id, pubkey);
  } catch {
    return false;
  }
}

export function getPublicKey(skHex: string): string {
  // noble returns Uint8Array; encode as hex
  const pk = schnorr.getPublicKey(skHex);
  return Buffer.from(pk).toString('hex');
}

export function randomPrivateKeyHex(): string {
  const sk = secp256k1.utils.randomPrivateKey();
  return Buffer.from(sk).toString('hex');
}
