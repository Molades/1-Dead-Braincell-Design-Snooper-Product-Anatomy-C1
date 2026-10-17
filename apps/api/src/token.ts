/**
 * Anonymous install tokens: "v1.<installId>.<signature>". The signature is an HMAC of the
 * install id with a server secret, so tokens cannot be forged and need no database lookup.
 */
const enc = new TextEncoder();
const b64url = (buf: ArrayBuffer) => Buffer.from(buf).toString('base64url');

async function hmac(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(await crypto.subtle.sign('HMAC', key, enc.encode(data)));
}

export async function issueToken(secret: string, installId: string = crypto.randomUUID()): Promise<{ token: string; installId: string }> {
  return { token: `v1.${installId}.${await hmac(secret, installId)}`, installId };
}

/** The install id for a valid token, else null. Constant-time comparison of the signature. */
export async function verifyToken(secret: string, token: string | null | undefined): Promise<string | null> {
  const m = token?.match(/^v1\.([0-9a-f-]{36})\.([A-Za-z0-9_-]+)$/);
  if (!m) return null;
  const expected = await hmac(secret, m[1]!);
  const a = enc.encode(expected), b = enc.encode(m[2]!);
  if (a.length !== b.length) return null;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0 ? m[1]! : null;
}
