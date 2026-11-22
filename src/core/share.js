/* A whole flat packed into a link: https://…/flatPlanner/#/add/<payload>.
   The payload is the flat file's JSON, compressed (deflate) and base64url-encoded,
   with a leading "z". Opening the link asks before adding the flat. Pictures stored in
   the browser don't travel in a link; listing photos and the floorplan travel as their
   web addresses. Works in browsers and in Node 18+ (CompressionStream). */

const toB64u = (bytes) => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromB64u = (s) => {
  let t = s.replace(/-/g, '+').replace(/_/g, '/');
  while (t.length % 4) t += '=';
  const bin = atob(t), out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};
const pipe = async (bytes, stream) => new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());

export const LINK_ROUTE = '#/add/';

export async function packFlat(fileObj) {
  const json = new TextEncoder().encode(JSON.stringify(fileObj));
  return 'z' + toB64u(await pipe(json, new CompressionStream('deflate-raw')));
}

export async function unpackFlat(payload) {
  const p = String(payload || '').trim();
  if (!p) throw new Error('Empty link');
  const bytes = p[0] === 'z' ? await pipe(fromB64u(p.slice(1)), new DecompressionStream('deflate-raw')) : fromB64u(p);
  return JSON.parse(new TextDecoder().decode(bytes));
}

/** The link for a flat file, on the site at base (e.g. https://name.github.io/flatPlanner/). */
export async function flatLink(fileObj, base) {
  return base.replace(/#.*$/, '') + LINK_ROUTE + (await packFlat(fileObj));
}
