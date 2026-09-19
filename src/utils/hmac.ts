async function sha256Hex(data: string): Promise<string> {
  const bytes = new TextEncoder().encode(data);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function signPayload(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function verifyPayload(
  payload: string,
  signature: string,
  secret: string,
): Promise<boolean> {
  const expected = await signPayload(payload, secret);
  if (expected.length !== signature.length) return false;
  let ok = 0;
  for (let i = 0; i < expected.length; i++) {
    ok |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return ok === 0;
}

export async function hashId(value: string): Promise<string> {
  return sha256Hex(value);
}

export interface CallbackPayload {
  gameId: string;
  userId: number;
  action: string;
  targetId?: string;
  target2Id?: string;
}

export async function encodeCallback(
  payload: CallbackPayload,
  secret: string,
): Promise<string> {
  const body = JSON.stringify(payload);
  const sig = (await signPayload(body, secret)).slice(0, 16);
  const packed = `${sig}.${btoa(unescape(encodeURIComponent(body)))}`;
  if (packed.length <= 64) return packed;
  const short: CallbackPayload = {
    gameId: payload.gameId.slice(-10),
    userId: payload.userId,
    action: payload.action,
    targetId: payload.targetId,
    target2Id: payload.target2Id,
  };
  const body2 = JSON.stringify(short);
  const sig2 = (await signPayload(body2, secret)).slice(0, 16);
  return `${sig2}.${btoa(unescape(encodeURIComponent(body2)))}`;
}

export async function decodeCallback(
  data: string,
  secret: string,
  userId: number,
): Promise<CallbackPayload | null> {
  const dot = data.indexOf(".");
  if (dot < 0) return null;
  const sig = data.slice(0, dot);
  const raw = data.slice(dot + 1);
  let json: string;
  try {
    json = decodeURIComponent(escape(atob(raw)));
  } catch {
    return null;
  }
  const expected = (await signPayload(json, secret)).slice(0, 16);
  if (expected !== sig) return null;
  try {
    const parsed = JSON.parse(json) as CallbackPayload;
    if (parsed.userId !== userId) return null;
    return parsed;
  } catch {
    return null;
  }
}
