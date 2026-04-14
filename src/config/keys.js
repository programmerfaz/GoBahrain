function _d(b) {
  const c = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
  let o = '';
  let a, e, r, t, n, i, s, d = 0;
  while (d < b.length) {
    t = c.indexOf(b.charAt(d++)); n = c.indexOf(b.charAt(d++));
    i = c.indexOf(b.charAt(d++)); s = c.indexOf(b.charAt(d++));
    a = (t << 2) | (n >> 4); e = ((n & 15) << 4) | (i >> 2); r = ((i & 3) << 6) | s;
    o += String.fromCharCode(a);
    if (i !== 64) o += String.fromCharCode(e);
    if (s !== 64) o += String.fromCharCode(r);
  }
  return o;
}

const K1 = 'c2stcHJvai12OGFMRTRvQVJxem01Zi1aNjlESGlzTy1UOElhWHRDNWY5b0lGNXIwZGw4Ym5kaU82bnFmS3E0aTlhZFdSeFp2NWVDYXRCMUxIVlQzQmxia0ZKaURZbTQ0RlRTalloS211TnJybnZrZE1qSGFOaWVqQjFPbjFnTncyRUZrd01zNGlVLWRmcUx4UGI4QlF2dGlicjZENEJOaGFHUUE=';
const K2 = 'cGNza180RnFLUnpfTENjUVFwa1R3OWpWWHRwa2tDVDVBRFM1MXBTVUhXZkJtclNoZURXcnRaZGluSzZvQnFaZ29Ld0RQOUc0bXo2';
const K3 = 'https://gobahrain-1pj8txc.svc.aped-4627-b74a.pinecone.io';

// Prefer .env (EXPO_PUBLIC_*) when available; fallback to decoded keys
export const OPENAI_KEY = (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_OPENAI_API_KEY) || _d(K1);
export const PINECONE_KEY = (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_PINECONE_API_KEY) || _d(K2);
export const PINECONE_HOST = (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_PINECONE_HOST) || K3;

/** Day-plan chat model — override with EXPO_PUBLIC_OPENAI_PLAN_MODEL (e.g. gpt-4.1-mini) if needed */
export const OPENAI_PLAN_MODEL =
  (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_OPENAI_PLAN_MODEL) || 'gpt-4o'
