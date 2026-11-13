// A shopping list that travels to a phone without passing through us.
//
// The whole list is packed into the link itself, after the `#`. Browsers never
// send that part to a server, so avasupernova.com/list draws the list on the
// phone from the link alone: no account, no upload, nothing stored by us, and
// we never see what anyone buys. (Operator, 11 Nov 2026: QR code first,
// WhatsApp as well, Copy as a fallback.)
//
// The format is deliberately tiny and versioned. The phone page decodes it
// with its own copy of `decodeSharedList` (packages/web/src/app/[locale]/list),
// so a change here is a change THERE too — the round-trip test pins both.

export const LIST_URL = 'https://avasupernova.com/list';

/** What the phone needs to draw the list — names and amounts, grouped by aisle
 *  in walking order. Labels arrive already in the sender's language. */
export interface SharedList {
  v: 1;
  /** "Mon 17 – Sun 23 Nov", or a plan's title. */
  title: string;
  /** When it was made (ISO date) — orders the phone's saved lists. */
  made: string;
  groups: Array<{ aisle: string; items: Array<{ n: string; q: string }> }>;
}

/* Compact wire form: arrays, not objects — every byte is QR modules.
   [1, title, made, [[aisle, [[name, qty], ...]], ...]] */
type Wire = [1, string, string, Array<[string, Array<[string, string]>]>];

const toWire = (l: SharedList): Wire => [1, l.title, l.made, l.groups.map((g) => [g.aisle, g.items.map((i) => [i.n, i.q] as [string, string])])];
const fromWire = (w: Wire): SharedList => ({
  v: 1, title: String(w[1] ?? ''), made: String(w[2] ?? ''),
  groups: (w[3] ?? []).map(([aisle, items]) => ({ aisle: String(aisle), items: (items ?? []).map(([n, q]) => ({ n: String(n), q: String(q ?? '') })) })),
});

function b64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function unb64url(s: string): Uint8Array {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Response(new Blob([bytes.slice().buffer as ArrayBuffer]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}

/** The part after `#`: "1." + deflated, base64url JSON. */
export async function encodeSharedList(list: SharedList): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(toWire(list)));
  return '1.' + b64url(await pipe(json, new CompressionStream('deflate-raw')));
}

export async function decodeSharedList(hash: string): Promise<SharedList | null> {
  try {
    const h = hash.replace(/^#/, '');
    if (!h.startsWith('1.')) return null;
    const json = await pipe(unb64url(h.slice(2)), new DecompressionStream('deflate-raw'));
    const w = JSON.parse(new TextDecoder().decode(json)) as Wire;
    return Array.isArray(w) && w[0] === 1 ? fromWire(w) : null;
  } catch {
    return null;
  }
}

export async function sharedListUrl(list: SharedList): Promise<string> {
  return `${LIST_URL}#${await encodeSharedList(list)}`;
}

/** The list as plain text — for Copy, and for the WhatsApp message, where it
 *  must read properly even if nobody opens the link. */
export function sharedListText(list: SharedList, url?: string, openLabel = 'Open with tick boxes'): string {
  const lines = [list.title];
  if (url) lines.push(`${openLabel}: ${url}`);
  for (const g of list.groups) {
    lines.push('', g.aisle.toUpperCase());
    for (const i of g.items) lines.push(`- ${i.n}${i.q ? ` — ${i.q}` : ''}`);
  }
  return lines.join('\n');
}

/** wa.me opens WhatsApp (app, desktop or web) with the message filled in;
 *  the person picks the chat. It goes through WhatsApp, never through us. */
export function whatsAppLink(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}
